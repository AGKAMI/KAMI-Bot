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
  reactions: { received: '📈', done: '⬆️' },
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

  // Delegate to the main demote command — inherits the full protection:
  // admin-only check, target-admin check, owner-demote protection,
  // owner-promoted two-strike system (blocked demote → violator demoted)
  const demoteCmd = require('./demote');
  const config = require('../../config');
  const senderNum = sender.split(':')[0].split('@')[0].replace(/\D/g, '');
  const senderIsOwner = (config.ownerNumber || []).some(n => n.replace(/\D/g, '') === senderNum);

  await demoteCmd.execute(sock, msg, [target], {
    from,
    sender,
    isGroup: true,
    isOwner: senderIsOwner,
    isOwnerMentioned: false,
    reply: (text, opts) => sock.sendMessage(from, { text, ...(opts || {}) }, { quoted: msg }),
  });
});
