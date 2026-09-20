/**
 * Crew Applicants Command — view pending applications for this group (keyed by UID).
 * Usage: .crew applicants
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
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    try {
      const isGroupAdmin = extra.groupMetadata
        ? extra.groupMetadata.participants.some(p =>
            p.id === extra.sender && (p.admin === 'admin' || p.admin === 'superadmin')
          )
        : false;

      if (!extra.isOwner && !isGroupAdmin) {
        return extra.reply('❌ ERROR\n\nOnly admins can view applications, ' + pick(SLANG.friend));
      }

      const applicants = database.getApplicants(extra.from);
      const entries = Object.entries(applicants).filter(([, a]) => a.status === 'pending');

      if (entries.length === 0) {
        return extra.reply(
          `📋 *PENDING APPLICATIONS*\n\n` +
          `No pending applications ${pick(SLANG.vibe)}\n` +
          `Recruits can use .crew apply <team> to apply`
        );
      }

      const lines = [];
      const mentions = [];

      for (const [uid, app] of entries) {
        const num = app.jid ? app.jid.split('@')[0] : 'unknown';
        const teamDisplay = TEAMS[app.team]?.label || app.team || '—';
        const date = new Date(app.appliedAt).toLocaleDateString('en-ZA');
        const hasAnswers = app.answers ? '✅' : '⏳';

        lines.push(
          `🆔 *${uid}*\n` +
          `   👤 @${num}\n` +
          `   🏢 Team: *${app.team || '—'}* — ${teamDisplay}\n` +
          `   📅 Applied: ${date}\n` +
          `   📝 Answers: ${hasAnswers}`
        );
        if (app.jid) mentions.push(app.jid);
      }

      await sock.sendMessage(extra.from, {
        text:
          `📋 *PENDING APPLICATIONS*\n\n` +
          `👥 Total: *${entries.length}*\n\n` +
          `----------\n\n` +
          lines.join('\n\n') +
          `\n\n----------\n\n` +
          `Use ${bold('.crew accept <UID>')} to hire\n` +
          `Use ${bold('.crew deny <UID> <reason>')} to reject`,
        mentions,
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew applicants error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't load applicants`);
    }
  },
};