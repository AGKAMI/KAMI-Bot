/**
 * Crew Remove Command — Remove member from Slammed Society roster
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'remove',
  aliases: ['leave', 'fire'],
  category: 'crew',
  description: 'Remove member from crew roster',
  usage: '.crew remove @user',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      if (mentioned.length === 0) {
        return extra.reply(
          `❌ ERROR\n\nTag or reply to the person you wanna remove ${pick(SLANG.friend)}\n\n` +
          `Usage: .crew remove @user`
        );
      }

      const target = mentioned[0];
      const targetNum = target.split('@')[0];

      const member = database.getCrewMember(extra.from, target);
      if (!member) {
        return extra.reply(
          `❌ ERROR\n\n@${targetNum} is not in the crew ${pick(SLANG.vibe)}`
        );
      }

      database.removeCrewMember(extra.from, target);

      await sock.sendMessage(extra.from, {
        text:
          `✅ SUCCESS\n\n` +
          `👤 MEMBER REMOVED\n\n` +
          `@${targetNum} has been removed from Slammed Society\n\n` +
          `🏷️ Was: ${member.role}\n` +
          `🏢 Team: ${member.team || 'Unassigned'}`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew remove error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't remove member`);
    }
  },
};
