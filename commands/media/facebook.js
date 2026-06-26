/**
 * Facebook Downloader - Download Facebook videos
 */

/* eslint-disable */

const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const config = require('../../config');

const processedMessages = new Set();

async function fetchWithYtDlp(url) {
  try {
    const { stdout } = await execPromise(`"C:\Users\ojuni\AppData\Local\hermes\hermes-agent\venv\Scripts\yt-dlp.exe" -g -f best "${url}"`, {
      maxBuffer: 5 * 1024 * 1024,
      timeout: 60000,
    });
    const videoUrl = stdout.trim().split('\n').pop();
    if (!videoUrl) throw new Error('yt-dlp returned empty URL');
    const { stdout: titleOut } = await execPromise(`"C:\Users\ojuni\AppData\Local\hermes\hermes-agent\venv\Scripts\yt-dlp.exe" --get-title "${url}"`, {
      maxBuffer: 1024 * 1024,
      timeout: 30000,
    });
    return { url: videoUrl, title: titleOut.trim() || 'Facebook Video' };
  } catch (err) {
    throw new Error('yt-dlp failed: ' + err.message);
  }
}

async function fetchFromApi(url) {
  // primary public API: FBDown compatible endpoint
  const endpoints = [
    `https://fbdown.vercel.app/api/get?url=${encodeURIComponent(url)}`,
  ];
  const schemas = [
    (d) => d.hd || d.sd,
    (d) => d.result,
  ];
  for (let i = 0; i < endpoints.length; i++) {
    const res = await axios.get(endpoints[i], { timeout: 30000 });
    const getter = schemas[i] || (() => null);
    const videoUrl = getter(res.data);
    if (videoUrl) {
      return {
        url: typeof videoUrl === 'string' ? videoUrl : (videoUrl.url || videoUrl),
        title: (res.data.title || 'Facebook Video'),
      };
    }
  }
  throw new Error('All APIs returned empty');
}

module.exports = {
  name: 'facebook',
  aliases: ['fb', 'fbdl', 'facebookdl'],
  category: 'media',
  description: 'Download Facebook videos',
  usage: '.fb <Facebook video link>',

  async execute(sock, msg, args, extra) {
    try {
      if (processedMessages.has(msg.key.id)) {
        return;
      }
      processedMessages.add(msg.key.id);
      setTimeout(() => processedMessages.delete(msg.key.id), 5 * 60 * 1000);

      const text = msg.message?.conversation ||
                   msg.message?.extendedTextMessage?.text ||
                   args.join(' ');
      if (!text) return await extra.reply('send me a facebook link hey');

      const url = text.split(' ').slice(1).join(' ').trim();
      if (!url) return await extra.reply('send me a facebook link hey');

      const patterns = [
        /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\//,
        /https?:\/\/(?:www\.|m\.|web\.)?fb\.com\//,
        /https?:\/\/(?:www\.|m\.|web\.)?fb\.watch\//,
        /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/watch/,
        /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/.*\/videos\//,
        /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/reel\//,
        /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/share\//,
        /https?:\/\/(?:www\.|m\.|web\.)?fb\.watch\//,
      ];
      if (!patterns.some((p) => p.test(url))) {
        return await extra.reply('❌ invalid facebook link\nuse: .fb <facebook video link>');
      }

      const reactOk = await sock.sendMessage(extra.from, {
        react: { text: '🔄', key: msg.key },
      }).catch(() => null);

      let videoData = null;
      let lastError = null;

      // Try yt-dlp first
      try {
        console.log('.fb: trying yt-dlp...');
        videoData = await fetchWithYtDlp(url);
        console.log('.fb: yt-dlp ok');
      } catch (err) {
        lastError = err;
        console.log('.fb: yt-dlp failed:', err.message);
      }

      // then public API
      if (!videoData) {
        try {
          console.log('.fb: trying API fallback...');
          videoData = await fetchFromApi(url);
          console.log('.fb: API fallback ok');
        } catch (err) {
          lastError = err;
          console.log('.fb: API fallback failed:', err.message);
        }
      }

      if (!videoData || !videoData.url) {
        return await extra.reply(
          "❌ couldn't get the video link\n\nAll download sources failed.\nTry using a direct video link instead."
        );
      }

      const caption = `*DOWNLOADED BY KAMI BOT*\n\n${videoData.title ? '📝 ' + videoData.title : ''}`;
      let sendSuccess = false;

      // Method 1: direct URL
      try {
        console.log('.fb: Method 1 direct URL');
        await sock.sendMessage(extra.from, {
          video: { url: videoData.url },
          caption,
        }, { quoted: msg });
        sendSuccess = true;
      } catch (e1) {
        console.log('.fb: Method 1 failed:', e1.message);
        // Method 2: download buffer
        try {
          console.log('.fb: Method 2 buffer');
          const videoResponse = await axios.get(videoData.url, {
            responseType: 'arraybuffer',
            timeout: 90000,
            maxContentLength: 100 * 1024 * 1024,
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
          console.log('.fb: Method 2 failed:', e2.message);
        }
      }

      if (!sendSuccess) {
        return await extra.reply(
          '❌ network issue hey\n\nCould not download from Facebook servers.\n\nTry:\n• Using a VPN\n• A different internet connection\n• Using browser to download manually'
        );
      }
    } catch (error) {
      console.error('.fb Error:', error.message || error);
      await extra.reply('❌ Error: ' + (error.message || 'try again later'));
    }
  },
};
