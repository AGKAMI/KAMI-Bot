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

const config = require('../../config');
const database = require('../../database');
const { pick, SLANG } = require('../../utils/format');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

// ── Group lists with human-readable names ────────────────────
const GROUPS = {
  SSRS:      { jid: '120363402129417473@g.us', name: 'SSRS Royal Security' },
  KSSPS:     { jid: '120363421626159074@g.us', name: 'Metro Police' },
  KSSMP:     { jid: '120363409819775730@g.us', name: 'KSSMP Private Security' },
  KSSMS:     { jid: '120363423238834158@g.us', name: 'Maganyeni Security' },
  GENERAL:   { jid: '120363417242897528@g.us', name: 'SS Crew General' },
  TESTING:   { jid: '120363424309756901@g.us', name: 'Bot Testing' },
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
const EXTRAS  = [GROUPS.TESTING.jid, GROUPS.GARAGE.jid];
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
async function sendToTarget(sock, target, type, quoted, mediaBuffer) {
  const isNewsletter = target.endsWith('@newsletter');
  const nlCtx = isNewsletter ? {} : newsletterContext();

  if (type === 'text') {
    await sock.sendMessage(target, { text: getText(quoted), ...nlCtx });
  } else if (type === 'image' && mediaBuffer) {
    await sock.sendMessage(target, {
      image: mediaBuffer,
      caption: getCaption(quoted),
      ...nlCtx,
    });
  } else if (type === 'video' && mediaBuffer) {
    await sock.sendMessage(target, {
      video: mediaBuffer,
      caption: getCaption(quoted),
      ...nlCtx,
    });
  } else if (type === 'document' && mediaBuffer) {
    await sock.sendMessage(target, {
      document: mediaBuffer,
      fileName: quoted.documentMessage?.fileName || 'document',
      mimetype: quoted.documentMessage?.mimetype || 'application/octet-stream',
      ...nlCtx,
    });
  } else if (type === 'audio' && mediaBuffer) {
    await sock.sendMessage(target, {
      audio: mediaBuffer,
      mimetype: quoted.audioMessage?.mimetype || 'audio/ogg; codecs=opus',
      ...nlCtx,
    });
  } else if (type === 'sticker') {
    const stickerObj = { mimetype: quoted.stickerMessage?.mimetype || 'image/webp' };
    if (mediaBuffer) stickerObj.sticker = mediaBuffer;
    if (!isNewsletter) stickerObj.contextInfo = newsletterContext().contextInfo;
    await sock.sendMessage(target, stickerObj);
  } else {
    throw new Error('Unsupported type or missing media');
  }
}

module.exports = {
  name: 'announce',
  aliases: ['blast', 'shout'],
  category: 'owner',
  description: 'Forward a replied message to CPM groups with newsletter branding',
  usage: '.announce [all|ss]',
  ownerOnly: false,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      // ── Permission: owner or team admin ────────────────────
      if (!extra.isOwner && !database.isTeamAdmin(extra.sender)) {
        return extra.reply(
          `❌ ERROR\n\nOnly the owner or team admins can use this command`
        );
      }

      // ── Must be replying to a message ─────────────────────
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;
      if (!quoted) {
        return extra.reply(
          `❌ ERROR\n\nReply to a message to announce it\n\n` +
          `Usage:\n` +
          `• \`${prefix}announce\` — community + SS crew group + newsletter\n` +
          `• \`${prefix}announce ss\` — community + all SS crew + newsletter\n` +
          `• \`${prefix}announce all\` — all CPM groups + community + newsletter`
        );
      }

      // ── Parse mode ────────────────────────────────────────
      const mode = (args?.[0] || '').toLowerCase();
      if (mode && !['all', 'ss'].includes(mode)) {
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
        return extra.reply(
          `❌ ERROR\n\nUnsupported message type ${pick(SLANG.error)}\n` +
          `I can announce: text, photo, video, document, audio, sticker`
        );
      }

      // ── Download media if needed ──────────────────────────
      let mediaBuffer = null;
      if (type !== 'text') {
        try {
          mediaBuffer = await downloadMediaMessage(
            { message: quoted, key: msg.key },
            'buffer',
            {}
          );
        } catch (dlErr) {
          console.error('[ANNOUNCE] Media download failed:', dlErr.message);
          if (type !== 'sticker') {
            return extra.reply(
              `❌ ERROR\n\nCouldn't download the media ${pick(SLANG.error)}\nTry a different message`
            );
          }
        }
      }

      // ── React ⏳ ──────────────────────────────────────────
      await extra.react('⏳');

      // ── Send ALL targets in parallel — no delays ──────────
      const results = await Promise.allSettled(
        targets.map(target => sendToTarget(sock, target, type, quoted, mediaBuffer))
      );

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
        `\n_Slammed Society CPM_ ${pick(SLANG.vibe)}`;

      await extra.reply(summary);

    } catch (error) {
      console.error('Announce error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — ${error.message}`);
    }
  },
};
