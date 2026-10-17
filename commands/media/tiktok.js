/**
 * TikTok Downloader - Download TikTok videos without watermark
 * Fallbacks: tikapi (mobile feed) -> embed page (v45 CDN) -> tikwm API
 *            -> ruhend-scraper
 *
 * Why this order (probed live from deployment b0665152, 2026-10-13):
 *  - tikapi: TikTok's own mobile feed API — no sign, no watermark,
 *    play_addr straight from the aweme. Primary when it answers.
 *  - the embed player page (tiktok.com/embed/v2/<id>) is BACK — 200s with
 *    a signed v45.tiktokcdn-eu.com URL in the HTML (the 400s we saw
 *    2026-10-12 were temporary). No key, no auth, works from datacenter IPs.
 *  - tikwm 403s the datacenter IP (even curl/default-UA, GET and POST) —
 *    ruhend rides tikwm's backend, so both are mid-chain last resorts.
 *  - tikcdn.io/ssstik/<id> is REMOVED from the chain and its host is
 *    blocked outright. It serves a "THIS APP IS OFFLINE — go to
 *    ssstik.io" anti-leech promo clip instead of the real video, and it
 *    RE-ENCODES that clip, so any md5/size denylist rots (a re-encode
 *    shipped as a "working" video on 2026-10-15). A provider that
 *    answers with the wrong video is worse than no provider: a clean
 *    "couldn't download" beats a promo clip. The unchecked URL-send
 *    fallback is also blocked for tikcdn hosts so the clip can never ship.
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ttdl } = require('ruhend-scraper');
const config = require('../../config');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');
const { withTimeout } = require('../../utils/withTimeout');

// ── Optional proxy for TikTok metadata APIs ─────────────────
// Datacenter IPs get 403/429'd by tikwm and rate-boxed by TikTok's API
// edge. Set TT_PROXY_URL in the panel env (http://user:pass@host:port)
// and ONLY the small JSON metadata calls route through it — the video
// bytes still download DIRECT from TikTok's CDN (which isn't blocked),
// so proxy bandwidth stays at kilobytes per download.
let _proxyAgent = null;
let _proxyTried = false;
function getProxyAgent() {
  if (_proxyTried) return _proxyAgent;
  _proxyTried = true;
  const url = process.env.TT_PROXY_URL;
  if (!url) return null;
  try {
    const { HttpsProxyAgent } = require('https-proxy-agent');
    _proxyAgent = new HttpsProxyAgent(url);
    console.log('[TT] proxy enabled for metadata calls');
  } catch (e) {
    console.error('[TT] TT_PROXY_URL set but agent init failed:', e.message);
  }
  return _proxyAgent;
}
function apiAxiosConfig(extra = {}) {
  const agent = getProxyAgent();
  return agent ? { ...extra, httpsAgent: agent, httpAgent: agent, proxy: false } : extra;
}

const processedMessages = new Map(); // id → timestamp

// Periodic sweep every 5 min
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, ts] of processedMessages) {
    if (ts < cutoff) processedMessages.delete(id);
  }
}, 5 * 60 * 1000);

const TIKTOK_REGEX = /(?:https?:\/\/)?(?:(?:www|vt|vm)\.)?tiktok\.com\/.+|(?:https?:\/\/)?tikcdn\.io\/ssstik\/\d+/i;

// Hosts that serve an anti-leech promo clip INSTEAD of the real video.
// Blocked at every path (URL-send fallback, buffer download, chain) —
// content hashing can't keep up because they re-encode the promo clip.
const BLOCKED_HOSTS = /tikcdn\.io/i;
function isBlockedHost(url) {
  return typeof url === 'string' && BLOCKED_HOSTS.test(url);
}

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
  // /video/ and /photo/ — photo-mode posts (slideshows) share /photo/<id>
  // links but use the SAME aweme_id in the feed API. Matching only /video/
  // made every slideshow fail ID extraction at tikapi/embed/tikcdn while
  // tikwm (the only no-ID slideshow source) 403s the datacenter IP.
  const match = url.match(/\/(?:video|photo)\/(\d+)/);
  return match ? match[1] : null;
}

async function sendVideo(sock, chatId, videoUrl, title, msg) {
  if (isBlockedHost(videoUrl)) {
    console.error('[TT] refusing to download from promo-clip host:', videoUrl.slice(0, 60));
    return false;
  }
  try {
    const res = await dlAxios.get(videoUrl);
    const buf = Buffer.from(res.data);
    if (buf.length < 1000) throw new Error('Buffer too small');
    // tikcdn sometimes serves a ~4MB "THIS APP IS OFFLINE — go to ssstik.io"
    // promo clip instead of the real video. It's a valid mp4, so size/parse
    // checks pass — only a content hash catches it. Reject → caller falls
    // through to the next provider instead of delivering the wrong video.
    if (isPlaceholder(buf)) {
      console.error('[TT] provider served the tikcdn anti-leech placeholder — rejecting');
      return false;
    }

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
    // Fallback: send via URL directly — Baileys streams it, so no hash
    // check is possible. Never do this for tikcdn (the promo-clip host):
    // that's how the "THIS APP IS OFFLINE" clip shipped unchecked.
    if (isBlockedHost(videoUrl)) return false;
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

// Browser headers for every tikwm call — the API 403s default-UA clients
// (axios/x.y.z) from server/datacenter IPs. Verified working with this UA.
const TIKWM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Referer': 'https://www.tikwm.com/',
  'Accept': 'application/json, text/plain, */*',
};

