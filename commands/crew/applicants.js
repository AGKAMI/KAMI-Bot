/**
 * Crew Applicants Command — view pending applications for a team.
 * Usage: .crew applicants <team>  (from DM)
 *        .crew applicants          (from group — shows current group's team)
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG, mention } = require('../../utils/format');
const { TEAMS } = require('./crewForms');
const { sendButtons } = require('../../utils/buttonHelper');

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

  const prefix = config.prefix || '.';
    try {
      const isGroupAdmin = extra.groupMetadata
        ? extra.groupMetadata.participants.some(p =>
            p.id === extra.sender && (p.admin === 'admin' || p.admin === 'superadmin')
          )
        : false;

      if (!extra.isOwner && !isGroupAdmin && !database.isTeamAdmin(extra.sender)) {
        return extra.reply(
          `❌ ERROR\n\n` +
          `Only admins can view applications`
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
            `Specify a team\n\n` +
            `Usage: \`${prefix}crew applicants <team>\`\n` +
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

      // Passive cleanup — expire old pending apps (7+ days) and notify applicants
      const expired = database.expireOldPendingApps();
      if (expired.length > 0) {
        console.log(`[APPLICANTS] Expired ${expired.length} stale pending app(s)`);
        for (const app of expired) {
          if (app.jid) {
            try {
              await sock.sendMessage(app.jid, {
                text: `⏰ *APPLICATION EXPIRED*\n\n` +
                      `Your *${app.team}* application (ID: *${app.appUid}*) has expired after 7 days with no review.\n\n` +
                      `🔄 You can reapply anytime: \`${prefix}crew apply ${app.team}\``
              });
            } catch (e) {
              console.error(`[APPLICANTS] Expiry DM failed for ${app.jid}:`, e.message);
            }
          }
        }
      }

      const applicants = database.getApplicants(targetGroupJid);
      const entries = Object.entries(applicants).filter(([, a]) => a.status === 'pending');

      if (entries.length === 0) {
        return extra.reply(
          `📋 PENDING APPLICATIONS\n\n` +
          `No pending applications for ${teamLabel || 'this team'} ${pick(SLANG.vibe)}\n` +
          `Recruits can use \`${prefix}crew apply <team>\` to apply`
        );
      }

      const lines = [];
      const mentions = [];

      for (const [uid, app] of entries) {
        const teamDisplay = TEAMS[app.team]?.label || app.team || '—';
        const date = new Date(app.appliedAt).toLocaleDateString('en-ZA');
        const hasAnswers = app.answers ? '✅' : '⏳';

        lines.push(
          `🆔 *${uid}*\n` +
          `   👤 ${app.jid ? mention(app.jid) : 'unknown'}\n` +
          `   🏢 Team: *${app.team || '—'}* — ${teamDisplay}\n` +
          `   📅 Applied: ${date}\n` +
          `   📝 Answers: ${hasAnswers}`
        );
        if (app.jid) mentions.push(app.jid);
      }

      const text =
        `📋 PENDING APPLICATIONS\n\n` +
        `👥 Total: *${entries.length}*\n\n` +
        `----------\n\n` +
        lines.join('\n\n') +
        `\n\n----------\n\n` +
        `Use \`${prefix}crew accept <UID>\` to hire\n` +
        `Use \`${prefix}crew deny <UID> <reason>\` to reject`;

      // Add quick buttons for the first pending applicant
      const firstUid = entries[0]?.[0];
      const firstApp = entries[0]?.[1];
      const buttons = firstUid ? [
        { id: `crew:accept:${firstUid}`, text: `✅ Accept ${firstUid}` },
        { id: `crew:deny:${firstUid}`, text: `❌ Deny ${firstUid}` },
        { id: `crew:pending:${teamLabel}`, text: `🔄 Refresh` },
      ] : [];

      if (buttons.length > 0) {
        await sendButtons(sock, extra.from, {
          text,
          footer: `${teamLabel} Applications`,
          buttons,
        }, { quoted: msg });
      } else {
        await sock.sendMessage(extra.from, { text, mentions }, { quoted: msg });
      }

    } catch (error) {
      console.error('Crew applicants error:', error);
      await extra.reply(
        `❌ ERROR\n\n` +
        `${pick(SLANG.error)} — couldn't load applicants`
      );
    }
  },
};
