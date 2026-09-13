/**
 * Video Downloader - Download video from YouTube
 * Primary: yt-dlp (system binary), Fallback: public APIs
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const axios = require('axios');
const config = require('../../config');

const processedMessages = new Set();

async function fetchWithYtDlp(url) {
  try {
    const ytDlpCmd = config.ytDlpPath || 'yt-dlp';
    const { stdout } = await execPromise(`${ytDlpCmd} -g -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" "${url}"`, {
      maxBuffer: 5 * 1024 * 1024,
      timeout: 60000,
    });
    const videoUrl = stdout.trim().split('\n').pop();
    if (!videoUrl) throw new Error('yt-dlp returned empty URL');
    const { stdout: titleOut } = await execPromise(`${ytDlpCmd} --get-title "${url}"`, {
      maxBuffer: 1024 * 1024,
      timeout: 30000,
    });
    return { url: videoUrl, title: titleOut.trim() || 'YouTube Video' };
  } catch (err) {
    throw new Error('yt-dlp failed: ' + err.message);
  }
}

async function fetchFromApi(url) {
  const endpoints = [
    `https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(url)}`,
    `https://api.ryzendesu.vip/api/downloader/youtube?url=${encodeURIComponent(url)}`,
    `https://api.akuari.my.id/downloader/youtube?url=${encodeURIComponent(url)}`,
  ];
  for (const ep of endpoints) {
    try {
      const res = await axios.get(ep, { timeout: 30000 });
      const d = res.data;
      if (d?.data?.url || d?.result?.url || d?.url) {
        return {
          url: d.data?.url || d.result?.url || d.url,
          title: d.data?.title || d.result?.title || d.title || 'YouTube Video',
        };
      }
    } catch (e) {
      continue;
    }
  }
  throw new Error('All APIs returned empty');
}

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
          const yts = require('yt-search');
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

      // YouTube video download is currently unavailable
      return extra.reply('❌ YouTube video download is temporarily unavailable. No working API found. Try again later.');

      const caption = `*DOWNLOADED BY KAMI BOT*\n\n${videoData.title ? '📝 ' + videoData.title : ''}`;
      let sendSuccess = false;

      // Method 1: direct URL
      try {
        console.log('[VIDEO] Method 1 direct URL');
        await sock.sendMessage(extra.from, {
          video: { url: videoData.url },
          caption,
        }, { quoted: msg });
        sendSuccess = true;
      } catch (e1) {
        console.log('[VIDEO] Method 1 failed:', e1.message);
        // Method 2: download buffer (500MB limit)
        try {
          console.log('[VIDEO] Method 2 buffer');
          const videoResponse = await axios.get(videoData.url, {
            responseType: 'arraybuffer',
            timeout: 120000,
            maxContentLength: 500 * 1024 * 1024,
            proxy: false,
          });
          const buffer = Buffer.from(videoResponse.data);
          await sock.sendMessage(extra.from, {
            video: buffer,
            mimetype: 'video/mp4',
            caption,
          }, { quoted: msg });
          sendSuccess = true;
        } catch (e2) {
          console.log('[VIDEO] Method 2 failed:', e2.message);
        }
      }

      if (!sendSuccess) {
        return extra.reply(
          '❌ could not download the video\n\nThe file might be too large for WhatsApp (>100MB).\nTry:\n• A shorter video\n• Using browser to download manually'
        );
      }

      await extra.react('✅');
    } catch (error) {
      console.error('[VIDEO] Error:', error.message || error);
      await extra.react('❌');
      await extra.reply('❌ Error: ' + (error.message || 'try again later'));
    }
  }
};