// TikTok's own mobile feed API — no signing required with device params.
// Serves the no-watermark play_addr on the v16m-default CDN family, which
// is NOT the Akamai-blocked v16-webapp-prime. Rate-limits ~1 req/s per IP
// (429 on rapid repeats): per-host single retry after a backoff covers it.
const TIKAPI_HOSTS = [
  'api16-normal-c-useast1a.tiktokv.com',
  'api22-normal-c-useast2a.tiktokv.com',
];
const MOBILE_UA = 'com.zhiliaoapp.musically/2023009040 (Linux; U; Android 9; en; ASUS_Z01QD; Build/PI;)';

// Slideshow image cards from an aweme. Legacy payloads nest them in
// aweme.images[].url_list; newer photo-mode ones in
// aweme.image_post_info.images[] under display_image/thumbnail url_list.
// Photo awemes ALSO carry a play_addr video rendition (a synthesized
// slideshow video) — WhatsApp can't play it, so images must be checked
// first and the rendition never used for photo posts.
function extractSlideshowImages(aweme) {
  const list = (Array.isArray(aweme.images) && aweme.images.length)
    ? aweme.images
    : (aweme.image_post_info && Array.isArray(aweme.image_post_info.images))
      ? aweme.image_post_info.images
      : [];
  return list
    .map(im => {
      if (!im || typeof im !== 'object') return null;
      const urls = (Array.isArray(im.url_list) && im.url_list) ||
        (im.display_image && im.display_image.url_list) ||
        (im.thumbnail && im.thumbnail.url_list) ||
        [];
      return urls.find(u => typeof u === 'string' && u.startsWith('http')) || null;
    })
    .filter(Boolean);
}

