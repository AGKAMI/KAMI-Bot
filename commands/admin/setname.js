/**
 * Set Name Command - Change group name
 */

const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

module.exports = {
  name: 'setname',
  aliases: ['rename', 'groupname'],
  category: 'admin',
  description: 'Change group name/subject',
  usage: '.setname <new name>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      const { from } = extra;
      const newName = args.join(' ').trim();

      if (!newName) {
        const text = [
          `❌ *ERROR*`,
          '',
          `💡 Usage: .setname <new group name>`,
          `_Example: .setname KAMI Squad 🚀_`
        ].join('\n');
        return await extra.reply(text);
      }

      if (newName.length > 100) {
        return await extra.reply(`❌ *ERROR*\n\nName too long, ${pick(SLANG.friend)} — max 100 characters`);
      }

      const settings = database.getGroupSettings(from);
      if (settings.lock) {
        const text = [
          `🔒 *GROUP LOCKED*`,
          '',
          `- This group is locked, ${pick(SLANG.vibe)}`,
          `- Only admins can unlock it with .unlock`,
          `- Current name: *${extra.groupMetadata?.subject || 'Unknown'}*`
        ].join('\n');
        return await extra.reply(text);
      }

      await sock.groupUpdateSubject(from, newName);

      const text = [
        `✅ *GROUP RENAMED*`,
        '',
        `- 📝 ${bold('New name:')} ${newName}`,
        `- 👤 ${bold('Changed by')} @${extra.sender.split('@')[0]}`,
        `- 📛 ${bold('Old name:')} ${extra.groupMetadata?.subject || 'Unknown'}`,
        '',
        `_${pick(SLANG.good)} — fresh name, ${pick(SLANG.vibe)}_`
      ].join('\n');

      await sock.sendMessage(from, { text, mentions: [extra.sender] }, { quoted: msg });

    } catch (error) {
      console.error('SetName Error:', error);
      await extra.reply(`❌ *ERROR*\n\n${pick(SLANG.error)} — ${error.message}`);
    }
  }
};
