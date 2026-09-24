/**
 * Inactive Members — Show members who haven't been active
 * Usage: .crew inactive [days]
 */

const database = require('../../database');
const config = require('../../config');
const { pick, SLANG } = require('../../utils/format');
const { getTeamDisplayName } = require('../../utils/teamName');

module.exports = {
  name: 'inactive',
  aliases: [],
  description: 'Show inactive members (no messages in X days)',
  usage: '.crew inactive [days]',
  isCrew: true,

  execute: async (sock, msg, args, extra) => {
    const { from, isGroup } = extra;
    const prefix = config.prefix;

    if (!isGroup) {
      return extra.reply(`❌ ERROR\n\nThis command works in groups only`);
    }

    // Check config.crewTeams for team JIDs
    const crewConfig = config.crewTeams || {};
    const teamKey = Object.keys(crewConfig).find(
      k => crewConfig[k]?.jid === from
    );

    if (!teamKey) {
      return extra.reply(`❌ ERROR\n\nThis group isn't a crew team`);
    }

    // Parse days (default 30)
    const days = args.length > 0 && /^\d+$/.test(args[0])
      ? parseInt(args[0])
      : 30;

    if (days < 1 || days > 365) {
      return extra.reply(`❌ ERROR\n\nDays must be between 1 and 365`);
    }

    const inactive = database.getInactiveMembers(from, days);
    const inactiveList = Object.entries(inactive);

    const meta = await sock.groupMetadata(from).catch(() => null);
    const teamName = getTeamDisplayName(teamKey, meta?.subject);

    if (inactiveList.length === 0) {
      return extra.reply(
        `✅ *ALL GOOD*\n\n` +
        `No inactive members in the last ${days} days\n` +
        `_Everyone's been active ${pick(SLANG.good)}_`
      );
    }

    // Sort by last active (oldest first)
    inactiveList.sort((a, b) => {
      const aTime = a[1].lastActive || 0;
      const bTime = b[1].lastActive || 0;
      return aTime - bTime;
    });

    let text =
      `😴 *INACTIVE MEMBERS*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `🏢 Team: *${teamName}*\n` +
      `📅 Threshold: *${days} days*\n` +
      `👥 Found: *${inactiveList.length}*\n\n`;

    const mentions = [];
    let count = 0;

    for (const [jid, data] of inactiveList) {
      if (count >= 20) break; // Limit to prevent message too long
      const num = jid.split(':')[0].split('@')[0].replace(/\D/g, '');
      const lastActiveStr = data.lastActive
        ? new Date(data.lastActive).toLocaleDateString('en-ZA')
        : 'Never';
      const inactiveDays = data.lastActive
        ? Math.floor((Date.now() - data.lastActive) / (24 * 60 * 60 * 1000))
        : '?';

      text += `• @${num} — *${data.role}*\n`;
      text += `  📅 Joined: ${data.joined ? new Date(data.joined).toLocaleDateString('en-ZA') : '?'}\n`;
      text += `  💬 Messages: ${data.totalMessages}\n`;
      text += `  ⏰ Last active: ${lastActiveStr} (${inactiveDays}d ago)\n\n`;

      mentions.push(jid);
      count++;
    }

    if (inactiveList.length > 20) {
      text += `_...and ${inactiveList.length - 20} more_\n`;
    }

    text += `\n💡 _Use \`${prefix}crew stats @user\` for detailed stats_`;

    return extra.reply(text, { mentions });
  },
};
