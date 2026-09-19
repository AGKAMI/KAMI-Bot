/**
 * Lock Command - Granular lock/unlock for group name, desc, pp
 */

const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

module.exports = {
  name: 'lock',
  aliases: ['unlock', 'lockstatus'],
  category: 'admin',
  description: 'Lock/unlock group settings (name, desc, profile pic)',
  usage: '.lock [name/desc/pp] [off]',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      const { from } = extra;
      const sub = (args[0] || '').toLowerCase();
      const sub2 = (args[1] || '').toLowerCase();
      const settings = database.getGroupSettings(from);

      if (sub === 'status' || sub === '') {
        return extra.reply(buildStatus(settings));
      }

      if (sub === 'on' || sub === 'lock') {
        database.updateGroupSettings(from, {
          lock: true,
          lockName: true,
          lockDesc: true,
          lockPp: true
        });

        try {
          await sock.groupSettingUpdate(from, 'announcement');
        } catch (e) {}

        return extra.reply(
          `🔒 *GROUP LOCKED*\n\n` +
          `✅ *All settings locked:*\n` +
          `🔒 Name\n` +
          `🔒 Description\n` +
          `🔒 Profile pic\n\n` +
          `👤 *By:* @${extra.sender.split('@')[0]}\n\n` +
          `_${pick(SLANG.good)}, group secured!_`,
          [extra.sender]
        );
      }

      if (sub === 'off' || sub === 'unlock') {
        database.updateGroupSettings(from, {
          lock: false,
          lockName: false,
          lockDesc: false,
          lockPp: false
        });

        try {
          await sock.groupSettingUpdate(from, 'not_announcement');
        } catch (e) {}

        return extra.reply(
          `🔓 *GROUP UNLOCKED*\n\n` +
          `🔓 *All settings unlocked*\n\n` +
          `👤 *By:* @${extra.sender.split('@')[0]}\n\n` +
          `_${pick(SLANG.vibe)}, group opened up_`,
          [extra.sender]
        );
      }

      const validTargets = ['name', 'desc', 'pp'];
      if (validTargets.includes(sub)) {
        const lockKey = `lock${sub.charAt(0).toUpperCase() + sub.slice(1)}`;

        if (sub2 === 'off') {
          database.updateGroupSettings(from, { [lockKey]: false, lock: false });

          return extra.reply(
            `🔓 *${sub.toUpperCase()} UNLOCKED*\n\n` +
            `✅ *${sub.charAt(0).toUpperCase() + sub.slice(1)} can now be changed by anyone*\n\n` +
            `👤 *By:* @${extra.sender.split('@')[0]}`,
            [extra.sender]
          );
        }

        database.updateGroupSettings(from, { [lockKey]: true });

        return extra.reply(
          `🔒 *${sub.toUpperCase()} LOCKED*\n\n` +
          `✅ *${sub.charAt(0).toUpperCase() + sub.slice(1)} can only be changed by admins*\n\n` +
          `👤 *By:* @${extra.sender.split('@')[0]}`,
          [extra.sender]
        );
      }

      return extra.reply(
        `❌ *ERROR*\n\n` +
        `💡 *Usage:*\n` +
        `• _.lock_ — lock all settings\n` +
        `• _.unlock_ — unlock all\n` +
        `• _.lock status_ — check status\n` +
        `• _.lock name_ — lock name only\n` +
        `• _.lock desc_ — lock desc only\n` +
        `• _.lock pp_ — lock profile pic only\n` +
        `• _.lock name off_ — unlock name`
      );

    } catch (error) {
      console.error('Lock Error:', error);
      await extra.reply(`❌ *ERROR*\n\n${pick(SLANG.error)} — ${error.message}`);
    }
  }
};

function buildStatus(settings) {
  const lockName = settings.lockName || false;
  const lockDesc = settings.lockDesc || false;
  const lockPp = settings.lockPp || false;

  return (
    `🔒 *LOCK STATUS*\n\n` +
    `${lockName ? '🔒' : '🔓'} *Name:* ${lockName ? 'Locked' : 'Unlocked'}\n` +
    `${lockDesc ? '🔒' : '🔓'} *Description:* ${lockDesc ? 'Locked' : 'Unlocked'}\n` +
    `${lockPp ? '🔒' : '🔓'} *Profile pic:* ${lockPp ? 'Locked' : 'Unlocked'}\n\n` +
    `📱 *Commands:*\n` +
    `• _.lock_ — lock all\n` +
    `• _.unlock_ — unlock all\n` +
    `• _.lock name / desc / pp_ — lock individual\n` +
    `• _.lock name off / desc off / pp off_ — unlock individual`
  );
}
