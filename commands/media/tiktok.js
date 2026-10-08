/**
 * TikTok Downloader - Download TikTok videos without watermark
 * Fallbacks: tikwm API -> ruhend-scraper -> tikcdn direct
 */

const axios = require('axios');
const { ttdl } = require('ruhend-scraper');
const config = require('../../config');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');
const { withTimeout } = require('../../utils/withTimeout');

const processedMessages = new Map(); // id → timestamp

// Periodic sweep every 5 min
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, ts] of processedMessages) {
    if (ts < cutoff) processedMessages.delete(id);
  }
}, 5 * 60 * 1000);

const TIKTOK_REGEX = /(?:https?:\/\/)?(?:(?:www|vt|vm)\.)?tiktok\.com\/.+|(?:https?:\/\/)?tikcdn\.io\/ssstik\/\d+/i;

const dlAxios = axios.create({
  timeout: 120000,
  maxContentLength: 16 * 1024 * 1024, // 16MB — WhatsApp limit
  responseType: 'arraybuffer',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'video/mp4,video/*,*/*;q=0.9',
    'Referer': 'https://www.tiktok.com/'
  }
});

// Hard ceilings for every remote step. node-fetch inside ruhend-scraper
// and Baileys' own URL media fetch have NO timeout — a stalled request
// used to hang execute() forever, freezing reactions on ⬇️ with no ❌,
// no error text and no video (the "choked .tt" bug).
const RUHEND_TIMEOUT_MS = 30000;
const URL_SEND_TIMEOUT_MS = 60000;
// Umbrella: if anything (even a Baileys send) stalls past this, the run
// rejects so the ❌ verdict + error reply always land. Env override is a
// test seam only — production always uses 3 minutes.
const WATCHDOG_MS = Number(process.env.TT_WATCHDOG_MS) || 180000;

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
      ? `*DOWNLOADED BY ${botName}*\n\n${title}\n_${voice.lead('affirm')}, enjoy_`
      : `*DOWNLOADED BY ${botName}*\n_${voice.lead('affirm')}, enjoy_`;

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
        ? `*DOWNLOADED BY ${botName}*\n\n${title}\n_${voice.lead('affirm')}, enjoy_`
        : `*DOWNLOADED BY ${botName}*\n_${voice.lead('affirm')}, enjoy_`;

      await withTimeout(
        sock.sendMessage(chatId, {
          video: { url: videoUrl },
          mimetype: 'video/mp4',
          caption
        }, { quoted: msg }),
        URL_SEND_TIMEOUT_MS,
        'URL send'
      );
      return true;
    } catch (e2) {
      console.error('[TT] URL send failed:', e2.message);
      return false;
    }
  }
}

async function sendSlideshow(sock, chatId, images, title, msg, shouldStop) {
  try {
    const botName = config.botName.toUpperCase();
    const total = images.length;

    // Send header text
    const header = title
      ? `*DOWNLOADED BY ${botName}*\n\n${title}\n_${total} images_\n_${voice.lead('affirm')}, enjoy_`
      : `*DOWNLOADED BY ${botName}*\n_${voice.lead('affirm')}, enjoy_`;
    await sock.sendMessage(chatId, { text: header }, { quoted: msg });

    // Send each image
    let sent = 0;
    for (let i = 0; i < total; i++) {
      if (shouldStop && shouldStop()) break;
      try {
        const imgUrl = images[i];
        const imgRes = await dlAxios.get(imgUrl);
        const buf = Buffer.from(imgRes.data);
        if (buf.length < 500) continue;

        await sock.sendMessage(chatId, {
          image: buf,
          caption: `📸 ${i + 1}/${total}`
        });
        sent++;
      } catch (e) {
        console.error(`[TT] slideshow image ${i + 1} failed: ${e.message}`);
      }
    }

    return sent > 0;
  } catch (e) {
    console.error('[TT] slideshow failed:', e.message);
    return false;
  }
}

async function methodTikwm(url) {
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;
  const { data } = await axios.get(apiUrl, { timeout: 20000 });

  if (data?.code !== 0 || !data?.data) throw new Error('tikwm: invalid response');

  // Slideshow — has images array
  const images = data.data.images || [];
  if (images.length > 0) {
    return {
      type: 'slideshow',
      images,
      title: data.data.title || null
    };
  }

  const videoUrl = data.data.hdplay || data.data.play;
  if (!videoUrl) throw new Error('tikwm: no video URL');

  return {
    type: 'video',
    videoUrl: videoUrl.startsWith('http') ? videoUrl : `https://www.tikwm.com${videoUrl}`,
    title: data.data.title || null
  };
}

