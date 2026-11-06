/**
 * Instagram Downloader - Using ruhend-scraper
 */

const { igdl } = require('ruhend-scraper');
const config = require('../../config');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');
const { withTimeout } = require('../../utils/withTimeout');
const fs = require('fs');
const path = require('path');
const os = require('os');
const fsp = require('fs').promises;

// Hard ceilings — see utils/withTimeout.js for why (frozen-⬇️ bug).
const IGDL_TIMEOUT_MS = 30000;
const URL_SEND_TIMEOUT_MS = 60000;
// Umbrella watchdog; the env override is a test seam only.
const WATCHDOG_MS = Number(process.env.IG_WATCHDOG_MS) || 180000;
// Cap downloads — Baileys buffers whole video in RAM → OOM on 256MB box.
const MAX_VIDEO_BYTES = 16 * 1024 * 1024;

// Store processed message IDs to prevent duplicates
const processedMessages = new Map(); // id → timestamp

// Periodic sweep every 5 min instead of individual setTimeout
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, ts] of processedMessages) {
    if (ts < cutoff) processedMessages.delete(id);
  }
}, 5 * 60 * 1000);

// Function to extract unique media URLs with simple deduplication
function extractUniqueMedia(mediaData) {
  const uniqueMedia = [];
  const seenUrls = new Set();
  
  for (const media of mediaData) {
    if (!media.url) continue;
    
    // Only check for exact URL duplicates
    if (!seenUrls.has(media.url)) {
      seenUrls.add(media.url);
      uniqueMedia.push(media);
    }
  }
  
  return uniqueMedia;
}

// Function to validate media URL
function isValidMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  // Accept any URL that looks like media
  return url.includes('cdninstagram.com') || 
         url.includes('instagram') || 
         url.includes('http');
}

