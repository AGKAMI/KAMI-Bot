/**
 * Song Downloader - Download audio from YouTube via yt-dlp
 * No API key needed — uses yt-dlp binary directly
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const yts = require('yt-search');
const config = require('../../config');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');

const YTDL_PATH = '/home/container/.local/bin/yt-dlp';

// Cap the in-RAM audio read — yt-dlp streams to disk, but readFileSync of an
// unbounded file is the OOM vector left on a 256MB box.
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;

let activeAudioDownloads = 0;

module.exports = {
  name: 'song',
  reactions: { received: '🎵', generating: '⬇️', done: '🎶' },
  aliases: ['play', 'music', 'yta'],
  category: 'media',
  description: 'Download audio from YouTube (yt-dlp, no API key needed)',
  usage: '.song <song name or YouTube link>',

  async execute(sock, msg, args, extra) {
    const prefix = config.prefix || '.';
    activeAudioDownloads++;
    try {
      if (activeAudioDownloads > 2) {
        extra.fail();
        return await extra.reply(`❌ _too many downloads — give it a few seconds_`);
      }
      const text = args.join(' ');
      const chatId = msg.key.remoteJid;

      if (!text) {
        return await extra.reply(`📝 _${voice.lead('neutral')}, give me a song name or YouTube link_\n\n_Example:_ ${prefix}song Shape of You`);
      }

      const sent = await extra.reply(`🔍 _searching for that one..._`);
      if (!sent?.key) { extra.fail(); return extra.reply(`❌ _${voice.openErr()} — failed to send loading message_`); }

      let video;

      if (text.includes('youtube.com') || text.includes('youtu.be')) {
        video = { url: text, title: text, timestamp: '' };
      } else {
        const search = await yts(text);
        if (!search || !search.videos.length) {
          extra.fail();
          return await extra.edit(sent.key, `❌ _${voice.openErr()}, nothing found for that one_`);
        }
        video = search.videos[0];
      }

      await extra.edit(sent.key, `🎵 *Downloading:* ${video.title}\n⏱ *Duration:* ${video.timestamp}`);

      let audioFile;
      try {
        audioFile = await downloadAudio(video.url);
      } catch (err) {
        console.error('[song] yt-dlp failed:', err.message);
        extra.fail();
        return await extra.edit(sent.key, `❌ _${voice.openErr()} — download failed — try again_`);
      }

      let audioBuffer;
      try {
        // Cap the read — the box has 256MB total and a long track at
        // audio-quality 0 can blow past that if buffered whole.
        const audioSize = fs.statSync(audioFile).size;
        if (audioSize > MAX_AUDIO_BYTES) {
          fs.unlinkSync(audioFile);
          throw new Error(`audio too large (${Math.round(audioSize / 1048576)}MB > ${MAX_AUDIO_BYTES / 1048576}MB)`);
        }
        audioBuffer = fs.readFileSync(audioFile);
        fs.unlinkSync(audioFile); // delete temp file after reading
      } catch (dlErr) {
        extra.fail();
        return await extra.edit(sent.key, `❌ _${voice.openErr()} — read failed: ${dlErr.message}_`);
      }

      if (!audioBuffer || audioBuffer.length === 0) {
        extra.fail();
        return await extra.edit(sent.key, `❌ _empty audio buffer_`);
      }

      await sock.sendMessage(chatId, {
        audio: audioBuffer,
        mimetype: 'audio/mpeg',
        fileName: `${(video.title || 'song').replace(/[^\w\s-]/g, '')}.mp3`,
        ptt: false
      }, { quoted: msg });

      await extra.edit(sent.key, `✅ *Sent!* _${video.title}_`);

    } catch (err) {
      console.error('Song command error:', err);
      extra.fail();
      await extra.reply(`❌ _${voice.openErr()} — something went wrong — try again_`);
    } finally {
      activeAudioDownloads--;
    }
  }
};

async function downloadAudio(url) {
  const tmpFile = path.join(__dirname, `../../temp/song_${Date.now()}.mp3`);
  return new Promise((resolve, reject) => {
    execFile(YTDL_PATH, [
      url,
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--output', tmpFile,
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificate',
      '--retries', '3',
      '--fragment-retries', '3'
    ], { timeout: 120000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(err.message || stderr || 'yt-dlp failed'));
        return;
      }
      if (!fs.existsSync(tmpFile)) {
        reject(new Error('yt-dlp did not produce output file'));
        return;
      }
      resolve(tmpFile);
    });
  });
}