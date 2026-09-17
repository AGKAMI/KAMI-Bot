/**
 * TikTok Downloader - Download TikTok videos without watermark
 * Fallbacks: tikwm API -> ruhend-scraper -> tikcdn direct
 */

const axios = require('axios');
const { ttdl } = require('ruhend-scraper');
const config = require('../../config');
const { bold, italic, pick, SLANG } = require('../../utils/format');

const processedMessages = new Set();

const TIKTOK_REGEX = /(?:https?:\/\/)?(?:(?:www|vt|vm)\.)?tiktok\.com\/.+|(?:https?:\/\/)?tikcdn\.io\/ssstik\/\d+/i;

const dlAxios = axios.create({
  timeout: 120000,
  maxContentLength: 200 * 1024 * 1024,
  responseType: 'arraybuffer',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'video/mp4,video/*,*/*;q=0.9',
    'Referer': 'https://www.tiktok.com/'
  }
});

function extractVideoId(url) {
  const match = url.match(/\/video\/(\d+)/);
  return match ? match[1] : null;
}

async function sendVideo(sock, chatId, videoUrl, title, msg) {
  try {
    const res = await dlAxios.get(videoUrl);
    const buf = Buffer.from(res.data);
    if (buf.length < 1000) throw new Error('Buffer too small');

    const botName = config.botName.toUpperCase();
    const caption = title
      ? `*DOWNLOADED BY ${botName}*\n\n${title}\n_${pick(SLANG.vibe)}, enjoy_`
      : `*DOWNLOADED BY ${botName}*\n_${pick(SLANG.vibe)}, enjoy_`;

    await sock.sendMessage(chatId, {
      video: buf,
      mimetype: 'video/mp4',
      caption
    }, { quoted: msg });
    return true;
  } catch (e) {
    console.error('[TT] buffer download failed:', e.message);
    // Fallback: send via URL directly
    try {
      const botName = config.botName.toUpperCase();
      const caption = title
        ? `*DOWNLOADED BY ${botName}*\n\n${title}\n_${pick(SLANG.vibe)}, enjoy_`
        : `*DOWNLOADED BY ${botName}*\n_${pick(SLANG.vibe)}, enjoy_`;

      await sock.sendMessage(chatId, {
        video: { url: videoUrl },
        mimetype: 'video/mp4',
        caption
      }, { quoted: msg });
      return true;
    } catch (e2) {
      console.error('[TT] URL send failed:', e2.message);
      return false;
    }
  }
}

async function methodTikwm(url) {
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;
  const { data } = await axios.get(apiUrl, { timeout: 20000 });

  if (data?.code !== 0 || !data?.data) throw new Error('tikwm: invalid response');

  const videoUrl = data.data.hdplay || data.data.play;
  if (!videoUrl) throw new Error('tikwm: no video URL');

  return {
    videoUrl: videoUrl.startsWith('http') ? videoUrl : `https://www.tikwm.com${videoUrl}`,
    title: data.data.title || null
  };
}

async function methodRuhend(url) {
  const result = await ttdl(url);
  if (!result) throw new Error('ruhend: no result');

  const videoUrl = result.video_hd || result.video;
  if (!videoUrl) throw new Error('ruhend: no video URL');

  return { videoUrl, title: result.title || null };
}

async function methodTikcdn(url) {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('tikcdn: could not extract video ID');

  const videoUrl = `https://tikcdn.io/ssstik/${videoId}`;
  return { videoUrl, title: null };
}

module.exports = {
  name: 'tiktok',
  aliases: ['tt', 'ttdl', 'tiktokdl'],
  category: 'media',
  description: 'Download TikTok videos (no watermark)',
  usage: '.tt <TikTok URL>',

  async execute(sock, msg, args, extra) {
    try {
      if (processedMessages.has(msg.key.id)) return;
      processedMessages.add(msg.key.id);
      setTimeout(() => processedMessages.delete(msg.key.id), 5 * 60 * 1000);

      const text = (msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text || '').trim();

      const urlMatch = text.match(TIKTOK_REGEX);
      const url = urlMatch
        ? urlMatch[0]
        : (args[0] || '').trim();

      if (!url || !TIKTOK_REGEX.test(url)) {
        return extra.reply(`📝 _${pick(SLANG.vibe)}, send a TikTok link after the command_\n\n*.tt <tiktok url>*`);
      }

      await extra.react('🔄');

      const methods = [
        { name: 'tikwm', fn: () => methodTikwm(url) },
        { name: 'ruhend', fn: () => methodRuhend(url) },
        { name: 'tikcdn', fn: () => methodTikcdn(url) }
      ];

      let success = false;
      let lastError = null;

      for (const method of methods) {
        try {
          console.log(`[TT] trying ${method.name}...`);
          const result = await method.fn();
          console.log(`[TT] ${method.name} succeeded`);

          const sent = await sendVideo(sock, extra.from, result.videoUrl, result.title, msg);
          if (sent) {
            success = true;
            break;
          }
        } catch (e) {
          console.error(`[TT] ${method.name} failed: ${e.message}`);
          lastError = e;
        }
      }

      if (!success) {
        await extra.react('❌');
        return extra.reply(`❌ _${pick(SLANG.error)} — could not download the video, try a different link_`);
      }

      await extra.react('✅');
    } catch (error) {
      console.error('[TT] command error:', error);
      await extra.react('❌');
      await extra.reply(`❌ _${pick(SLANG.error)} — error processing request, try again_`);
    }
  }
};
