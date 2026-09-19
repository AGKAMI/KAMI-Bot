/**
 * Crew Deny Command — Deny applicant from Slammed Society crew
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'deny',
  aliases: ['reject'],
  category: 'crew',
  description: 'Deny applicant from crew',
  usage: '.crew deny @user [reason]',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      if (mentioned.length === 0) {
        return extra.reply(
          `❌ ERROR\n\nTag the person you wanna deny ${pick(SLANG.friend)}\n\n` +
          `Usage: .crew deny @user [reason]`
        );
      }

      const target = mentioned[0];
      const targetNum = target.split('@')[0];

      const applicants = database.getApplicants();
      const applicant = applicants[target];

      if (!applicant) {
        return extra.reply(
          `❌ ERROR\n\n@${targetNum} has no pending application ${pick(SLANG.vibe)}`
        );
      }

      database.removeApplicant(target);

      const reason = args.length >= 2
        ? args.slice(1).join(' ')
        : null;

      const reasonText = reason
        ? `\n📋 Reason: ${bold(reason)}`
        : '';

      await sock.sendMessage(extra.from, {
        text:
          `❌ *DENIED*\n\n` +
          `@${targetNum}'s application has been denied\n\n` +
          `🏢 Team applied: *${applicant.team}*` +
          reasonText + '\n\n' +
          `----------\n\n` +
          `_${pick(SLANG.vibe)}, better luck next time_`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew deny error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't deny applicant`);
    }
  },
};
