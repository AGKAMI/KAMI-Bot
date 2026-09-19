/**
 * Crew Applicants Command — View pending applications for Slammed Society
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

const TEAMS = {
  'SSRS': '🟢🔵🟡 Royal Security',
  'KSSPS': '⚫🔴⚪ Private Security',
  'Meet Control': '🔴⚪⚫ Meet Control',
  'KSSMP': '🔵⚪🩵 Metro Police',
  'KSSMS': '⚫⚪🔴 Maganyeni Security',
};

module.exports = {
  subName: '',
  name: null,
  aliases: ['pending', 'tryouts'],
  category: 'crew',
  description: 'View pending crew applications',
  usage: '.crew applicants',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const applicants = database.getApplicants(extra.from);
      const entries = Object.entries(applicants);

      if (entries.length === 0) {
        return extra.reply(
          `📋 *PENDING APPLICATIONS*\n\n` +
          `No pending applications ${pick(SLANG.vibe)}\n` +
          `Recruits can use .crew apply to apply`
        );
      }

      const lines = [];
      const mentions = [];

      for (const [jid, app] of entries) {
        const num = jid.split('@')[0];
        const teamDisplay = TEAMS[app.team] || app.team;
        const date = new Date(app.appliedAt).toLocaleDateString('en-ZA');
        const hasAnswers = app.answers ? '✅' : '⏳';

        lines.push(
          `👤 @${num}\n` +
          `   🏢 Team: *${app.team}* — ${teamDisplay}\n` +
          `   📅 Applied: ${date}\n` +
          `   📝 Answers: ${hasAnswers}`
        );
        mentions.push(jid);
      }

      await sock.sendMessage(extra.from, {
        text:
          `📋 *PENDING APPLICATIONS*\n\n` +
          `👥 Total: *${entries.length}*\n\n` +
          `----------\n\n` +
          lines.join('\n\n') +
          `\n\n----------\n\n` +
          `Use ${bold('.crew accept @user')} to hire\n` +
          `Use ${bold('.crew deny @user')} to reject`,
        mentions,
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew applicants error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't load applicants`);
    }
  },
};
