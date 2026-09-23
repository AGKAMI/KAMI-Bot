/**
 * Song Downloader - Download audio from YouTube
 */

const yts = require('yt-search');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const APIs = require('../../utils/api');
const config = require('../../config');
const { toAudio } = require('../../utils/converter');
const { bold, italic, pick, SLANG } = require('../../utils/format');

const AXIOS_DEFAULTS = {
  timeout: 60000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
  }
};

let activeAudioDownloads = 0;

module.exports = {
  name: 'song',
  aliases: ['play', 'music', 'yta'],
  category: 'media',
  description: 'Download audio from YouTube',
  usage: '.song <song name or YouTube link>',
  
  async execute(sock, msg, args, extra) {
    const prefix = config.prefix || '.';
    if (activeAudioDownloads >= 2) {
      return await extra.reply(`❌ _too many downloads — try again in a few seconds_`);
    }
    activeAudioDownloads++;
    try {
      const text = args.join(' ');
      const chatId = msg.key.remoteJid;
      
      if (!text) {
        return await extra.reply(`📝 _${pick(SLANG.vibe)}, give me a song name or YouTube link_\n\n_Example:_ ${prefix}song Shape of You`);
      }
      
      // Send loading message
      const sent = await extra.reply(`🔍 _searching for that one..._`);
      if (!sent?.key) return extra.reply(`❌ _${pick(SLANG.error)} — failed to send loading message_`);
      
      let video;
      
      if (text.includes('youtube.com') || text.includes('youtu.be')) {
        video = { url: text };
      } else {
        const search = await yts(text);
        if (!search || !search.videos.length) {
          return await extra.edit(sent.key, `❌ _${pick(SLANG.error)}, no results found for that one_`);
        }
        video = search.videos[0];
      }
      
      // Edit to show downloading status
      await extra.edit(sent.key, `🎵 *Downloading:* ${video.title}\n⏱ *Duration:* ${video.timestamp}`);
      
      // Try loader.to API
      let audioData;
      try {
        audioData = await APIs.ytDownload(video.url, 'audio');
      } catch (err) {
        console.log('YouTube download failed:', err.message);
        return await extra.edit(sent.key, `❌ _${pick(SLANG.error)} — failed to download: ${err.message}_`);
      }
      
      const audioUrl = audioData.download;
      if (!audioUrl) {
        return await extra.edit(sent.key, `❌ _${pick(SLANG.error)}, no download URL received_`);
      }
      
      // Download the audio file
      let audioBuffer;
      try {
        const audioResponse = await axios.get(audioUrl, {
          responseType: 'arraybuffer',
          timeout: 120000,
          maxContentLength: 50 * 1024 * 1024,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Referer': 'https://loader.to/',
          }
        });
        audioBuffer = Buffer.from(audioResponse.data);
        
        if (!audioBuffer || audioBuffer.length === 0) {
          throw new Error('Empty audio buffer');
        }
      } catch (dlErr) {
        return await extra.edit(sent.key, `❌ _download failed hey — ${dlErr.message}_`);
      }

      // Send audio
      await sock.sendMessage(chatId, {
        audio: audioBuffer,
        mimetype: 'audio/mpeg',
        fileName: `${(audioData.title || video.title || 'song').replace(/[^\w\s-]/g, '')}.mp3`,
        ptt: false
      }, { quoted: msg });
      
      // Edit status to done
      await extra.edit(sent.key, `✅ *Sent!* _${video.title}_`);
      
    } catch (err) {
      console.error('Song command error:', err);
      await extra.reply(`❌ _${pick(SLANG.error)} — something went stukkend — ${err.message}_`);
    } finally {
      activeAudioDownloads--;
    }
  }
};
