/**
 * Announce Command — forward a replied message to CPM groups with newsletter branding.
 * Usage: .announce [all|ss]
 *   .announce        → Community + SS crew group + Newsletter
 *   .announce ss     → Community + SS crew groups + Newsletter
 *   .announce all    → ALL CPM groups + Community + SS crew groups + Newsletter
 *
 * Requires: reply to a message. Supports text, image, video, document, audio, sticker.
 * Sends all targets in parallel — no delays.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../../config');
const database = require('../../database');
const { pick, SLANG, voice } = require('../../utils/format');
const { downloadMediaMessage, generateThumbnail } = require('@whiskeysockets/baileys');

const SEND_GAP_MS = 400;
const MEDIA_LIMITS_MB = { image: 60, video: 150, document: 150, audio: 40, sticker: 10 };

function toBytes(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v.toNumber === 'function') {
    try { return v.toNumber(); } catch (e) { /* Long overflow */ }
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getFileLength(quoted, type) {
  return toBytes(quoted[`${type}Message`]?.fileLength);
}

// Build the thumbnail ONCE and hand it to every send — otherwise Baileys
// re-decodes the media per target (sharp/ffmpeg × N) and eats the container.
async function buildMediaProps(mediaBuffer, type) {
  if (!mediaBuffer) return {};
  try {
    if (type === 'image') {
      const { thumbnail, originalImageDimensions } = await generateThumbnail(mediaBuffer, 'image', {});
      const props = {};
      if (thumbnail) props.jpegThumbnail = thumbnail;
      if (originalImageDimensions?.width) {
        props.width = originalImageDimensions.width;
        props.height = originalImageDimensions.height;
      }
      return props;
    }
    if (type === 'video') {
      const tmp = path.join(os.tmpdir(), `kami-announce-${Date.now()}.vid`);
      await fs.promises.writeFile(tmp, mediaBuffer);
      try {
        const { thumbnail } = await generateThumbnail(tmp, 'video', {});
        return thumbnail ? { jpegThumbnail: thumbnail } : {};
      } finally {
        await fs.promises.unlink(tmp).catch(() => {});
      }
    }
  } catch (e) {
    console.error('[ANNOUNCE] thumb precompute skipped:', e.message);
  }
  return {};
}

// WhatsApp HD photos/videos are dual uploads: the visible SD parent plus a
// companion HD child linked by MessageAssociation (HD_IMAGE_DUAL_UPLOAD = 10,
// HD_VIDEO_DUAL_UPLOAD = 5). The child lands in the live message store — find
// it so we forward the HD rendition instead of the SD one.
const SD_PARENT = { image: 3, video: 1 }; // SD_IMAGE_PARENT / SD_VIDEO_PARENT

function findHdChild(store, chatJid, parentId, type) {
  const chatMsgs = store?.messages?.get(chatJid);
  if (!chatMsgs) return null;
  const want = type === 'image' ? 10 : 5;
  for (const m of chatMsgs.values()) {
    const assoc = m?.message?.messageAssociation;
    if (
      assoc &&
      Number(assoc.associationType) === want &&
      assoc.parentMessageKey?.id === parentId
    ) {
      return m;
    }
  }
  return null;
}

// Pick what we actually download: the HD child when the quoted message is the
// SD parent, otherwise the quoted message itself (never downgrades to SD).
function resolveMediaRef(store, chatJid, ctx, quoted, type, fallbackKey) {
  const base = { message: quoted, key: fallbackKey };
  if (type !== 'image' && type !== 'video') {
    return { ref: base, usingHd: false, paired: null };
  }
  const paired = quoted[`${type}Message`]?.contextInfo?.pairedMediaType ?? null;
  const quotedId = ctx?.stanzaId;
  if (quotedId && paired === SD_PARENT[type]) {
    const child = findHdChild(store, chatJid, quotedId, type);
    if (child?.message) {
      return { ref: { message: child.message, key: child.key || fallbackKey }, usingHd: true, paired };
    }
  }
  return { ref: base, usingHd: false, paired };
}

