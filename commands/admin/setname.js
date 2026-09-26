/**
 * Set Name Command - Change group name with template variables
 */

const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

const config = require('../../config');
module.exports = {
  name: 'setname',
  reactions: { received: '📛', done: '✏️' },
  aliases: ['rename', 'groupname'],
  category: 'admin',
  description: 'Change group name/subject',
  usage: '.setname <new name>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const { from } = extra;
      const newName = args.join(' ').trim();

      if (!newName) {
        return extra.reply(
          `❌ *ERROR*\n\n` +
          `💡 *Usage:* ${prefix}setname <new group name>\n\n` +
          `🔧 *Template variables:*\n` +
          `• _{user}_ — who ran the command\n` +
          `• _{group}_ — current group name\n` +
          `• _{count}_ — member count\n` +
          `• _{time}_ — current time\n\n` +
          `_Example: ${prefix}setname {group} VIP_`
        );
      }

      if (newName.length > 100) {
        return extra.reply(`❌ *ERROR*\n\nName too long — max 100 characters`);
      }

      const settings = database.getGroupSettings(from);
      if (settings.lockName) {
        return extra.reply(
          `🔒 *NAME LOCKED*\n\n` +
          `_${pick(SLANG.vibe)}, the group name is locked by an admin_\n` +
          `Current name: *${extra.groupMetadata?.subject || 'Unknown'}*`
        );
      }

      const senderNum = extra.sender.split('@')[0];
      const memberCount = extra.groupMetadata?.participants?.length || 0;
      const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      const currentName = extra.groupMetadata?.subject || 'Unknown';

      let resolved = newName
        .replace(/\{user\}/g, senderNum)
        .replace(/\{group\}/g, currentName)
        .replace(/\{count\}/g, memberCount)
        .replace(/\{time\}/g, currentTime);

      if (resolved.length > 100) {
        return extra.reply(`❌ *ERROR*\n\nResolved name too long after variables — max 100 characters`);
      }

      await sock.groupUpdateSubject(from, resolved);

      return extra.reply(
        `✅ *GROUP RENAMED*\n\n` +
        `📝 *New name:* ${resolved}\n` +
        `👤 *Changed by:* @${senderNum}\n` +
        `📛 *Old name:* ${currentName}\n\n` +
        `_${pick(SLANG.good)}, fresh name!_`,
        [extra.sender]
      );

    } catch (error) {
      console.error('SetName Error:', error);
      await extra.reply(`❌ *ERROR*\n\n${pick(SLANG.error)} — ${error.message}`);
    }
  }
};
