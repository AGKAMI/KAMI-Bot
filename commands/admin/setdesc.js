/**
 * Set Description Command - Change group description with template variables
 */

const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

module.exports = {
  name: 'setdesc',
  aliases: ['desc', 'groupdesc'],
  category: 'admin',
  description: 'Change group description',
  usage: '.setdesc <new description>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      const { from } = extra;
      const newDesc = args.join(' ').trim();

      if (!newDesc) {
        return extra.reply(
          `❌ *ERROR*\n\n` +
          `💡 *Usage:* .setdesc <new description>\n\n` +
          `🔧 *Template variables:*\n` +
          `• _{user}_ — who ran the command\n` +
          `• _{group}_ — current group name\n` +
          `• _{count}_ — member count\n` +
          `• _{time}_ — current time\n\n` +
          `_Example: .setdesc Welcome to {group}! Members: {count}_`
        );
      }

      if (newDesc.length > 250) {
        return extra.reply(`❌ *ERROR*\n\nDescription too long — max 250 characters`);
      }

      const settings = database.getGroupSettings(from);
      if (settings.lockDesc) {
        return extra.reply(
          `🔒 *DESCRIPTION LOCKED*\n\n` +
          `_${pick(SLANG.vibe)}, the group description is locked by an admin_\n` +
          `Current desc: *${extra.groupMetadata?.desc || 'None'}*`
        );
      }

      const senderNum = extra.sender.split('@')[0];
      const memberCount = extra.groupMetadata?.participants?.length || 0;
      const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      const currentName = extra.groupMetadata?.subject || 'Unknown';

      let resolved = newDesc
        .replace(/\{user\}/g, senderNum)
        .replace(/\{group\}/g, currentName)
        .replace(/\{count\}/g, memberCount)
        .replace(/\{time\}/g, currentTime);

      if (resolved.length > 250) {
        return extra.reply(`❌ *ERROR*\n\nResolved description too long after variables — max 250 characters`);
      }

      await sock.groupUpdateDescription(from, resolved);

      return extra.reply(
        `✅ *DESCRIPTION UPDATED*\n\n` +
        `📝 *New description:* ${resolved}\n` +
        `👤 *Changed by:* @${senderNum}\n\n` +
        `_${pick(SLANG.good)}, fresh description!_`,
        [extra.sender]
      );

    } catch (error) {
      console.error('SetDesc Error:', error);
      await extra.reply(`❌ *ERROR*\n\n${pick(SLANG.error)} — ${error.message}`);
    }
  }
};
