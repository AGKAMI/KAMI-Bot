/**
 * Lock Command - Granular lock/unlock for group name, desc, pp
 */

const { bold, pick, SLANG, mention } = require('../../utils/format');
const database = require('../../database');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

const config = require('../../config');
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

  const prefix = config.prefix || '.';
    try {
      const { from } = extra;
      const sub = (args[0] || '').toLowerCase();
      const sub2 = (args[1] || '').toLowerCase();
      const settings = database.getGroupSettings(from);

      if (sub === 'status' || sub === '') {
        const statusText = buildStatus(settings, prefix);
        const anyLocked = settings.lockName || settings.lockDesc || settings.lockPp;
        return sendButtons(sock, extra.from, {
          text: statusText,
          footer: 'Lock Settings',
          mentions: [extra.sender],
          buttons: anyLocked
            ? [
                { id: 'admin:unlockall', text: '🔓 Unlock All' },
                { id: 'admin:lockall', text: '🔒 Lock All' },
              ]
            : [
                { id: 'admin:lockall', text: '🔒 Lock All' },
              ],
        }, { quoted: msg });
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
          `👤 *By:* ${mention(extra.sender)}\n\n` +
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
          `👤 *By:* ${mention(extra.sender)}\n\n` +
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
            `👤 *By:* ${mention(extra.sender)}`,
            [extra.sender]
          );
        }

        database.updateGroupSettings(from, { [lockKey]: true });

        return extra.reply(
          `🔒 *${sub.toUpperCase()} LOCKED*\n\n` +
          `✅ *${sub.charAt(0).toUpperCase() + sub.slice(1)} can only be changed by admins*\n\n` +
          `👤 *By:* ${mention(extra.sender)}`,
          [extra.sender]
        );
      }

      return extra.reply(
        `❌ *ERROR*\n\n` +
        `💡 *Usage:*\n` +
        `• _.lock_ — lock all settings\n` +
        `• _.unlock_ — unlock all\n` +
        `• _${prefix}lock status_ — check status\n` +
        `• _${prefix}lock name_ — lock name only\n` +
        `• _${prefix}lock desc_ — lock desc only\n` +
        `• _${prefix}lock pp_ — lock profile pic only\n` +
        `• _${prefix}lock name off_ — unlock name`
      );

    } catch (error) {
      console.error('Lock Error:', error);
      await extra.reply(`❌ *ERROR*\n\n${pick(SLANG.error)} — ${error.message}`);
    }
  }
};

function buildStatus(settings, prefix) {
  const lockName = settings.lockName || false;
  const lockDesc = settings.lockDesc || false;
  const lockPp = settings.lockPp || false;

  return (
    `🔒 *LOCK STATUS*\n\n` +
    `${lockName ? '🔒' : '🔓'} *Name:* ${lockName ? 'Locked' : 'Unlocked'}\n` +
    `${lockDesc ? '🔒' : '🔓'} *Description:* ${lockDesc ? 'Locked' : 'Unlocked'}\n` +
    `${lockPp ? '🔒' : '🔓'} *Profile pic:* ${lockPp ? 'Locked' : 'Unlocked'}\n\n` +
    `📱 *Commands:*\n` +
    `• _${prefix}lock_ — lock all\n` +
    `• _${prefix}unlock_ — unlock all\n` +
    `• _${prefix}lock name / desc / pp_ — lock individual\n` +
    `• _${prefix}lock name off / desc off / pp off_ — unlock individual`
  );
}

// Button handlers
onButton('admin:lockall', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { lock: true, lockName: true, lockDesc: true, lockPp: true });
  try { await sock.groupSettingUpdate(from, 'announcement'); } catch (e) {}
  await sock.sendMessage(from, {
    text: `🔒 *GROUP LOCKED*\n\n✅ *All settings locked:*\n🔒 Name\n🔒 Description\n🔒 Profile pic`,
  });
});

onButton('admin:unlockall', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { lock: false, lockName: false, lockDesc: false, lockPp: false });
  try { await sock.groupSettingUpdate(from, 'not_announcement'); } catch (e) {}
  await sock.sendMessage(from, {
    text: `🔓 *GROUP UNLOCKED*\n\n🔓 *All settings unlocked*`,
  });
});
