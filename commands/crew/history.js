/**
 * Crew History Command — owner views processed applications (accepted/denied/expired/cancelled).
 * Usage: .crew history [team]
 * Owner-only. Shows recent processed apps with admin + timestamp.
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG } = require('../../utils/format');
const { TEAMS } = require('./crewForms');

const ACTION_EMOJI = {
  'accepted': '✅',
  'denied': '❌',
  'expired': '⏰',
  'cancelled': '🚫',
  'withdrawn': '↩️',
};

module.exports = {
  subName: 'history',
  name: null,
  aliases: ['processed', 'log'],
  category: 'crew',
  description: 'View processed applications history (owner only)',
  usage: '.crew history [team]',
  groupOnly: false,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const filterTeam = (args[0] || '').toUpperCase() || null;
      if (filterTeam && !TEAMS[filterTeam] && !config.crewTeams[filterTeam]) {
        return extra.reply(
          `❌ ERROR\n\nUnknown team: *${filterTeam}*\n\nTeams: ${Object.keys(TEAMS).join(', ')}`
        );
      }

      // Gather all processed apps
      const crewTeams = config.crewTeams || {};
      const allProcessed = [];

      for (const [teamKey, teamInfo] of Object.entries(crewTeams)) {
        if (filterTeam && teamKey !== filterTeam) continue;
        const crew = database.getTeam(teamInfo.jid);
        if (!crew.processedApps) continue;
        for (const [uid, app] of Object.entries(crew.processedApps)) {
          allProcessed.push({ uid, app, teamKey });
        }
      }

      // Sort by most recent first
      allProcessed.sort((a, b) => (b.app.processedAt || 0) - (a.app.processedAt || 0));

      // Limit to last 20
      const shown = allProcessed.slice(0, 20);

      if (shown.length === 0) {
        return extra.reply(
          `📋 APPLICATION HISTORY\n\n` +
          `No processed applications${filterTeam ? ` for ${filterTeam}` : ''} ${pick(SLANG.vibe)}`
        );
      }

      const lines = [];
      const mentions = [];

      for (const { uid, app, teamKey } of shown) {
        const emoji = ACTION_EMOJI[app.action] || '❓';
        const adminDisplay = app.admin === 'system'
          ? 'system'
          : app.admin ? '@' + app.admin.split('@')[0] : '—';
        const applicantNum = app.applicantJid ? app.applicantJid.split('@')[0] : '—';
        const time = app.processedAt ? new Date(app.processedAt).toLocaleString('en-ZA') : '—';

        lines.push(
          `${emoji} *${uid}* — ${app.action.toUpperCase()}\n` +
          `   👤 @${applicantNum} | 🏢 ${teamKey} | 👮 ${adminDisplay}\n` +
          `   🕐 ${time}` +
          (app.role ? ` | 🏷️ ${app.role}` : '') +
          (app.reason ? `\n   📝 ${app.reason}` : '')
        );
        if (app.applicantJid) mentions.push(app.applicantJid);
        if (app.admin && app.admin !== 'system') mentions.push(app.admin);
      }

      await sock.sendMessage(extra.from, {
        text:
          `📋 APPLICATION HISTORY` +
          (filterTeam ? ` — ${filterTeam}` : ` — ALL TEAMS`) + '\n\n' +
          `👥 Total processed: *${allProcessed.length}*` +
          (allProcessed.length > 20 ? ` (showing last 20)` : '') + '\n\n' +
          `----------\n\n` +
          lines.join('\n\n') +
          `\n\n----------\n\n` +
          `_Use \`${prefix}crew history <team>\` to filter by team_`,
        mentions,
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew history error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't load application history`);
    }
  },
};
