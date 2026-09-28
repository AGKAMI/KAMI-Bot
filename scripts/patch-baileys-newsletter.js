#!/usr/bin/env node
/**
 * Port upstream Baileys PR #2434 (newsletter media upload fix) into the
 * installed package — the PR is still unmerged, so no release has it.
 *
 * Why: channel/newsletter media uploads were using the regular /mms/* paths,
 * so WhatsApp returned /o1/ directPaths instead of /m1/ and rejected the
 * message with ACK error 479 — media silently never appeared in the channel.
 * Text posts and group media were unaffected.
 *
 * Runs from package.json "postinstall" (so it re-applies after every
 * `npm install` on the host) and can be run by hand:
 *   node scripts/patch-baileys-newsletter.js [path-to-baileys/lib]
 *
 * Idempotent: already-patched files are skipped, never double-patched.
 *
 * Also patches `libsignal` (node_modules/libsignal/src/session_record.js):
 * it logs whole SessionEntry objects — private keys included — on every
 * session open/close, which floods the panel console with secrets. See
 * patchLibsignal() below.
 */

const fs = require('fs');
const path = require('path');

const defaultLib = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib');
const libDir = process.argv[2] ? path.resolve(process.argv[2]) : defaultLib;

if (!fs.existsSync(libDir)) {
  console.log(`[newsletter-patch] skip: ${libDir} not found (baileys not installed yet?)`);
  process.exit(0);
}

const join = (lines) => lines.join('\n');

const TRANSFORMS = [
  {
    file: 'Defaults/index.js',
    marker: 'NEWSLETTER_MEDIA_PATH_MAP',
    find: join([
      "    'biz-cover-photo': '/pps/biz-cover-photo'",
      '};',
      'export const MEDIA_HKDF_KEY_MAPPING = {',
    ]),
    replace: join([
      "    'biz-cover-photo': '/pps/biz-cover-photo'",
      '};',
      'export const NEWSLETTER_MEDIA_PATH_MAP = {',
      "    image: '/newsletter/newsletter-image',",
      "    video: '/newsletter/newsletter-video',",
      "    document: '/newsletter/newsletter-document',",
      "    audio: '/newsletter/newsletter-audio',",
      "    gif: '/newsletter/newsletter-gif',",
      "    ptt: '/newsletter/newsletter-ptt',",
      "    ptv: '/newsletter/newsletter-ptv',",
      "    sticker: '/newsletter/newsletter-sticker-pack',",
      "    'thumbnail-link': '/newsletter/newsletter-image'",
      '};',
      'export const MEDIA_HKDF_KEY_MAPPING = {',
    ]),
  },
  {
    file: 'Utils/messages-media.js',
    marker: 'NEWSLETTER_MEDIA_PATH_MAP }',
    find: "import { DEFAULT_ORIGIN, MEDIA_HKDF_KEY_MAPPING, MEDIA_PATH_MAP } from '../Defaults/index.js';",
    replace: "import { DEFAULT_ORIGIN, MEDIA_HKDF_KEY_MAPPING, MEDIA_PATH_MAP, NEWSLETTER_MEDIA_PATH_MAP } from '../Defaults/index.js';",
  },
  {
    file: 'Utils/messages-media.js',
    marker: 'timeoutMs, newsletter }',
    find: 'return async (filePath, { mediaType, fileEncSha256B64, timeoutMs }) => {',
    replace: 'return async (filePath, { mediaType, fileEncSha256B64, timeoutMs, newsletter }) => {',
  },
  {
    file: 'Utils/messages-media.js',
    marker: 'server_thumb_gen=1',
    find: '            const url = `https://${hostname}${MEDIA_PATH_MAP[mediaType]}/${fileEncSha256B64}?auth=${auth}&token=${fileEncSha256B64}`;',
    replace: join([
      '            const mediaPath = (newsletter ? NEWSLETTER_MEDIA_PATH_MAP[mediaType] : undefined) || MEDIA_PATH_MAP[mediaType];',
      '            let url = `https://${hostname}${mediaPath}/${fileEncSha256B64}?auth=${auth}&token=${fileEncSha256B64}`;',
      '            if (newsletter) {',
      "                url += '&server_thumb_gen=1';",
      "                if (mediaType === 'video' || mediaType === 'gif' || mediaType === 'ptv') {",
      "                    url += '&server_transcode=1';",
      '                }',
      '            }',
    ]),
  },
  {
    file: 'Utils/messages-media.js',
    marker: 'thumbnailDirectPath: result.thumbnail_info',
    // rc.9 spells the guard `result?.directPath`, rc.13 `result?.direct_path` —
    // start below the guard so one pattern covers both.
    find: join([
      '                        mediaUrl: result.url,',
      '                        directPath: result.direct_path,',
      '                        meta_hmac: result.meta_hmac,',
      '                        fbid: result.fbid,',
      '                        ts: result.ts',
      '                    };',
    ]),
    replace: join([
      '                        mediaUrl: result.url || result.direct_path,',
      '                        directPath: result.direct_path,',
      '                        meta_hmac: result.meta_hmac,',
      '                        fbid: result.fbid,',
      '                        ts: result.ts,',
      '                        thumbnailDirectPath: result.thumbnail_info?.thumbnail_direct_path,',
      '                        thumbnailSha256: result.thumbnail_info?.thumbnail_sha256',
      '                    };',
    ]),
  },
  {
    file: 'Utils/messages.js',
    marker: 'newsletter: true',
    find: join([
      '        const { mediaUrl, directPath } = await options.upload(filePath, {',
      '            fileEncSha256B64: fileSha256B64,',
      '            mediaType: mediaType,',
      '            timeoutMs: options.mediaUploadTimeoutMs',
      '        });',
      '        await fs.unlink(filePath);',
      '        const obj = WAProto.Message.fromObject({',
      '            // todo: add more support here',
      '            [`${mediaType}Message`]: MessageTypeProto[mediaType].fromObject({',
      '                url: mediaUrl,',
      '                directPath,',
      '                fileSha256,',
      '                fileLength,',
    ]),
    replace: join([
      '        const { directPath, thumbnailDirectPath, thumbnailSha256 } = await options.upload(filePath, {',
      '            fileEncSha256B64: fileSha256B64,',
      '            mediaType: mediaType,',
      '            timeoutMs: options.mediaUploadTimeoutMs,',
      '            newsletter: true',
      '        });',
      '        await fs.unlink(filePath);',
      '        const obj = WAProto.Message.fromObject({',
      '            // todo: add more support here',
      '            [`${mediaType}Message`]: MessageTypeProto[mediaType].fromObject({',
      '                // url intentionally omitted — newsletters use directPath only',
      '                directPath,',
      '                fileSha256,',
      '                fileLength,',
      '                thumbnailDirectPath,',
      '                thumbnailSha256: thumbnailSha256 ? Buffer.from(thumbnailSha256, \'base64\') : undefined,',
    ]),
  },
  {
    file: 'Socket/messages-send.js',
    marker: 'mediatype: mediaType',
    find: join([
      '                binaryNodeContent.push({',
      "                    tag: 'plaintext',",
      '                    attrs: {},',
      '                    content: bytes',
      '                });',
    ]),
    replace: join([
      '                binaryNodeContent.push({',
      "                    tag: 'plaintext',",
      '                    attrs: mediaType ? { mediatype: mediaType } : {},',
      '                    content: bytes',
      '                });',
    ]),
  },
];