async function methodRuhend(url, timeoutMs = RUHEND_TIMEOUT_MS) {
  // ttdl() fetches through node-fetch with no timeout at all — unbounded,
  // it was the main way .tt froze on the ⬇️ stage.
  const result = await withTimeout(ttdl(url), timeoutMs, 'ruhend');
  if (!result) throw new Error('ruhend: no result');

  // Slideshow — has images array
  const images = result.images || [];
  if (images.length > 0) {
    return {
      type: 'slideshow',
      images,
      title: result.title || null
    };
  }

  const videoUrl = result.video_hd || result.video;
  if (!videoUrl) throw new Error('ruhend: no video URL');

  return { type: 'video', videoUrl, title: result.title || null };
}

async function methodTikcdn(url) {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('tikcdn: could not extract video ID');

  const videoUrl = `https://tikcdn.io/ssstik/${videoId}`;
  return { videoUrl, title: null };
}

module.exports = {
  name: 'tiktok',
  reactions: { received: '📱', generating: '⬇️', done: '🎞️' },
  aliases: ['tt', 'ttdl', 'tiktokdl'],
  category: 'media',
  description: 'Download TikTok videos (no watermark)',
  usage: '.tt <TikTok URL>',

  async execute(sock, msg, args, extra) {
    let watchdogTimer = null;
    let aborted = false;
    try {
      if (processedMessages.has(msg.key.id)) return;
      processedMessages.set(msg.key.id, Date.now());

      const text = (msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text || '').trim();

      const urlMatch = text.match(TIKTOK_REGEX);
      const url = urlMatch
        ? urlMatch[0]
        : (args[0] || '').trim();

      if (!url || !TIKTOK_REGEX.test(url)) {
        return extra.reply(`📝 _${voice.lead('neutral')}, send a TikTok link after the command_\n\n*.tt <tiktok url>*`);
      }

      const run = (async () => {
        const methods = [
          { name: 'tikwm', fn: () => methodTikwm(url) },
          { name: 'ruhend', fn: () => methodRuhend(url) },
          { name: 'tikcdn', fn: () => methodTikcdn(url) }
        ];

        let success = false;
        let lastError = null;

        for (const method of methods) {
          if (aborted) break;
          try {
            console.log(`[TT] trying ${method.name}...`);
            const result = await method.fn();
            console.log(`[TT] ${method.name} succeeded — type: ${result.type || 'video'}`);
            if (aborted) break;

            let sent = false;
            if (result.type === 'slideshow' && result.images?.length > 0) {
              sent = await sendSlideshow(sock, extra.from, result.images, result.title, msg, () => aborted);
            } else if (result.videoUrl) {
              sent = await sendVideo(sock, extra.from, result.videoUrl, result.title, msg);
            }

            if (sent) {
              success = true;
              break;
            }
          } catch (e) {
            console.error(`[TT] ${method.name} failed: ${e.message}`);
            lastError = e;
          }
        }

        // The watchdog already reported this run — don't double-reply.
        if (aborted) return;
        if (!success) {
          extra.fail();
          return extra.reply(`❌ _${voice.openErr()} — couldn't download the video, try a different link_`);
        }
      })();

      // Anything that goes wrong after the watchdog took over must stay
      // silent (the timeout reply already went out).
      run.catch(() => {});

      // Umbrella watchdog: every step above is bounded, but if some other
      // await stalls (WhatsApp send, Baileys internals) execute() must
      // still settle — a hung execute froze reactions on ⬇️ forever with
      // no ❌ and no error text.
      await Promise.race([
        run,
        new Promise((_, reject) => {
          watchdogTimer = setTimeout(() => {
            aborted = true;
            reject(new Error(`timed out after ${Math.round(WATCHDOG_MS / 1000)}s`));
          }, WATCHDOG_MS);
        }),
      ]);
    } catch (error) {
      console.error('[TT] command error:', error);
      extra.fail();
      const timedOut = /timed out/.test(error.message || '');
      await extra.reply(timedOut
        ? `❌ _${voice.openErr()} — download timed out, try again or use a different link_`
        : `❌ _${voice.openErr()} — error processing request, try again_`);
    } finally {
      if (watchdogTimer) clearTimeout(watchdogTimer);
    }
  },

  // Test seams — never invoked by the command loader.
  _internals: {
    withTimeout,
    methodRuhend,
    sendVideo,
    sendSlideshow,
    methodTikwm,
    RUHEND_TIMEOUT_MS,
    URL_SEND_TIMEOUT_MS,
    WATCHDOG_MS,
    TIKTOK_REGEX,
  },
};
