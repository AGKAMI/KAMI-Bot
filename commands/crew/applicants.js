/**
 * Crew Applicants Command — view pending applications for a team.
 * Usage: .crew applicants <team>  (from DM)
 *        .crew applicants          (from group — shows current group's team)
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG, mention, voice } = require('../../utils/format');
const { TEAMS } = require('./crewForms');
const { sendButtons } = require('../../utils/buttonHelper');
const { fmtDate } = require('../../utils/sast');

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
          `Eish, only admins can check applications`
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
                      `Your *${app.team}* application (ID: *${app.appUid}*) expired after 7 days with nobody reviewing it.\n\n` +
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
          `Nothing pending for ${teamLabel || 'this team'}, ${voice.tag('err')}\n` +
          `Recruits can use \`${prefix}crew apply <team>\` to apply`
        );
      }

      const lines = [];
      const mentions = [];

      for (const [uid, app] of entries) {
        const teamDisplay = TEAMS[app.team]?.label || app.team || '—';
        const date = fmtDate(app.appliedAt);
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

      // Per-applicant buttons — accept/deny for up to 4 apps + refresh
      // = 9 buttons (native-flow cap 10). Apps past 4 stay list-only;
      // their App IDs in the text still work with the typed commands.
      const buttons = [];
      for (const [uid] of entries.slice(0, 4)) {
        buttons.push({ id: `crew:accept:${uid}`, text: `✅ ${uid}` });
        buttons.push({ id: `crew:deny:${uid}`, text: `❌ ${uid}` });
      }
      if (buttons.length) {
        buttons.push({ id: `crew:pending:${teamLabel}`, text: `📋 Refresh` });
      }

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
        `${voice.openErr()} — couldn't load applicants`
      );
    }
  },
};
