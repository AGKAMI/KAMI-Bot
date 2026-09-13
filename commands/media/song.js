/**
 * Song Downloader - Download audio from YouTube
 */

const yts = require('yt-search');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const APIs = require('../../utils/api');
const { toAudio } = require('../../utils/converter');

const AXIOS_DEFAULTS = {
  timeout: 60000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
  }
};

module.exports = {
  name: 'song',
  aliases: ['play', 'music', 'yta'],
  category: 'media',
  description: 'Download audio from YouTube',
  usage: '.song <song name or YouTube link>',
  
  async execute(sock, msg, args) {
    try {
      const text = args.join(' ');
      const chatId = msg.key.remoteJid;
      
      if (!text) {
        return await sock.sendMessage(chatId, { 
          text: 'Usage: .song <song name or YouTube link>' 
        }, { quoted: msg });
      }
      
      let video;
      
      if (text.includes('youtube.com') || text.includes('youtu.be')) {
        video = { url: text };
      } else {
        const search = await yts(text);
        if (!search || !search.videos.length) {
          return await sock.sendMessage(chatId, { 
            text: 'No results found.' 
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
          text: `❌ Failed to download: ${err.message}` 
        }, { quoted: msg });
      }
      
      const audioUrl = audioData.download;
      if (!audioUrl) {
        return await sock.sendMessage(chatId, { 
          text: '❌ No download URL received' 
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
          text: `❌ Failed to download audio file: ${dlErr.message}` 
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
        text: `❌ Download failed: ${err.message}` 
      }, { quoted: msg });
    }
  }
};
