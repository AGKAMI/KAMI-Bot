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
          `❌ ERROR\n\nTag or reply to someone\n\n` +
          `Usage:\n` +
          `• ${prefix}promote @user\n` +
          `• Reply with ${prefix}promote`
        );
      }

      await sock.groupParticipantsUpdate(extra.from, [target], 'promote');

      // Track owner-promoted admins for protection
      let protectionNote = '';
      if (extra.isOwner) {
        database.addOwnerPromotedAdmin(extra.from, target, extra.sender);
        protectionNote = '\n\n🛡️ This admin is now *protected* — only you can demote them';
      }

      await sendButtons(sock, extra.from, {
        text: `✅ SUCCESS\n\n⬆️ PROMOTED\n\n${mention(target)} is now a group admin${protectionNote}`,
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
  try {
    await sock.groupParticipantsUpdate(from, [target], 'demote');
    await sock.sendMessage(from, {
      text: `⬇️ *DEMOTED*\n\n${mention(target)} _has been removed from admin_`,
      mentions: [target],
    });
  } catch (e) {
    console.error('[DEMOTE BTN] Error:', e.message);
    await sock.sendMessage(from, { text: `❌ *DEMOTE FAILED*\n\n${e.message || "Couldn't demote user"}` });
  }
});
