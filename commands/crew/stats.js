/**
 * Member Stats — View a member's activity and role progression
 * Usage: .crew stats @user
 */

const database = require('../../database');
const config = require('../../config');
const { pick, SLANG, mention } = require('../../utils/format');

module.exports = {
  name: 'stats',
  aliases: ['memberstats', 'mystats'],
  description: 'View member activity stats and role progression',
  usage: '.crew stats [@user]',
  isCrew: true,

  execute: async (sock, msg, args, extra) => {
    const { from, sender, isGroup } = extra;
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

    // Get target user
    let targetJid = sender;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const mentioned = ctx?.mentionedJid || [];
    const replyJid = ctx?.participant;

    if (replyJid) {
      targetJid = replyJid;
    } else if (mentioned.length > 0) {
      targetJid = mentioned[0];
    } else if (args.length > 0 && args[0].startsWith('@')) {
      const num = args[0].replace(/[^0-9]/g, '');
      targetJid = `${num}@s.whatsapp.net`;
    }

    const member = database.getCrewMember(from, targetJid);

    if (!member) {
      return extra.reply(
        `❌ ERROR\n\n${mention(targetJid)} isn't a member of ${teamKey}`,
        { mentions: [targetJid] }
      );
    }

    // Get activity stats
    const activity = database.getMemberActivity(from, targetJid);

    // Role hierarchy
    const roles = database.getCustomRoles(from);
    const roleIndex = roles.indexOf(member.role);
    const nextRole = roleIndex < roles.length - 1 ? roles[roleIndex + 1] : null;

    // Progress to next role — scale with position in hierarchy
    const msgMultiplier = roleIndex + 1;
    const dayMultiplier = roleIndex + 1;
    const MSGS_FOR_PROMOTE = Math.floor(40 * Math.pow(msgMultiplier, 1.5));
    const DAYS_FOR_PROMOTE = Math.floor(5 * Math.pow(dayMultiplier, 1.2));
    const progress = Math.min(100, Math.round((activity.totalMessages / MSGS_FOR_PROMOTE) * 100));
    const daysProgress = Math.min(100, Math.round((activity.daysActive / DAYS_FOR_PROMOTE) * 100));

    // Time since joined
    const joinedDate = member.joined ? new Date(member.joined) : null;
    const daysSinceJoined = joinedDate
      ? Math.floor((Date.now() - joinedDate.getTime()) / (24 * 60 * 60 * 1000))
      : '?';

    // Last active
    const lastActiveStr = activity.lastActive
      ? new Date(activity.lastActive).toLocaleDateString('en-ZA')
      : 'Never';

    // Inactivity status
    const inactiveDays = activity.lastActive
      ? Math.floor((Date.now() - activity.lastActive) / (24 * 60 * 60 * 1000))
      : null;
    const inactiveLabel = inactiveDays === null
      ? '🔴 Never active'
      : inactiveDays > 30 ? `🔴 ${inactiveDays} days ago`
      : inactiveDays > 7 ? `🟡 ${inactiveDays} days ago`
      : `🟢 ${inactiveDays === 0 ? 'Today' : inactiveDays + ' days ago'}`;

    let text =
      `📊 *MEMBER STATS*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `👤 ${mention(targetJid)}\n` +
      `🏢 Team: *${teamKey}*\n` +
      `🏷️ Role: *${member.role}*\n` +
      `📅 Joined: *${daysSinceJoined} days ago*\n\n`;

    text +=
      `📈 *ACTIVITY*\n` +
      `💬 Messages: *${activity.totalMessages}*\n` +
      `📅 Days active: *${activity.daysActive}*\n` +
      `📊 Avg per day: *${activity.avgPerDay}*\n` +
      `⏰ Last active: *${lastActiveStr}*\n` +
      ` Status: ${inactiveLabel}\n\n`;

    if (nextRole) {
      text +=
        `⬆️ *NEXT ROLE: ${nextRole.toUpperCase()}*\n` +
        `💬 Messages: ${activity.totalMessages}/${MSGS_FOR_PROMOTE} (${progress}%)\n` +
        `📅 Days active: ${activity.daysActive}/${DAYS_FOR_PROMOTE} (${daysProgress}%)\n\n`;

      if (progress >= 100 && daysProgress >= 100) {
        text += `✅ _Ready for promotion! Ask an admin to promote you ${pick(SLANG.vibe)}_\n`;
      } else {
        text += `⏳ _Keep active ${pick(SLANG.vibe)}_\n`;
      }
    } else {
      text += `_You've reached the highest role ${pick(SLANG.good)} 👑_\n`;
    }

    return extra.reply(text, { mentions: [targetJid] });
  },
};
