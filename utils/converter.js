/**
 * KAMI Bot - A WhatsApp Bot
 * Copyright (c) 2026 AG KAMI
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 * 
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by TechGod143 & DGXEON
 */
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

// Find ffmpeg binary - try static first, then system
let ffmpegPath = 'ffmpeg'
try {
  const staticPath = require('ffmpeg-static')
  if (staticPath && fs.existsSync(staticPath)) {
    ffmpegPath = staticPath
  }
} catch (_) {
  // ffmpeg-static not available, use system ffmpeg
}

function ffmpeg(buffer, args = [], ext = '', ext2 = '') {
  return new Promise(async (resolve, reject) => {
    try {
      const tempDir = path.join(__dirname, '../temp')
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }
      let tmp = path.join(tempDir, Date.now() + '.' + ext)
      let out = tmp + '.' + ext2
      await fs.promises.writeFile(tmp, buffer)
      const cleanup = async () => {
        // A failed convert used to leave the input behind — those piles of
        // leftover temp files are what filled /temp and blocked deploys.
        await fs.promises.unlink(tmp).catch(() => {})
        await fs.promises.unlink(out).catch(() => {})
      }
      spawn(ffmpegPath, [
        '-y',
        '-i', tmp,
        ...args,
        out
      ])
        .on('error', async (e) => { await cleanup(); reject(e) })
        .on('close', async (code) => {
          try {
            await fs.promises.unlink(tmp).catch(() => {})
            if (code !== 0) {
              await fs.promises.unlink(out).catch(() => {})
              return reject(code)
            }
            const data = await fs.promises.readFile(out)
            await fs.promises.unlink(out).catch(() => {})
            resolve(data)
          } catch (e) {
            await cleanup()
            reject(e)
          }
        })
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * Convert Audio to Playable WhatsApp Audio
 * @param {Buffer} buffer Audio Buffer
 * @param {String} ext File Extension 
 */
function toAudio(buffer, ext) {
  return ffmpeg(buffer, [
    '-vn',
    '-ac', '2',
    '-b:a', '128k',
    '-ar', '44100',
    '-f', 'mp3'
  ], ext, 'mp3')
}

/**
 * Convert Audio to Playable WhatsApp PTT
 * @param {Buffer} buffer Audio Buffer
 * @param {String} ext File Extension 
 */
function toPTT(buffer, ext) {
  return ffmpeg(buffer, [
    '-vn',
    '-c:a', 'libopus',
    '-b:a', '128k',
    '-vbr', 'on',
    '-compression_level', '10'
  ], ext, 'opus')
}

/**
 * Convert Audio to Playable WhatsApp Video
 *
 * Tuned for the 1GB container: x264 `-preset slow` with unbounded resolution
 * is what OOM-killed the bot (exit 137) on `.ytv`. ultrafast + one thread +
 * a 720p ceiling keeps the encode inside the memory cap.
 *
 * @param {Buffer} buffer Video Buffer
 * @param {String} ext File Extension
 */
function toVideo(buffer, ext) {
  return ffmpeg(buffer, [
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-ab', '128k',
    '-ar', '44100',
    '-crf', '32',
    '-preset', 'ultrafast',
    '-threads', '1',
    '-vf', 'scale=-2:trunc(min(720\\,ih)/2)*2',
    '-movflags', '+faststart'
  ], ext, 'mp4')
}

module.exports = {
  toAudio,
  toPTT,
  toVideo,
  ffmpeg,
}