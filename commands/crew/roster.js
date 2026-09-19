/**
 * Crew Roster Command — View all Slammed Society members
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

const TEAMS = {
  'SSRS': { name: 'Royal Security', emoji: '🟢🔵🟡' },
  'KSSPS': { name: 'Private Security', emoji: '⚫🔴⚪' },
  'Meet Control': { name: 'Meet Control', emoji: '🔴⚪⚫' },
  'KSSMP': { name: 'Metro Police', emoji: '🔵⚪🩵' },
  'KSSMS': { name: 'Maganyeni Security', emoji: '⚫⚪🔴' },
};

const ROLE_EMOJIS = {
  'leader': '👑',
  'co-leader': '⭐',
  'officer': '🎖️',
  'member': '👤',
};

module.exports = {
  name: 'roster',
  aliases: ['members', 'list'],
  category: 'crew',
  description: 'View crew roster',
  usage: '.crew roster [team]',
  groupOnly: true,
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    try {
      const members = database.getCrewMembers();
      const memberEntries = Object.entries(members);

      if (memberEntries.length === 0) {
        return extra.reply(
          `🔰 CREW ROSTER\n\nThe crew is empty ${pick(SLANG.vibe)}\n` +
          `Use .crew add @user to recruit members`
        );
      }

      const filterTeam = args.length > 0 ? args.join(' ') : null;

      if (filterTeam) {
        const teamKey = Object.keys(TEAMS).find(
          k => k.toLowerCase() === filterTeam.toLowerCase()
        );
        if (!teamKey) {
          return extra.reply(
            `❌ ERROR\n\nInvalid team ${pick(SLANG.error)}\n` +
            `Teams: SSRS, KSSPS, Meet Control, KSSMP, KSSMS`
          );
        }

        const teamMembers = memberEntries.filter(([_, m]) => m.team === teamKey);
        const teamInfo = TEAMS[teamKey];

        if (teamMembers.length === 0) {
          return extra.reply(
            `🔰 ${teamInfo.emoji} ${teamKey} ROSTER\n\nNo members in this team yet ${pick(SLANG.vibe)}`
          );
        }

        const lines = teamMembers.map(([jid, m]) => {
          const emoji = ROLE_EMOJIS[m.role] || '👤';
          return `${emoji} @${jid.split('@')[0]} — ${bold(m.role)}`;
        });

        const mentions = teamMembers.map(([jid]) => jid);

        await sock.sendMessage(extra.from, {
          text:
            `🔰 ${teamInfo.emoji} ${bold(`${teamKey} ROSTER`)}\n\n` +
            `${teamInfo.name}\n` +
            `----------\n` +
            lines.join('\n') +
            `\n----------\n` +
            `👥 Total: ${bold(String(teamMembers.length))}`,
          mentions,
        }, { quoted: msg });
        return;
      }

      const grouped = {};
      for (const [jid, m] of memberEntries) {
        const team = m.team || 'Unassigned';
        if (!grouped[team]) grouped[team] = [];
        grouped[team].push({ jid, ...m });
      }

      const parts = [];
      const allMentions = [];

      for (const [team, membersList] of Object.entries(grouped)) {
        const teamInfo = TEAMS[team];
        const header = teamInfo
          ? `${teamInfo.emoji} ${bold(team)}`
          : `⚪ ${bold(team)}`;

        parts.push(header);
        for (const m of membersList) {
          const emoji = ROLE_EMOJIS[m.role] || '👤';
          parts.push(`${emoji} @${m.jid.split('@')[0]} — ${bold(m.role)}`);
          allMentions.push(m.jid);
        }
        parts.push('');
      }

      parts.pop();
      parts.push('----------');
      parts.push(`👥 Total: ${bold(String(memberEntries.length))}`);

      await sock.sendMessage(extra.from, {
        text: `🔰 ${bold('SLAMMED SOCIETY ROSTER')}\n\n${parts.join('\n')}`,
        mentions: allMentions,
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew roster error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't load roster`);
    }
  },
};