async function downloadOne(ref) {
  try {
    return await downloadMediaMessage(ref, 'buffer', {});
  } catch (e) {
    console.error('[ANNOUNCE] media download failed:', e.message);
    return null;
  }
}

// ── Group lists with human-readable names ────────────────────
const GROUPS = {
  SSRS:      { jid: '120363402129417473@g.us', name: 'SSRS Royal Security' },
  KSSPS:     { jid: '120363421626159074@g.us', name: 'Metro Police' },
  KSSMP:     { jid: '120363409819775730@g.us', name: 'KSSMP Private Security' },
  KSSMS:     { jid: '120363423238834158@g.us', name: 'Maganyeni Security' },
  GENERAL:   { jid: '120363417242897528@g.us', name: 'SS Crew General' },
  GARAGE:    { jid: '120363404874858785@g.us', name: 'Exclusive Garage' },
  COMMUNITY: { jid: '120363418980604721@g.us', name: 'Community Announcements' },
  NEWSLETTER:{ jid: '120363399255608558@newsletter', name: 'Slammed Society Channel' },
};

// Build reverse lookup: jid → name
const JID_TO_NAME = {};
for (const [, g] of Object.entries(GROUPS)) {
  JID_TO_NAME[g.jid] = g.name;
}

const SS_CREW = [GROUPS.SSRS.jid, GROUPS.KSSPS.jid, GROUPS.KSSMP.jid, GROUPS.KSSMS.jid];
// Bot Testing was never meant to be an announce target (item-not-found on
// every run — the bot isn't in that group). `all` = 8 targets now.
const EXTRAS  = [GROUPS.GARAGE.jid];
const BASE    = [GROUPS.COMMUNITY.jid, GROUPS.GENERAL.jid, GROUPS.NEWSLETTER.jid];

function getTargets(mode) {
  if (mode === 'all') return [...BASE, ...SS_CREW, ...EXTRAS];
  if (mode === 'ss')  return [...BASE, ...SS_CREW];
  return BASE;
}

function getGroupName(jid) {
  return JID_TO_NAME[jid] || jid.split('@')[0];
}

// ── Newsletter context for group messages ────────────────────
function newsletterContext() {
  const jid = config.newsletterJid || '';
  if (!jid) return {};
  return {
    contextInfo: {
      forwardingScore: 1,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: jid,
        newsletterName: config.botName || 'KAMI Bot',
        serverMessageId: -1,
      },
    },
  };
}

// ── Detect message type from quoted message ──────────────────
function detectType(quoted) {
  if (quoted.conversation || quoted.extendedTextMessage?.text) return 'text';
  if (quoted.imageMessage) return 'image';
  if (quoted.videoMessage) return 'video';
  if (quoted.documentMessage) return 'document';
  if (quoted.audioMessage) return 'audio';
  if (quoted.stickerMessage) return 'sticker';
  return null;
}

// ── Get text content from quoted message ─────────────────────
function getText(quoted) {
  return quoted.conversation || quoted.extendedTextMessage?.text || '';
}

// ── Get caption from media message ───────────────────────────
function getCaption(quoted) {
  return quoted.imageMessage?.caption || quoted.videoMessage?.caption || '';
}

