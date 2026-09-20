/**
 * Crew Applicants Command — view pending applications for a team.
 * Usage: .crew applicants <team>  (from DM)
 *        .crew applicants          (from group — shows current group's team)
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG } = require('../../utils/format');
const { TEAMS } = require('./crewForms');

module.exports = {
  subName: 'applicants',
  name: null,
  aliases: ['pending', 'tryouts'],
  category: 'crew',
  description: 'View pending crew applications',
  usage: '.crew applicants [team]',
  groupOnly: false,
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    try {
      const isGroupAdmin = extra.groupMetadata
        ? extra.groupMetadata.participants.some(p =>
            p.id === extra.sender && (p.admin === 'admin' || p.admin === 'superadmin')
          )
        : false;

      if (!extra.isOwner && !isGroupAdmin && !database.isTeamAdmin(extra.sender)) {
        return extra.reply(
          `❌ ERROR\n\n` +
          `Only admins can view applications, ${pick(SLANG.friend)}`
        );
      }

      // Determine which team's applicants to show
      let targetGroupJid = extra.from;
      let teamLabel = '';

      if (extra.isGroup) {
        // In a group — try to resolve the team for this group
        const teamMap = database.getTeamMap();
        for (const [abbrev, info] of Object.entries(teamMap)) {
          if (info.jid === extra.from) {
            teamLabel = abbrev;
            break;
          }
        }
        // Also check config
        if (!teamLabel) {
          for (const [key, info] of Object.entries(config.crewTeams || {})) {
            if (info.jid === extra.from) {
              teamLabel = key;
              break;
            }
          }
        }
      } else {
        // In DM — require team argument
        const teamArg = (args[0] || '').toUpperCase();
        if (!teamArg) {
          return extra.reply(
            `❌ ERROR\n\n` +
            `Specify a team ${pick(SLANG.friend)}\n\n` +
            `Usage: .crew applicants <team>\n` +
            `Teams: ${Object.keys(TEAMS).join(', ')}`
          );
        }

        const resolved = database.resolveTeamWithConfig(teamArg);
        if (!resolved) {
          return extra.reply(
            `❌ ERROR\n\n` +
            `Unknown team: ${teamArg}\n\n` +
            `Teams: ${Object.keys(TEAMS).join(', ')}`
          );
        }

        targetGroupJid = resolved.jid;
        teamLabel = teamArg;
      }

      const applicants = database.getApplicants(targetGroupJid);
      const entries = Object.entries(applicants).filter(([, a]) => a.status === 'pending');

      if (entries.length === 0) {
        return extra.reply(
          `📋 PENDING APPLICATIONS\n\n` +
          `No pending applications for ${teamLabel || 'this team'} ${pick(SLANG.vibe)}\n` +
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
          `📋 PENDING APPLICATIONS\n\n` +
          `👥 Total: *${entries.length}*\n\n` +
          `----------\n\n` +
          lines.join('\n\n') +
          `\n\n----------\n\n` +
          `Use \`.crew accept <UID>\` to hire\n` +
          `Use \`.crew deny <UID> <reason>\` to reject`,
        mentions,
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew applicants error:', error);
      await extra.reply(
        `❌ ERROR\n\n` +
        `${pick(SLANG.error)} — couldn't load applicants`
      );
    }
  },
};
