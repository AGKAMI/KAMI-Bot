/**
 * Promote Command — Promote someone to WhatsApp group admin
 */

const { pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'promote',
  category: 'admin',
  description: 'Promote member to group admin',
  usage: '.promote @user',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      const replyJid = ctx?.participant;

      let target = null;

      // Method 1: Reply
      if (replyJid) {
        target = replyJid;
      }
      // Method 2: @mention
      else if (mentioned.length > 0) {
        target = mentioned[0];
      }

      if (!target) {
        return extra.reply(
          `❌ ERROR\n\nTag or reply to someone\n\n` +
          `Usage:\n` +
          `• .promote @user\n` +
          `• Reply with .promote`
        );
      }

      const targetNum = target.split('@')[0];

      await sock.groupParticipantsUpdate(extra.from, [target], 'promote');

      await sock.sendMessage(extra.from, {
        text: `✅ SUCCESS\n\n⬆️ PROMOTED\n\n@${targetNum} is now a group admin`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Promote error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't promote`);
    }
  },
};