// Never exits non-zero: this runs in the host's `postinstall`, and a patch
// failure must not take the bot's install down.

// libsignal prints full SessionEntry objects (privKey, rootKey, chainKey) to
// stdout on session churn. Drop those four statements entirely.
const LIBSIGNAL_TAG = '/* kami: session dumps removed */';
const LIBSIGNAL_DUMPS = [
  'console.warn("Session already closed", session);',
  'console.info("Closing session:", session);',
  'console.info("Opening session:", session);',
  'console.info("Removing old closed session:", oldestSession);',
];

function patchLibsignal() {
  const file = path.join(__dirname, '..', 'node_modules', 'libsignal', 'src', 'session_record.js');
  if (!fs.existsSync(file)) {
    console.log('[libsignal-patch] skip: libsignal not installed');
    return;
  }
  try {
    let src = fs.readFileSync(file, 'utf8');
    if (src.includes(LIBSIGNAL_TAG)) {
      console.log('[libsignal-patch] already patched');
      return;
    }
    let applied = 0;
    for (const dump of LIBSIGNAL_DUMPS) {
      if (src.includes(dump)) {
        src = src.replace(dump, '');
        applied++;
      }
    }
    if (!applied) {
      console.warn('[libsignal-patch] NOT APPLIED (libsignal layout changed?)');
      return;
    }
    if (!src.includes(LIBSIGNAL_TAG)) src += `\n${LIBSIGNAL_TAG}\n`;
    fs.writeFileSync(file, src, 'utf8');
    console.log(`[libsignal-patch] removed ${applied}/${LIBSIGNAL_DUMPS.length} session dumps`);
  } catch (e) {
    console.warn('[libsignal-patch] error (non-fatal):', e && e.message);
  }
}

try {
  let applied = 0;
  let already = 0;
  const missing = [];
  const touched = new Set();

  for (const t of TRANSFORMS) {
    const filePath = path.join(libDir, t.file);
    if (!fs.existsSync(filePath)) {
      missing.push(`${t.file} (file not found)`);
      continue;
    }
    const src = fs.readFileSync(filePath, 'utf8');

    if (src.includes(t.marker)) {
      already++;
      continue;
    }

    const first = src.indexOf(t.find);
    if (first === -1) {
      missing.push(`${t.file}: ${t.find.slice(0, 60).replace(/\n/g, '\\n')}…`);
      continue;
    }
    if (src.indexOf(t.find, first + 1) !== -1) {
      missing.push(`${t.file}: pattern not unique — refusing to patch`);
      continue;
    }

    fs.writeFileSync(filePath, src.replace(t.find, t.replace), 'utf8');
    touched.add(t.file);
    applied++;
  }

  const files = [...touched].sort();
  console.log(`[newsletter-patch] ${libDir}`);
  console.log(`[newsletter-patch] applied ${applied}, already patched ${already}`);
  if (files.length) console.log(`[newsletter-patch] changed: ${files.join(', ')}`);
  if (missing.length) {
    console.warn('[newsletter-patch] NOT APPLIED (package layout changed?):');
    for (const m of missing) console.warn(`[newsletter-patch]   - ${m}`);
  }
} catch (e) {
  console.warn('[newsletter-patch] error (non-fatal):', e && e.message);
}

patchLibsignal();
