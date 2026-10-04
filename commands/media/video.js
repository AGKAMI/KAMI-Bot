const yts = require('yt-search');
const axios = require('axios');
const APIs = require('../../utils/api');
const config = require('../../config');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');
const { toVideo } = require('../../utils/converter');

const processedMessages = new Map(); // id → timestamp

// Periodic sweep every 5 min
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, ts] of processedMessages) {
    if (ts < cutoff) processedMessages.delete(id);
  }
}, 5 * 60 * 1000);
const MAX_SIZE_MB = 16;
const MAX_CONCURRENT = 1;
let activeDownloads = 0;
const downloadQueue = [];

// ISO-BMFF container: bytes 4..7 == 'ftyp' (mp4/mov)
function isMp4(buf) {
  return !!buf && buf.length > 12 && buf.toString('latin1', 4, 8) === 'ftyp';
}

function processQueue() {
  if (downloadQueue.length === 0 || activeDownloads >= MAX_CONCURRENT) return;
  const next = downloadQueue.shift();
  activeDownloads++;
  next().finally(() => {
    activeDownloads--;
    processQueue();
  });
}

module.exports = {
  name: 'ytvideo',
  reactions: { received: '🎬', generating: '⬇️', done: '📺' },
  aliases: ['ytv', 'ytmp4', 'ytvid', 'video'],
  category: 'media',
  description: 'Download video from YouTube',
  usage: '.video <YouTube URL or search>',
  _internals: { isMp4 },

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    if (processedMessages.has(msg.key.id)) return;
    processedMessages.set(msg.key.id, Date.now());

    if (activeDownloads >= MAX_CONCURRENT) {
      const pos = downloadQueue.length + 1;
      extra.fail();
      return extra.reply(`❌ _video queue is full (${activeDownloads} running) — try again in ~30s_`);
    }

    const doDownload = async () => {
      let sent;
      try {
        const text = args.join(' ').trim();
        if (!text) return extra.reply(`📝 _${voice.lead('neutral')}, what video do you want to download?_`);

        let videoUrl = text;

        if (!text.startsWith('http://') && !text.startsWith('https://')) {
          try {
            const { videos } = await yts(text);
            if (!videos || videos.length === 0) { extra.fail(); return extra.reply(`❌ _${voice.openErr()}, no videos found_`); }
            videoUrl = videos[0].url;
          } catch (e) {
            extra.fail();
            return extra.reply(`❌ _search failed hey — ${e.message}_`);
          }
        }

        const patterns = [
          /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=/,
          /https?:\/\/youtu\.be\//,
          /https?:\/\/(?:www\.)?youtube\.com\/shorts\//,
        ];
        if (!patterns.some(p => p.test(videoUrl))) {
          extra.fail();
          return extra.reply(`❌ _${voice.openErr()}, invalid YouTube link_\n_Use:_ ${prefix}video <url or search>`);
        }

        sent = await extra.reply(`🔄 _searching..._`);

        let videoData;
        try {
          videoData = await APIs.ytDownload(videoUrl, 'video');
        } catch (err) {
          extra.fail();
          return await extra.edit(sent.key, `❌ _download failed hey — ${err.message}_`);
        }

        if (!videoData.download) { extra.fail(); return await extra.edit(sent.key, `❌ _${voice.openErr()}, no download URL received_`); }

        await extra.edit(sent.key, `⬇️ *Downloading:* ${videoData.title || 'video'}...`);

        let videoBuffer;
        try {
          const res = await axios.get(videoData.download, {
            responseType: 'arraybuffer',
            timeout: 180000,
            maxContentLength: 16 * 1024 * 1024, // 16MB — WhatsApp limit
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': '*/*',
              'Referer': 'https://loader.to/',
            }
          });
          videoBuffer = Buffer.from(res.data);
          if (!videoBuffer || videoBuffer.length === 0) throw new Error('Empty buffer');
        } catch (dlErr) {
          if (dlErr.message?.includes('maxContentLength') || dlErr.message?.includes('exceeded')) {
            extra.fail();
            return await extra.edit(sent.key, `❌ _that video is too big — try a shorter one or under 20MB_`);
          }
          extra.fail();
          return await extra.edit(sent.key, `❌ _download failed hey — ${dlErr.message}_`);
        }

        const sizeMB = videoBuffer.length / (1024 * 1024);
        if (sizeMB > MAX_SIZE_MB) {
          extra.fail();
          return await extra.edit(sent.key, `❌ _video too large (${sizeMB.toFixed(1)}MB) — WhatsApp limit's 16MB_`);
        }

        // YouTube downloads are already mp4. Re-encoding every download with
        // x264 (child process counts against the container's memory cap) is
        // what OOM-killed the bot (exit 137) — only convert when the bytes
        // are NOT an mp4 container.
        let sendBuffer = videoBuffer;
        if (isMp4(videoBuffer)) {
          console.log('[VIDEO] already mp4 — re-encode skipped');
        } else {
          try {
            sendBuffer = await toVideo(videoBuffer, 'mp4');
            console.log('[VIDEO] re-encoded successfully');
          } catch (encErr) {
            console.log('[VIDEO] encode skipped:', encErr?.message || encErr);
          }
        }

        const caption = '*DOWNLOADED BY KAMI BOT*\n\n' + (videoData.title ? '📝 ' + videoData.title : '') + `\n_${voice.lead('affirm')}, enjoy_`;

        await sock.sendMessage(extra.from, {
          video: sendBuffer,
          mimetype: 'video/mp4',
          caption,
        }, { quoted: msg });

        await extra.edit(sent.key, `✅ *Sent!* _${videoData.title || 'video'}_`);
      } catch (error) {
        console.error('[VIDEO] Error:', error?.message || error);
        if (sent) {
          try { { extra.fail(); await extra.edit(sent.key, `❌ _${voice.openErr()} — ${(error?.message || 'try again')}_`); } } catch (_) {}
        } else {
          try { { extra.fail(); await extra.reply(`❌ _${voice.openErr()} — ${(error?.message || 'try again')}_`); } } catch (_) {}
        }
      }
    };

    activeDownloads++;
    doDownload().finally(() => {
      activeDownloads--;
      processQueue();
    });
  }
};
