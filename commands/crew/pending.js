/**
 * Crew Pending Command — view all pending applications across ALL teams.
 * Usage: .crew pending
 * Shows a compact overview for admins who manage multiple teams.
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG } = require('../../utils/format');
const { TEAMS } = require('./crewForms');

module.exports = {
  subName: 'pending',
  name: null,
  aliases: ['allpending', 'all'],
  category: 'crew',
  description: 'View all pending applications across all teams',
  usage: '.crew pending',
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
          `❌ ERROR\n\nOnly admins can view applications`
        );
      }

      // Passive cleanup first
      const expired = database.expireOldPendingApps();
      if (expired.length > 0) {
        for (const app of expired) {
          if (app.jid) {
            try {
              await sock.sendMessage(app.jid, {
                text: `⏰ *APPLICATION EXPIRED*\n\n` +
                      `Your *${app.team}* application (ID: *${app.appUid}*) has expired after 7 days with no review.\n\n` +
                      `🔄 You can reapply anytime: \`${prefix}crew apply ${app.team}\``
              });
            } catch (e) {}
          }
        }
      }

      // Gather all pending apps across all teams
      const crewTeams = config.crewTeams || {};
      const allPending = [];

      for (const [teamKey, teamInfo] of Object.entries(crewTeams)) {
        const applicants = database.getApplicants(teamInfo.jid);
        for (const [uid, app] of Object.entries(applicants)) {
          if (app.status === 'pending') {
            allPending.push({ uid, app, teamKey });
          }
        }
      }

      if (allPending.length === 0) {
        return extra.reply(
          `📋 ALL PENDING APPLICATIONS\n\n` +
          `No pending applications across any team ${pick(SLANG.vibe)}\n\n` +
          `Teams: ${Object.keys(crewTeams).join(', ')}`
        );
      }

      // Group by team
      const grouped = {};
      for (const { uid, app, teamKey } of allPending) {
        if (!grouped[teamKey]) grouped[teamKey] = [];
        grouped[teamKey].push({ uid, app });
      }

      const isOwner = extra.isOwner;
      const lines = [];
      const mentions = [];

      for (const [teamKey, apps] of Object.entries(grouped)) {
        const team = TEAMS[teamKey];
        lines.push(`${team ? team.emoji : ''} *${teamKey}* — ${team ? team.label : 'Unknown'} (${apps.length})`);

        for (const { uid, app } of apps) {
          const num = app.jid ? app.jid.split('@')[0] : 'unknown';
          const hasAnswers = app.answers ? '✅' : '⏳';
          const date = new Date(app.appliedAt).toLocaleDateString('en-ZA');
          const daysAgo = Math.floor((Date.now() - app.appliedAt) / (1000 * 60 * 60 * 24));

          let line = `  🆔 *${uid}* — @${num} — ${hasAnswers} — ${date}`;
          if (daysAgo > 0) line += ` — _${daysAgo}d ago_`;

          // Owner gets answers preview
          if (isOwner && app.answers) {
            const preview = app.answers.substring(0, 80).replace(/\n/g, ' ');
            line += `\n     💬 _${preview}${app.answers.length > 80 ? '...' : ''}_`;
          } else if (isOwner && !app.answers) {
            line += `\n     ⚠️ _No answers submitted yet_`;
          }

          lines.push(line);
          if (app.jid) mentions.push(app.jid);
        }
        lines.push('');
      }

      await sock.sendMessage(extra.from, {
        text:
          `📋 ALL PENDING APPLICATIONS\n\n` +
          `👥 Total: *${allPending.length}*\n\n` +
          `----------\n\n` +
          lines.join('\n') +
          `----------\n\n` +
          `✅ Accept: \`${prefix}crew accept <UID>\`\n` +
          `❌ Deny: \`${prefix}crew deny <UID> <reason>\`\n` +
          (isOwner
            ? `🚫 Cancel: \`${prefix}crew cancel <UID>\`\n` +
              `🔄 Reroll: \`${prefix}crew reroll <UID>\`\n` +
              `📋 History: \`${prefix}crew history\``
            : ''),
        mentions,
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew pending error:', error);
      await extra.reply(
        `❌ ERROR\n\n${pick(SLANG.error)} — couldn't load pending applications`
      );
    }
  },
};
