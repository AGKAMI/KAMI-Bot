/**
 * Promote Command — Promote someone to WhatsApp group admin
 * If the owner promotes someone, they are automatically protected from demotion by others.
 */

const database = require('../../database');
const config = require('../../config');
const { pick, SLANG, mention } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

module.exports = {
  name: 'promote',
  category: 'admin',
  description: 'Promote member to group admin',
  usage: '.promote @user',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    const prefix = config.prefix || '.';
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      const replyJid = ctx?.participant;

      let target = null;

      // Priority: @mention → reply
      if (mentioned.length > 0) {
        target = mentioned[0];
      } else if (replyJid) {
        target = replyJid;
      }

      if (!target) {
        return extra.reply(
          `❌ ERROR\n\n` +
          `Tag or reply to someone\n\n` +
          `Usage:\n` +
          `• ${prefix}promote @user\n` +
          `• Reply with ${prefix}promote`
        );
      }

      // ── Check owner-demoted blacklist ─────────────────────
      if (!extra.isOwner && database.isOwnerDemoted(extra.from, target)) {
        return extra.reply(
          `🚫 *PROMOTE BLOCKED*\n\n` +
          `${mention(target)} was demoted by the owner\n\n` +
          `Only the owner can promote them again`,
          { mentions: [target] }
        );
      }

      // ── Check if already admin ────────────────────────────
      const meta = await sock.groupMetadata(extra.from).catch(() => null);
      if (meta && meta.participants) {
        const isAlreadyAdmin = meta.participants.some(
          p => (p.id === target || p.lid === target) && (p.admin === 'admin' || p.admin === 'superadmin')
        );
        if (isAlreadyAdmin) {
          return extra.reply(
            `❌ ERROR\n\n` +
            `${mention(target)} is already an admin\n\n` +
            `No need to promote them again`
          );
        }
      }

      await sock.groupParticipantsUpdate(extra.from, [target], 'promote');

      // Track owner-promoted admins for protection
      let protectionNote = '';
      if (extra.isOwner) {
        database.addOwnerPromotedAdmin(extra.from, target, extra.sender);
        // Clear demoted flag — owner re-promotion is forgiveness
        database.removeOwnerDemoted(extra.from, target);
        protectionNote = '\n\n🛡️ This admin is now *protected* — only you can demote them';
      }

      await sendButtons(sock, extra.from, {
        text:
          `✅ SUCCESS\n\n` +
          `⬆️ PROMOTED\n\n` +
          `${mention(target)} is now a group admin${protectionNote}\n\n` +
          `_${pick(SLANG.vibe)}_`,
        mentions: [target],
        footer: 'Admin Actions',
        buttons: [
          { id: `admin:demote:${target.split(':')[0]}`, text: '⬇️ Demote' },
        ],
      }, { quoted: msg });

    } catch (error) {
      console.error('Promote error:', error);
      const reason = error?.message || error?.output?.payload?.message || 'Unknown error';
      await extra.reply(`❌ ERROR\n\nCouldn't promote — ${reason}`);
    }
  },
};

// Button handlers
onButton('admin:demote', async (sock, msg, from, sender, btnId) => {
  const target = btnId.replace('admin:demote:', '');
  if (!target) return;

  // Permission check — only group admins or owner can demote
  try {
    const meta = await sock.groupMetadata(from).catch(() => null);
    if (meta && meta.participants) {
      const clickerIsAdmin = meta.participants.some(
        p => (p.id === sender || p.lid === sender) && (p.admin === 'admin' || p.admin === 'superadmin')
      );
      const config = require('../../config');
      const clickerIsOwner = (config.ownerNumber || []).some(n => sender.includes(n));
      if (!clickerIsAdmin && !clickerIsOwner) {
        return await sock.sendMessage(from, {
          text: `❌ *ADMIN ONLY*\n\nOnly group admins can demote members.`,
          mentions: [sender],
        });
      }
    }
  } catch (e) {
    console.error('[DEMOTE BTN] permission check failed:', e.message);
  }

  // ── Check if target is actually an admin before demoting ──
  try {
    const meta = await sock.groupMetadata(from).catch(() => null);
    if (meta && meta.participants) {
      const isAdmin = meta.participants.some(
        p => (p.id === target || p.lid === target) && (p.admin === 'admin' || p.admin === 'superadmin')
      );
      if (!isAdmin) {
        return await sock.sendMessage(from, {
          text:
            `❌ ERROR\n\n` +
            `${mention(target)} is not an admin\n\n` +
            `Can't demote someone who isn't an admin`,
          mentions: [target],
        });
      }
    }

    await sock.groupParticipantsUpdate(from, [target], 'demote');

    // Track owner demotions — blocks future promotes by anyone else
    const config = require('../../config');
    const senderNum = sender.split(':')[0].split('@')[0].replace(/\D/g, '');
    const isSenderOwner = (config.ownerNumber || []).some(n => n.replace(/\D/g, '') === senderNum);
    let demoteNote = '';
    if (isSenderOwner) {
      database.addOwnerDemoted(from, target, sender);
      // Clear promoted entry — they're no longer admin, auto-repromote must not fire
      database.removeOwnerPromotedAdmin(from, target);
      demoteNote = '\n\n🚫 This person can *never be promoted* by anyone else — only you can';
    }

    await sock.sendMessage(from, {
      text:
        `✅ SUCCESS\n\n` +
        `⬇️ DEMOTED\n\n` +
        `${mention(target)} is no longer a group admin${demoteNote}\n\n` +
        `_${pick(SLANG.vibe)}_`,
      mentions: [target],
    });
  } catch (e) {
    console.error('[DEMOTE BTN] Error:', e.message);
    await sock.sendMessage(from, {
      text:
        `❌ ERROR\n\n` +
        `Couldn't demote — ${e.message || 'Unknown error'}`,
    });
  }
});
