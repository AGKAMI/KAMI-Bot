/**
 * Crew Applicants Command — view all pending applications across teams.
 * Shows app UIDs so admins can accept/deny with .crew accept <uid> / .crew deny <uid>.
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');
const { TEAMS } = require('./crewForms');

module.exports = {
  subName: 'applicants',
  name: null,
  aliases: ['pending', 'tryouts'],
  category: 'crew',
  description: 'View pending crew applications',
  usage: '.crew applicants',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const allTeams = database.getAllTeams();
      let count = 0;
      const lines = [];
      const mentions = [];

      for (const [groupJid, team] of Object.entries(allTeams || {})) {
        if (!team.applicants || Object.keys(team.applicants).length === 0) continue;
        for (const [uid, app] of Object.entries(team.applicants)) {
          const num = (app.jid || uid).split('@')[0];
          const teamDisplay = TEAMS[app.team] ? TEAMS[app.team].label : app.team;
          const date = new Date(app.appliedAt).toLocaleDateString('en-ZA');
          const hasAnswers = app.answers ? '✅' : '⏳';

          lines.push(
            `🆔 *${uid}*\n` +
            `   👤 @${num}\n` +
            `   🏢 Team: *${app.team}* — ${teamDisplay}\n` +
            `   📅 Applied: ${date}\n` +
            `   📝 Answers: ${hasAnswers}`
          );
          mentions.push(app.jid);
          count++;
        }
      }

      if (count === 0) {
        return extra.reply(
          `📋 *PENDING APPLICATIONS*\n\n` +
          `No pending applications ${pick(SLANG.vibe)}\n` +
          `Recruits can use .crew apply <team> to get a form`
        );
      }

      await sock.sendMessage(extra.from, {
        text:
          `📋 *PENDING APPLICATIONS*\n\n` +
          `👥 Total: *${count}*\n\n` +
          `----------\n\n` +
          lines.join('\n\n') +
          `\n\n----------\n\n` +
          `✅ Accept: ${bold('.crew accept <appUid>')}\n` +
          `❌ Deny: ${bold('.crew deny <appUid> <reason>')}\n\n` +
          `_Example: .crew accept SS-4FK2X_`,
        mentions,
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew applicants error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't load applicants`);
    }
  },
};