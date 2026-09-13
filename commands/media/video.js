/**
 * Video Downloader - Download video from YouTube
 */

const yts = require('yt-search');
const axios = require('axios');
const APIs = require('../../utils/api');

const processedMessages = new Set();

module.exports = {
  name: 'ytvideo',
  aliases: ['ytv', 'ytmp4', 'ytvid', 'video'],
  category: 'media',
  description: 'Download video from YouTube',
  usage: '.video <YouTube URL or search>',

  async execute(sock, msg, args, extra) {
    try {
      if (processedMessages.has(msg.key.id)) return;
      processedMessages.add(msg.key.id);
      setTimeout(() => processedMessages.delete(msg.key.id), 5 * 60 * 1000);

      const text = (msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        args.join(' ')).trim();

      if (!text) {
        return extra.reply('What video do you want to download?');
      }

      let videoUrl = text;
      let videoTitle = '';

      // If not a URL, search with yt-search
      if (!text.startsWith('http://') && !text.startsWith('https://')) {
        try {
          const { videos } = await yts(text);
          if (!videos || videos.length === 0) {
            return extra.reply('No videos found!');
          }
          videoUrl = videos[0].url;
          videoTitle = videos[0].title;
        } catch (e) {
          return extra.reply('Search failed: ' + e.message);
        }
      }

      const patterns = [
        /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=/,
        /https?:\/\/youtu\.be\//,
        /https?:\/\/(?:www\.)?youtube\.com\/shorts\//,
      ];
      if (!patterns.some(p => p.test(videoUrl))) {
        return extra.reply('❌ invalid youtube link\nuse: .video <youtube url or search>');
      }

      await extra.react('🔄');

      // Use loader.to API for video download
      let videoData;
      try {
        const APIs = require('../../utils/api');
        videoData = await APIs.ytDownload(videoUrl, 'video');
      } catch (err) {
        console.log('[VIDEO] download failed:', err.message);
        return extra.reply(`❌ Download failed: ${err.message}`);
      }

      const videoDlUrl = videoData.download;
      if (!videoDlUrl) {
        return extra.reply('❌ No download URL received');
      }

      const caption = `*DOWNLOADED BY KAMI BOT*\n\n${videoData.title ? '📝 ' + videoData.title : ''}`;
      let sendSuccess = false;

      // Method 1: direct URL
      try {
        await sock.sendMessage(extra.from, {
          video: { url: videoDlUrl },
          caption,
        }, { quoted: msg });
        sendSuccess = true;
      } catch (e1) {
        // Method 2: download buffer
        try {
          const videoResponse = await axios.get(videoDlUrl, {
            responseType: 'arraybuffer',
            timeout: 120000,
            maxContentLength: 50 * 1024 * 1024,
          });
          const buffer = Buffer.from(videoResponse.data);
          await sock.sendMessage(extra.from, {
            video: buffer,
            mimetype: 'video/mp4',
            caption,
          }, { quoted: msg });
          sendSuccess = true;
        } catch (e2) {
          console.log('[VIDEO] buffer download failed:', e2.message);
        }
      }

      if (!sendSuccess) {
        return extra.reply('❌ Could not download the video. Try a shorter video.');
      }

      await extra.react('✅');
    } catch (error) {
      console.error('[VIDEO] Error:', error.message || error);
      await extra.react('❌');
      await extra.reply('❌ Error: ' + (error.message || 'try again later'));
    }
  }
};