// ── Send to a single target ─────────────────────────────────
async function sendToTarget(sock, target, type, quoted, mediaBuffer, mediaProps = {}) {
  const isNewsletter = target.endsWith('@newsletter');
  const nlCtx = isNewsletter ? {} : newsletterContext();

  // Hidden mention: tag every member of the group (notify without visible @tags)
  let mentions;
  if (!isNewsletter) {
    try {
      const meta = await sock.groupMetadata(target);
      mentions = (meta.participants || []).map(p => p.id || p.lid).filter(Boolean);
    } catch (e) {
      console.error(`[ANNOUNCE] groupMetadata failed for ${target}:`, e.message);
    }
  }
  const withMentions = (content) => {
    if (mentions && mentions.length) content.mentions = mentions;
    return content;
  };

  if (type === 'text') {
    await sock.sendMessage(target, withMentions({ text: getText(quoted), ...nlCtx }));
  } else if (type === 'image' && mediaBuffer) {
    await sock.sendMessage(target, withMentions({
      image: mediaBuffer,
      caption: getCaption(quoted),
      ...mediaProps,
      ...nlCtx,
    }));
  } else if (type === 'video' && mediaBuffer) {
    await sock.sendMessage(target, withMentions({
      video: mediaBuffer,
      caption: getCaption(quoted),
      ...mediaProps,
      ...nlCtx,
    }));
  } else if (type === 'document' && mediaBuffer) {
    await sock.sendMessage(target, withMentions({
      document: mediaBuffer,
      fileName: quoted.documentMessage?.fileName || 'document',
      mimetype: quoted.documentMessage?.mimetype || 'application/octet-stream',
      caption: quoted.documentMessage?.caption,
      ...nlCtx,
    }));
  } else if (type === 'audio' && mediaBuffer) {
    await sock.sendMessage(target, withMentions({
      audio: mediaBuffer,
      mimetype: quoted.audioMessage?.mimetype || 'audio/ogg; codecs=opus',
      ...nlCtx,
    }));
  } else if (type === 'sticker') {
    const stickerObj = { mimetype: quoted.stickerMessage?.mimetype || 'image/webp' };
    if (mediaBuffer) stickerObj.sticker = mediaBuffer;
    if (!isNewsletter) stickerObj.contextInfo = newsletterContext().contextInfo;
    await sock.sendMessage(target, withMentions(stickerObj));
  } else {
    throw new Error('Unsupported type or missing media');
  }
}

