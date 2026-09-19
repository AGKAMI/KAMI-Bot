/**
 * Crew Remove Command — Remove member from Slammed Society roster
 * Supports: @mention OR phone number
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');
const { resolveUser } = require('./crewHelpers');

module.exports = {
  subName: '',
  name: null,
  aliases: ['leave', 'fire'],
  category: 'crew',
  description: 'Remove member from crew roster',
  usage: '.crew remove @user|number',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      const resolved = resolveUser(args, mentioned, ctx);

      if (!resolved.jid) {
        return extra.reply(
          `❌ ERROR\n\nTag or add a number\n\n` +
          `Usage:\n` +
          `• .crew remove @user\n` +
          `• .crew remove 0833882383`
        );
      }

      const target = resolved.jid;
      const targetNum = target.split('@')[0];

      const member = database.getCrewMember(extra.from, target);
      if (!member) {
        return extra.reply(
          `❌ ERROR\n\n@${targetNum} is not in this crew`
        );
      }

      database.removeCrewMember(extra.from, target);

      await sock.sendMessage(extra.from, {
        text:
          `✅ SUCCESS\n\n` +
          `👤 MEMBER REMOVED\n\n` +
          `@${targetNum} has been removed\n\n` +
          `🏷️ Was: ${member.role}`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew remove error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't remove member`);
    }
  },
};