async function methodTikApi(url) {
  const videoId = await resolveCanonicalId(url);
  if (!videoId) throw new Error('tikapi: could not extract video ID');

  let aweme = null;
  let lastMsg = 'no attempts';
  let saw429 = false;
  outer:
  for (const host of TIKAPI_HOSTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0 || (host !== TIKAPI_HOSTS[0])) await new Promise(r => setTimeout(r, 8000)); // 429 backoff
      try {
        const api = `https://${host}/aweme/v1/feed/?aweme_id=${videoId}` +
          `&iid=7318518857994389254&device_id=7318517321748022790&channel=googleplay` +
          `&app_name=musical_ly&version_code=300904&device_platform=android` +
          `&device_type=ASUS_Z01QD&os_version=9`;
        const res = await axios.get(api, { timeout: 12000, headers: { 'User-Agent': MOBILE_UA }, ...apiAxiosConfig() });
        const list = (res.data && res.data.aweme_list) || [];
        // The endpoint sometimes returns a recommendation feed alongside
        // (or instead of) the requested item — scan for OUR aweme_id
        const hit = list.find(a => a && String(a.aweme_id) === videoId);
        if (hit) {
          aweme = hit;
          break outer;
        }
        saw429 = false;
        lastMsg = list.length ? 'requested video not in returned feed' : 'empty aweme_list';
      } catch (e) {
        lastMsg = e.response ? `HTTP ${e.response.status}` : e.message;
        if (e.response && e.response.status === 429) saw429 = true;
      }
    }
  }
  if (!aweme) throw new Error(saw429 ? 'tikapi: rate limited (429) — the box IP burned its TikTok API window, retry in a few minutes' : `tikapi: ${lastMsg}`);

  // Slideshow posts — image cards instead of a video
  const images = extractSlideshowImages(aweme);
  if (images.length > 0) {
    return { type: 'slideshow', images, title: aweme.desc || null };
  }

  const play = ((aweme.video && aweme.video.play_addr && aweme.video.play_addr.url_list) || [])
    .find(u => typeof u === 'string' && u.startsWith('http'));
  if (!play) throw new Error('tikapi: no play_addr in aweme');
  return { type: 'video', videoUrl: play, title: aweme.desc || null };
}

async function methodTikwm(url) {
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;
  let data = null;
  let lastMsg = '';

  // tikwm rate-limits ~1 req/s per IP — one retry after a pause covers
  // the common 403/empty-body blip instead of falling through the chain
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1500));
      try {
        const res = await axios.get(apiUrl, { timeout: 20000, headers: TIKWM_HEADERS, ...apiAxiosConfig() });
        data = res.data;
      if (data?.code === 0 && data?.data) break;
      lastMsg = data?.msg || `code ${data?.code}`;
    } catch (e) {
      lastMsg = e.message;
      data = null;
    }
  }

  if (!data || data.code !== 0 || !data.data) throw new Error(`tikwm: ${lastMsg || 'invalid response'}`);

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

// tikcdn anti-leech placeholder: AI-generated robot-with-sign clip
// ("THIS APP IS OFFLINE. CONTINUE ON SSSTIK.IO…"). Two encodings observed
// from the live box: 4,089,113 bytes (2026-10-12 morning) and 2,882,204
// bytes / md5 17536d03… (2026-10-12 evening — the shorter cut users got
// delivered as a "working" video). Content-hash reject → chain falls
// through to the next provider. Size check backstops a future re-encode
// that rotates the md5 — the clip ships byte-identical per variant.
// tikcdn.io deliberately serves a promo clip instead of the real video,
// and re-encodes it (rotating md5/size), so it is NOT a usable provider:
// it is blocked host-level and kept out of the chain entirely. isPlaceholder
// stays as a content backstop in case another host serves the same clip.
const PLACEHOLDER_MD5 = new Set([
  '905a30c73f68e8b14152f1123336b083',
  '17536d037e61774f5511bd1c0619c7e4',
]);
const PLACEHOLDER_SIZES = new Set([4089113, 2882204]);

function isPlaceholder(buf) {
  if (PLACEHOLDER_SIZES.has(buf.length)) return true;
  return PLACEHOLDER_MD5.has(crypto.createHash('md5').update(buf).digest('hex'));
}

// ── Provider stats — which download methods actually work, over time ──
// Persisted to database/ttStats.json on every bump (tiny write). The
// box's IP reputation with TikTok-adjacent services rotates weekly, and
// this is how you SEE a provider dying before users complain.
const TT_STATS_PATH = path.join(__dirname, '../../database/ttStats.json');
let ttStats = { providers: {}, updated: 0 };
try { ttStats = JSON.parse(fs.readFileSync(TT_STATS_PATH, 'utf8')) || ttStats; } catch (e) {}
try { ttStats.providers = ttStats.providers || {}; } catch (e) {}

function ttBump(name, ok, note) {
  try {
    const p = ttStats.providers[name] || (ttStats.providers[name] = { ok: 0, fail: 0, lastFail: null });
    if (ok) p.ok++;
    else {
      p.fail++;
      p.lastFail = note || 'unknown';
    }
    ttStats.updated = Date.now();
    fs.writeFileSync(TT_STATS_PATH, JSON.stringify(ttStats, null, 2));
  } catch (e) { /* stats are cosmetic — never break the download */ }
}

