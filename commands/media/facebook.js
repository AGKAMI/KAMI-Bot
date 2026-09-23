/**
 * Facebook Downloader - Download Facebook videos
 */

/* eslint-disable */

const axios = require('axios');
const { execFile } = require('child_process');
const util = require('util');
const execFilePromise = util.promisify(execFile);
const config = require('../../config');
const { bold, italic, pick, SLANG } = require('../../utils/format');

const processedMessages = new Map(); // id → timestamp

// Periodic sweep every 5 min
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, ts] of processedMessages) {
    if (ts < cutoff) processedMessages.delete(id);
  }
}, 5 * 60 * 1000);

async function fetchWithYtDlp(url) {
  try {
    const ytDlpCmd = config.ytDlpPath || 'yt-dlp';
    const { stdout } = await execFilePromise(ytDlpCmd, ['-g', '-f', 'best', url], {
      maxBuffer: 5 * 1024 * 1024,
      timeout: 60000,
    });
    const videoUrl = stdout.trim().split('\n').pop();
    if (!videoUrl) throw new Error('yt-dlp returned empty URL');
    const { stdout: titleOut } = await execFilePromise(ytDlpCmd, ['--get-title', url], {
      maxBuffer: 1024 * 1024,
      timeout: 30000,
    });
    return { url: videoUrl, title: titleOut.trim() || 'Facebook Video' };
  } catch (err) {
    throw new Error('yt-dlp failed: ' + err.message);
  }
}

async function fetchFromApi(url) {
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
      processedMessages.set(msg.key.id, Date.now());

      const text = msg.message?.conversation ||
                   msg.message?.extendedTextMessage?.text ||
                   args.join(' ');
      if (!text) return await extra.reply(`📝 _${pick(SLANG.vibe)}, send me a Facebook link hey_`);

      const url = text.split(' ').slice(1).join(' ').trim();
      if (!url) return await extra.reply(`📝 _${pick(SLANG.vibe)}, send me a Facebook link hey_`);

      const patterns = [
        /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\//,
        /https?:\/\/(?:www\.|m\.|web\.)?fb\.com\//,
        /https?:\/\/(?:www\.|m\.|web\.)?fb\.watch\//,
        /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/watch/,
        /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/.*\/videos\//,
        /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/reel\//,
        /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/share\//,
      ];
      if (!patterns.some((p) => p.test(url))) {
        return await extra.reply(`❌ _${pick(SLANG.error)}, invalid Facebook link_\n_use:_ .fb <facebook video link>`);
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
          `❌ _${pick(SLANG.error)} — couldn't get the video link_\n\n_All download sources failed._\n_Try using a direct video link instead._`
        );
      }

      const caption = `*DOWNLOADED BY KAMI BOT*\n\n${videoData.title ? '📝 ' + videoData.title : ''}\n_${pick(SLANG.vibe)}, enjoy_`;
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
        // Method 2: download buffer (500MB limit)
        try {
          console.log('.fb: Method 2 buffer');
          const videoResponse = await axios.get(videoData.url, {
            responseType: 'arraybuffer',
            timeout: 120000,
            maxContentLength: 16 * 1024 * 1024, // 16MB — WhatsApp limit
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
          `❌ _${pick(SLANG.error)} — could not download the video_\n\n_The file might be too large for WhatsApp (>100MB)._\n_Try:_\n• _A shorter video_\n• _Using browser to download manually_`
        );
      }
    } catch (error) {
      console.error('.fb Error:', error.message || error);
      await extra.reply(`❌ _${pick(SLANG.error)} — ${(error.message || 'try again later')}_`);
    }
  },
};
