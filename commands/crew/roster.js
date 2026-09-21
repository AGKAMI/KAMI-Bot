/**
 * Roster — Show all members with activity stats
 * Usage: .crew roster
 */

const database = require('../../database');
const config = require('../../config');
const { pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'roster',
  aliases: ['members'],
  description: 'Show all crew members with activity stats',
  usage: '.crew roster',
  isCrew: true,

  execute: async (sock, msg, args, extra) => {
    const { from, isGroup } = extra;
    const prefix = config.prefix;

    if (!isGroup) {
      return extra.reply(`❌ ERROR\n\nThis command works in groups only`);
    }

    const teamData = database.getCrew();
    const teamKey = Object.keys(teamData.teams || {}).find(
      k => teamData.teams[k]?.jid === from
    );

    if (!teamKey) {
      return extra.reply(`❌ ERROR\n\nThis group isn't a crew team`);
    }

    const allActivity = database.getGroupMemberActivity(from);
    const memberList = Object.entries(allActivity);

    if (memberList.length === 0) {
      return extra.reply(
        `📋 ROSTER\n\n` +
        `No members in ${teamKey} yet`
      );
    }

    // Sort by role hierarchy then by messages
    const roles = database.getCustomRoles(from);
    memberList.sort((a, b) => {
      const aRole = roles.indexOf(a[1].role);
      const bRole = roles.indexOf(b[1].role);
      if (aRole !== bRole) return aRole - bRole;
      return (b[1].totalMessages || 0) - (a[1].totalMessages || 0);
    });

    let text =
      `📋 *${teamKey} ROSTER*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `👥 *${memberList.length} members*\n\n`;

    const mentions = [];
    let currentRole = null;

    const getRoleEmoji = (role) => {
      const idx = roles.indexOf(role);
      if (idx === roles.length - 1) return '👑';
      if (idx === roles.length - 2) return '⭐';
      if (idx === 0) return '👤';
      return '🎖️';
    };

    for (const [jid, data] of memberList) {
      const num = jid.split(':')[0].split('@')[0].replace(/\D/g, '');

      // Role header
      if (data.role !== currentRole) {
        currentRole = data.role;
        text += `\n${getRoleEmoji(data.role)} *${data.role.toUpperCase()}*\n`;
      }

      // Status indicator
      const inactiveDays = data.lastActive
        ? Math.floor((Date.now() - data.lastActive) / (24 * 60 * 60 * 1000))
        : null;
      const status = inactiveDays === null ? '🔴'
        : inactiveDays > 30 ? '🔴'
        : inactiveDays > 7 ? '🟡'
        : '🟢';

      text += `${status} @${num} — 💬${data.totalMessages || 0} 📅${data.daysActive || 0}d\n`;
      mentions.push(jid);
    }

    // Summary
    const active = memberList.filter(([, d]) => {
      if (!d.lastActive) return false;
      return (Date.now() - d.lastActive) <= (7 * 24 * 60 * 60 * 1000);
    }).length;
    const inactive = memberList.filter(([, d]) => {
      if (!d.lastActive) return true;
      return (Date.now() - d.lastActive) > (30 * 24 * 60 * 60 * 1000);
    }).length;

    text +=
      `\n━━━━━━━━━━━━━━━━\n` +
      `🟢 Active (7d): *${active}*\n` +
      `🔴 Inactive (30d): *${inactive}*\n\n` +
      `💡 _Use \`${prefix}crew stats @user\` for detailed stats_`;

    return extra.reply(text, { mentions });
  },
};
