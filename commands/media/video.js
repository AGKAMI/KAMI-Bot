const yts = require('yt-search');
const axios = require('axios');
const APIs = require('../../utils/api');

const processedMessages = new Set();
const MAX_SIZE_MB = 16;

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

      const text = args.join(' ').trim();
      if (!text) return extra.reply('What video do you want to download?');

      let videoUrl = text;
      let videoTitle = '';

      if (!text.startsWith('http://') && !text.startsWith('https://')) {
        try {
          const { videos } = await yts(text);
          if (!videos || videos.length === 0) return extra.reply('No videos found!');
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
        return extra.reply('Invalid YouTube link\nUse: .video <url or search>');
      }

      await extra.react('🔄');

      let videoData;
      try {
        videoData = await APIs.ytDownload(videoUrl, 'video');
      } catch (err) {
        return extra.reply('Download failed: ' + err.message);
      }

      if (!videoData.download) return extra.reply('No download URL received');

      const caption = '*DOWNLOADED BY KAMI BOT*\n\n' + (videoData.title ? '📝 ' + videoData.title : '');

      // Download buffer
      let videoBuffer;
      try {
        const res = await axios.get(videoData.download, {
          responseType: 'arraybuffer',
          timeout: 180000,
          maxContentLength: 50 * 1024 * 1024,
        });
        videoBuffer = Buffer.from(res.data);
        if (!videoBuffer || videoBuffer.length === 0) throw new Error('Empty buffer');
      } catch (dlErr) {
        return extra.reply('Download failed: ' + dlErr.message);
      }

      const sizeMB = videoBuffer.length / (1024 * 1024);
      if (sizeMB > MAX_SIZE_MB) {
        return extra.reply('Video too large (' + sizeMB.toFixed(1) + 'MB). WhatsApp limit is 16MB.');
      }

      // Try re-encode with ffmpeg for WhatsApp compatibility
      let sendBuffer = videoBuffer;
      let sendMime = 'video/mp4';
      try {
        const { toVideo } = require('../../utils/converter');
        sendBuffer = await toVideo(videoBuffer, 'mp4');
        console.log('[VIDEO] re-encoded successfully');
      } catch (encErr) {
        console.log('[VIDEO] encode skipped:', encErr?.message || encErr);
        // Send raw - may not be forwardable but won't crash
        sendMime = 'video/mp4';
      }

      await sock.sendMessage(extra.from, {
        video: sendBuffer,
        mimetype: sendMime,
        caption,
      }, { quoted: msg });

      await extra.react('✅');
    } catch (error) {
      console.error('[VIDEO] Error:', error?.message || error);
      try { await extra.react('❌'); } catch (_) {}
      try { await extra.reply('Error: ' + (error?.message || 'try again')); } catch (_) {}
    }
  }
};