// Shared: vm/vt short links hide the numeric id — follow redirects to the
// canonical /video/<digits> page first.
async function resolveCanonicalId(url) {
  let videoId = extractVideoId(url);
  if (!videoId && /(?:vm|vt)\.tiktok\.com\//i.test(url)) {
    try {
      const res = await axios.get(url, {
        timeout: 15000,
        maxRedirects: 5,
        responseType: 'text',
        maxContentLength: 1024 * 1024,
        headers: { 'User-Agent': TIKWM_HEADERS['User-Agent'] },
        ...apiAxiosConfig(),
      });
      videoId = extractVideoId((res.request && res.request.res && res.request.res.responseUrl) || '');
    } catch (e) { /* caller throws */ }
  }
  return videoId;
}

// Pull the signed v45 CDN URL out of an embed-player page. Handles both
// raw HTML form (slashes literal, query params as HTML entities) and
// JSON-escaped form (unicode-slash escape sequences).
function extractEmbedUrl(html) {
  if (!html || typeof html !== 'string') return null;
  const raw = html.match(/https:\/\/v45\.tiktokcdn-eu\.com[^"']*\/video\/tos\/[^"']+/);
  const escaped = html.match(/https:\\u002F\\u002Fv45\.tiktokcdn-eu\.com[^"]*video\\u002Ftos\\u002F[^"]+/);
  const hit = raw || escaped;
  if (!hit) return null;
  return hit[0]
    .replace(/\\u002F/g, '/')
    .replace(/&amp;/g, '&')
    .replace(/\\u0026/g, '&');
}

async function methodEmbed(url) {
  const videoId = await resolveCanonicalId(url);
  if (!videoId) throw new Error('embed: could not extract video ID');

  const pageUrl = `https://www.tiktok.com/embed/v2/${videoId}`;
  const res = await axios.get(pageUrl, {
    timeout: 20000,
    responseType: 'text',
    maxContentLength: 2 * 1024 * 1024,
    headers: {
      'User-Agent': TIKWM_HEADERS['User-Agent'],
      'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
    },
  });
  const videoUrl = extractEmbedUrl(res.data);
  if (!videoUrl) throw new Error('embed: no CDN URL in embed page');

  return { type: 'video', videoUrl, title: null };
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
        return extra.reply(`📝 _${voice.lead('neutral')}, send a TikTok link after the command_\n\n*${config.prefix || '.'}tt <tiktok url>*`);
      }

      const run = (async () => {
        const methods = [
          { name: 'tikapi', fn: () => methodTikApi(url) },
          { name: 'embed', fn: () => methodEmbed(url) },
          { name: 'tikwm', fn: () => methodTikwm(url) },
          { name: 'ruhend', fn: () => methodRuhend(url) }
          // tikcdn dropped: serves the ssstik promo clip, not the video
        ];

        let success = false;
        let lastError = null;
        const isPhotoLink = /\/photo\/\d+/.test(url);

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
              // /photo/ links are slideshows — the play_addr video rendition
              // (also returned by embed for photo awemes) won't play on
              // WhatsApp. Skip it and let the next provider try for images.
              if (isPhotoLink) {
                console.log(`[TT] ${method.name} returned a video rendition for a /photo/ link — skipping`);
                lastError = new Error(`${method.name}: video rendition of a photo post`);
                continue;
              }
              sent = await sendVideo(sock, extra.from, result.videoUrl, result.title, msg);
            }

            if (sent) {
              success = true;
              ttBump(method.name, true);
              break;
            }
            ttBump(method.name, false, 'send failed');
          } catch (e) {
            console.error(`[TT] ${method.name} failed: ${e.message}`);
            ttBump(method.name, false, e.message.slice(0, 60));
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
    methodTikApi,
    methodEmbed,
    extractEmbedUrl,
    isPlaceholder,
    isBlockedHost,
    resolveCanonicalId,
    extractVideoId,
    extractSlideshowImages,
    RUHEND_TIMEOUT_MS,
    URL_SEND_TIMEOUT_MS,
    WATCHDOG_MS,
    TIKTOK_REGEX,
  },
};
