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
  const sources = [
    {
      name: 'siputzx',
      get: async () => {
        const res = await axios.get('https://api.siputzx.my.id/api/d/facebook', {
          params: { url },
          timeout: 30000,
        });
        const d = res.data;
        const downloads = d?.data?.downloads;
        if (d?.status && Array.isArray(downloads) && downloads.length) {
          const best =
            downloads.find(x => /1080|hd|720/i.test(x.quality || '')) ||
            downloads.find(x => x.type === 'video' && x.url) ||
            downloads[0];
          if (best?.url) {
            return {
              url: best.url,
              title: d.data.title || 'Facebook Video',
              thumbnail: d.data.thumbnail,
            };
          }
        }
        throw new Error('empty result');
      },
    },
    {
      name: 'fbdown.vercel',
      get: async () => {
        const res = await axios.get(
          `https://fbdown.vercel.app/api/get?url=${encodeURIComponent(url)}`,
          { timeout: 30000 }
        );
        if (res.data?.error) throw new Error(res.data.error);
        const videoUrl = res.data?.hd || res.data?.sd || res.data?.result;
        if (!videoUrl) throw new Error('empty result');
        return {
          url: typeof videoUrl === 'string' ? videoUrl : videoUrl.url || videoUrl,
          title: res.data.title || 'Facebook Video',
        };
      },
    },
  ];

  const failures = [];
  for (const src of sources) {
    try {
      const out = await src.get();
      if (out?.url) return out;
      failures.push(`${src.name}: no url`);
    } catch (err) {
      failures.push(`${src.name}: ${err.message}`);
    }
  }
  throw new Error(failures.join(' | ') || 'All APIs returned empty');
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
        const detail = lastError?.message ? `\n\n_Source detail: _${lastError.message}_` : '';
        return await extra.reply(
          `❌ _${pick(SLANG.error)} — couldn't get the video link_\n\n_All download sources failed._${detail}\n_Try a public post link (not login-walled)._`
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