module.exports = {
  name: 'instagram',
  reactions: { received: '📸', generating: '⬇️', done: '🌆' },
  aliases: ['ig', 'insta', 'igdl', 'reels'],
  category: 'media',
  description: 'Download Instagram photos/videos/reels',
  usage: '<Instagram URL>',
  
  async execute(sock, msg, args, extra) {
    let watchdogTimer = null;
    let aborted = false;
    try {
      const chatId = extra.from;

      // Check if message has already been processed
      if (processedMessages.has(msg.key.id)) {
        return;
      }

      // Add message ID to processed set
      processedMessages.set(msg.key.id, Date.now());

      const text = msg.message?.conversation ||
                   msg.message?.extendedTextMessage?.text ||
                   args.join(' ');

      if (!text) {
        return extra.reply(`📝 _${voice.lead('neutral')}, send me an Instagram link for the video_`);
      }

      // Check for various Instagram URL formats
      const instagramPatterns = [
        /https?:\/\/(?:www\.)?instagram\.com\//,
        /https?:\/\/(?:www\.)?instagr\.am\//,
        /https?:\/\/(?:www\.)?instagram\.com\/p\//,
        /https?:\/\/(?:www\.)?instagram\.com\/reel\//,
        /https?:\/\/(?:www\.)?instagram\.com\/tv\//
      ];

      const isValidUrl = instagramPatterns.some(pattern => pattern.test(text));

      if (!isValidUrl) {
        extra.fail();
        return extra.reply(`❌ _${voice.openErr()}, that's not a valid Instagram link — I need a post, reel or video link_`);
      }

      // Everything below is bounded: igdl by IGDL_TIMEOUT_MS, each URL
      // send by URL_SEND_TIMEOUT_MS, and the whole body by the watchdog —
      // so execute() always settles and the ❌ verdict always lands.
      const run = (async () => {
        const downloadData = await withTimeout(igdl(text), IGDL_TIMEOUT_MS, 'igdl');

        if (!downloadData || !downloadData.data || downloadData.data.length === 0) {
          extra.fail();
          return extra.reply(`❌ _${voice.openErr()}, no media found — might be private_`);
        }

        const mediaData = downloadData.data;

        // Simple deduplication - just remove exact URL duplicates
        const uniqueMedia = extractUniqueMedia(mediaData);

        // Limit to maximum 20 unique media items
        const mediaToDownload = uniqueMedia.slice(0, 20);

        if (mediaToDownload.length === 0) {
          extra.fail();
          return extra.reply(`❌ _${voice.openErr()}, no media to download — might be private_`);
        }

        let sent = 0;

        // Download all media silently without status messages
        for (let i = 0; i < mediaToDownload.length; i++) {
          if (aborted) break;
          try {
            const media = mediaToDownload[i];
            const mediaUrl = media.url;

            // Check if URL ends with common video extensions
            const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl) ||
                          media.type === 'video' ||
                          text.includes('/reel/') ||
                          text.includes('/tv/');

            let tmpFile = null;
            try {
              if (isVideo) {
                // Download video to temp file first (size-capped), then send from disk
                const res = await axios.get(mediaUrl, {
                  responseType: 'stream',
                  timeout: 120000,
                  maxContentLength: MAX_VIDEO_BYTES,
                  maxBodyLength: MAX_VIDEO_BYTES,
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                  },
                });
                const declared = Number(res.headers['content-length']) || 0;
                if (declared > MAX_VIDEO_BYTES) {
                  res.data.destroy?.();
                  throw new Error(`video too large (${Math.round(declared / 1048576)}MB > 16MB)`);
                }
                tmpFile = path.join(os.tmpdir(), `ig-${Date.now()}-${Math.floor(Math.random() * 1e6)}.mp4`);
                await new Promise((resolve, reject) => {
                  let written = 0;
                  const out = fs.createWriteStream(tmpFile);
                  res.data.on('data', (chunk) => {
                    written += chunk.length;
                    if (written > MAX_VIDEO_BYTES) {
                      out.destroy();
                      res.data.destroy?.();
                      reject(new Error('video too large (>16MB)'));
                    }
                  });
                  res.data.on('error', (e) => { out.destroy(); reject(e); });
                  out.on('error', (e) => { res.data.destroy?.(); reject(e); });
                  out.on('finish', resolve);
                  res.data.pipe(out);
                });

                await withTimeout(sock.sendMessage(chatId, {
                  video: { url: tmpFile },
                  mimetype: 'video/mp4',
                  caption: `*DOWNLOADED BY ${config.botName.toUpperCase()}*\n_${voice.lead('affirm')}, enjoy_`
                }, { quoted: msg }), URL_SEND_TIMEOUT_MS, 'URL send');
              } else {
                await withTimeout(sock.sendMessage(chatId, {
                  image: { url: mediaUrl },
                  caption: `*DOWNLOADED BY ${config.botName.toUpperCase()}*\n_${voice.lead('affirm')}, enjoy_`
                }, { quoted: msg }), URL_SEND_TIMEOUT_MS, 'URL send');
              }
              sent++;
            sent++;

            // Cleanup temp file after send
            if (tmpFile) {
              await fsp.unlink(tmpFile).catch(() => {});
              tmpFile = null;
            }

            // Add small delay between downloads to prevent rate limiting
            if (i < mediaToDownload.length - 1 && !aborted) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }

          } catch (mediaError) {
            console.error(`Error downloading media ${i + 1}:`, mediaError);
            // Cleanup temp file on error too
            if (tmpFile) {
              await fsp.unlink(tmpFile).catch(() => {});
              tmpFile = null;
            }
            // Continue with next media if one fails
          }
        } catch (mediaError) {
          console.error(`Error downloading media batch:`, mediaError);
        }
        }

        // The watchdog already reported this run — don't double-reply.
        if (aborted) return;
        // A run where nothing got through is a failure, not a ✅.
        if (sent === 0) {
          extra.fail();
          return extra.reply(`❌ _${voice.openErr()}, every download failed — try that post again_`);
        }
      })();

      // Late failures after the watchdog took over must stay silent.
      run.catch(e => console.error('[IG] run failed after watchdog:', e.message));

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
      console.error('Error in Instagram command:', error);
      extra.fail();
      const timedOut = /timed out/.test(error.message || '');
      await extra.reply(timedOut
        ? `❌ _${voice.openErr()}, download timed out — try that link again_`
        : `❌ _${voice.openErr()}, instagram error — try again_`);
    } finally {
      if (watchdogTimer) clearTimeout(watchdogTimer);
    }
  }
};