module.exports = {
  name: 'announce',
  reactions: { received: '📢', generating: '📣', done: '✅' },
  aliases: ['blast', 'shout'],
  category: 'owner',
  description: 'Push a replied message to CPM groups with newsletter branding',
  usage: '.announce [all|ss]',
  ownerOnly: false,
  // Shared with adminpush.js — same download/thumbnail/limit pipeline
  _internals: {
    findHdChild, resolveMediaRef, getFileLength,
    detectType, getText, getCaption, downloadOne, buildMediaProps,
    MEDIA_LIMITS_MB, SEND_GAP_MS, newsletterContext,
  },

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      // ── Permission: owner or team admin ────────────────────
      if (!extra.isOwner && !database.isTeamAdmin(extra.sender)) {
        extra.fail();
        return extra.reply(
          `❌ ERROR\n\nOnly the owner or team admins can use this, hey`
        );
      }

      // ── Must be replying to a message ─────────────────────
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;
      if (!quoted) {
        extra.fail();
        return extra.reply(
          `❌ ERROR\n\nReply to a message if you want it announced\n\n` +
          `Usage:\n` +
          `• \`${prefix}announce\` — community + SS crew group + newsletter\n` +
          `• \`${prefix}announce ss\` — community + all SS crew + newsletter\n` +
          `• \`${prefix}announce all\` — all CPM groups + community + newsletter`
        );
      }

      // ── Parse mode ────────────────────────────────────────
      const mode = (args?.[0] || '').toLowerCase();
      if (mode && !['all', 'ss'].includes(mode)) {
        extra.fail();
        return extra.reply(
          `❌ ERROR\n\nUnknown mode: ${mode}\n\n` +
          `Use: \`${prefix}announce\`, \`${prefix}announce ss\`, or \`${prefix}announce all\``
        );
      }

      const targets = getTargets(mode);
      const modeLabel = mode === 'all' ? 'ALL CPM GROUPS'
        : mode === 'ss' ? 'SS CREW GROUPS'
        : 'COMMUNITY + SS CREW + NEWSLETTER';

      // ── Detect content type ───────────────────────────────
      const type = detectType(quoted);
      if (!type) {
        extra.fail();
        return extra.reply(
          `❌ ERROR\n\nThat message type won't work, ${voice.tag('err')}\n` +
          `I can push: text, photo, video, document, audio, sticker`
        );
      }

      // ── HD pairing: forward the HD rendition when one exists ──
      let store = null;
      try {
        ({ store } = require('../../index'));
      } catch (e) {
        console.error('[ANNOUNCE] store unavailable, staying on SD:', e.message);
      }
      const { ref: mediaRef, usingHd, paired } = resolveMediaRef(
        store, msg.key.remoteJid, ctx, quoted, type, msg.key
      );
      if (type === 'image' || type === 'video') {
        console.log(`[ANNOUNCE] pairedMediaType=${paired ?? 'n/a'} hd=${usingHd}`);
      }

      // ── Size guard — a huge download takes the whole box down ──
      let mediaBytes = 0;
      if (type !== 'text') {
        mediaBytes = getFileLength(mediaRef.message, type);
        const limitMb = MEDIA_LIMITS_MB[type];
        const mediaMb = mediaBytes / (1024 * 1024);
        if (limitMb && mediaMb > limitMb) {
          extra.fail();
          return extra.reply(
            `❌ ERROR\n\nThat ${type} is ${mediaMb.toFixed(0)} MB — over my ${limitMb} MB announce limit, ${voice.tag('err')}\n` +
            `Send it as a link instead`
          );
        }
      }

      console.log(
        `[ANNOUNCE] mode=${mode || 'default'} type=${type} ` +
        `size=${(mediaBytes / 1048576).toFixed(1)}MB targets=${targets.length}`
      );

      // ── Download media if needed (HD first, SD fallback) ──────
      let mediaBuffer = null;
      if (type !== 'text') {
        mediaBuffer = await downloadOne(mediaRef);
        if (!mediaBuffer && usingHd) {
          console.error('[ANNOUNCE] HD download failed, falling back to SD');
          mediaBuffer = await downloadOne({ message: quoted, key: msg.key });
        }
        if (!mediaBuffer && type !== 'sticker') {
          extra.fail();
          return extra.reply(
            `❌ ERROR\n\nCouldn't grab the media, ${voice.tag('err')}\nTry a different message`
          );
        }
      }

      // ── Precompute thumbnail once (skips Baileys per-send encode) ──
      const mediaProps = await buildMediaProps(mediaBuffer, type);

      // ── Send SEQUENTIALLY — one media encode at a time ─────
      // Parallel sends each re-encoded the media and OOM'd the container (exit 137).
      const results = [];
      for (let i = 0; i < targets.length; i++) {
        try {
          await sendToTarget(sock, targets[i], type, quoted, mediaBuffer, mediaProps);
          results.push({ status: 'fulfilled' });
        } catch (err) {
          results.push({ status: 'rejected', reason: err });
        }
        if (i < targets.length - 1) {
          await new Promise(r => setTimeout(r, SEND_GAP_MS));
        }
      }
      mediaBuffer = null;

      // ── Tally results ────────────────────────────────────
      let success = 0;
      let failed = 0;
      const failedGroups = [];

      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          success++;
        } else {
          failed++;
          const name = getGroupName(targets[i]);
          failedGroups.push(`${name}: ${result.reason?.message || 'send failed'}`);
          console.error(`[ANNOUNCE] Failed → ${name} (${targets[i]}):`, result.reason?.message);
        }
      });

      // ── Summary ───────────────────────────────────────────
      const summary =
        `✅ *ANNOUNCE COMPLETE*\n\n` +
        `📢 Mode: *${modeLabel}*\n` +
        `✅ Sent: *${success}*\n` +
        (failed > 0
          ? `❌ Failed: *${failed}*\n${failedGroups.map(g => `  • ${g}`).join('\n')}\n`
          : '') +
        `\n_Slammed Society CPM_ ${voice.lead('neutral')}`;

      await extra.reply(summary);

    } catch (error) {
      console.error('Announce error:', error);
      extra.fail();
      await extra.reply(`❌ ERROR\n\n${voice.openErr()} — ${error.message}`);
    }
  },
};
