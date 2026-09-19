/**
 * Crew Deny Command — Deny applicant
 * Supports: @mention OR phone number
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');
const { resolveUser } = require('./crewHelpers');

module.exports = {
  subName: '',
  name: null,
  aliases: ['reject'],
  category: 'crew',
  description: 'Deny applicant',
  usage: '.crew deny @user|number [reason]',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      const resolved = resolveUser(args, mentioned, ctx);

      if (!resolved.jid) {
        return extra.reply(
          `❌ ERROR\n\nTag or add a number\n\nUsage: .crew deny @user|number [reason]`
        );
      }

      const target = resolved.jid;
      const targetNum = target.split('@')[0];

      const applicants = database.getApplicants(extra.from);
      if (!applicants[target]) {
        return extra.reply(`❌ ERROR\n\n@${targetNum} hasn't applied`);
      }

      database.removeApplicant(extra.from, target);

      const reason = resolved.args.join(' ') || 'No reason given';

      await sock.sendMessage(extra.from, {
        text:
          `✅ SUCCESS\n\n❌ APPLICATION DENIED\n\n` +
          `@${targetNum}\n\n` +
          `Reason: ${reason}`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew deny error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't deny applicant`);
    }
  },
};
