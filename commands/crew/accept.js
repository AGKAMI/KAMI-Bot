/**
 * Crew Accept Command — Accept applicant to crew
 * Supports: @mention OR phone number
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');
const { resolveUser } = require('./crewHelpers');

module.exports = {
  name: 'accept',
  aliases: ['hire'],
  category: 'crew',
  description: 'Accept applicant to crew',
  usage: '.crew accept @user|number [role]',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      const resolved = resolveUser(args, mentioned);

      if (!resolved.jid) {
        return extra.reply(
          `❌ ERROR\n\nTag or add a number\n\nUsage: .crew accept @user|number [role]`
        );
      }

      const target = resolved.jid;
      const targetNum = target.split('@')[0];

      const applicants = database.getApplicants(extra.from);
      const applicant = applicants[target];

      if (!applicant) {
        return extra.reply(`❌ ERROR\n\n@${targetNum} hasn't applied`);
      }

      const role = resolved.args[0] || 'member';

      // Add to crew
      database.addCrewMember(extra.from, target, {
        role,
        joined: Date.now(),
        addedBy: extra.sender,
      });

      // Remove from applicants
      database.removeApplicant(extra.from, target);

      await sock.sendMessage(extra.from, {
        text:
          `✅ SUCCESS\n\n🎉 MEMBER ACCEPTED\n\n` +
          `@${targetNum} has been accepted\n\n` +
          `🏷️ Role: ${bold(role)}`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew accept error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't accept member`);
    }
  },
};
