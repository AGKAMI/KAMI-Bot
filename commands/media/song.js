/**
 * Song Downloader - Download audio from YouTube
 */

const yts = require('yt-search');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const APIs = require('../../utils/api');
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
  
  async execute(sock, msg, args) {
    if (activeAudioDownloads >= 2) {
      return await sock.sendMessage(msg.key.remoteJid, {
        text: `❌ _too many downloads — try again in a few seconds_`
      }, { quoted: msg });
    }
    activeAudioDownloads++;
    try {
      const text = args.join(' ');
      const chatId = msg.key.remoteJid;
      
      if (!text) {
        return await sock.sendMessage(chatId, { 
          text: `📝 _${pick(SLANG.vibe)}, give me a song name or YouTube link_\n\n_Example:_ .song Shape of You` 
        }, { quoted: msg });
      }
      
      let video;
      
      if (text.includes('youtube.com') || text.includes('youtu.be')) {
        video = { url: text };
      } else {
        const search = await yts(text);
        if (!search || !search.videos.length) {
          return await sock.sendMessage(chatId, { 
            text: `❌ _${pick(SLANG.error)}, no results found for that one_`
          }, { quoted: msg });
        }
        video = search.videos[0];
      }
      
      // Inform user
      await sock.sendMessage(chatId, {
        image: { url: video.thumbnail },
        caption: `🎵 Downloading: *${video.title}*\n⏱ Duration: ${video.timestamp}`
      }, { quoted: msg });
      
      // Try loader.to API
      let audioData;
      try {
        audioData = await APIs.ytDownload(video.url, 'audio');
      } catch (err) {
        console.log('YouTube download failed:', err.message);
        return await sock.sendMessage(chatId, { 
          text: `❌ _${pick(SLANG.error)} — failed to download: ${err.message}_`
        }, { quoted: msg });
      }
      
      const audioUrl = audioData.download;
      if (!audioUrl) {
        return await sock.sendMessage(chatId, { 
          text: `❌ _${pick(SLANG.error)}, no download URL received_`
        }, { quoted: msg });
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
            'Accept': '*/*'
          }
        });
        audioBuffer = Buffer.from(audioResponse.data);
        
        if (!audioBuffer || audioBuffer.length === 0) {
          throw new Error('Empty audio buffer');
        }
      } catch (dlErr) {
        return await sock.sendMessage(chatId, { 
          text: `❌ _download failed hey — ${dlErr.message}_`
        }, { quoted: msg });
      }

      // Send audio
      await sock.sendMessage(chatId, {
        audio: audioBuffer,
        mimetype: 'audio/mpeg',
        fileName: `${(audioData.title || video.title || 'song').replace(/[^\w\s-]/g, '')}.mp3`,
        ptt: false
      }, { quoted: msg });
      
    } catch (err) {
      console.error('Song command error:', err);
      await sock.sendMessage(msg.key.remoteJid, { 
        text: `❌ _${pick(SLANG.error)} — something went stukkend — ${err.message}_`
      }, { quoted: msg });
    } finally {
      activeAudioDownloads--;
    }
  }
};
