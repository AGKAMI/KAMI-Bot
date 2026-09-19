/**
 * Set Description Command - Change group description
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
        const text = [
          `❌ *ERROR*`,
          '',
          `💡 Usage: .setdesc <new description>`,
          `_Example: .setdesc Welcome to KAMI Bot group! Be respectful._`
        ].join('\n');
        return await extra.reply(text);
      }

      if (newDesc.length > 250) {
        return await extra.reply(`❌ *ERROR*\n\nDescription too long, ${pick(SLANG.friend)} — max 250 characters`);
      }

      const settings = database.getGroupSettings(from);
      if (settings.lock) {
        const text = [
          `🔒 *GROUP LOCKED*`,
          '',
          `- This group is locked, ${pick(SLANG.vibe)}`,
          `- Only admins can unlock it with .unlock`,
          `- Current desc: *${extra.groupMetadata?.desc || 'None'}*`
        ].join('\n');
        return await extra.reply(text);
      }

      await sock.groupUpdateDescription(from, newDesc);

      const text = [
        `✅ *DESCRIPTION UPDATED*`,
        '',
        `- 📝 ${bold('New description:')} ${newDesc}`,
        `- 👤 ${bold('Changed by')} @${extra.sender.split('@')[0]}`,
        "",
        `_${pick(SLANG.good)} — fresh description, ${pick(SLANG.vibe)}_`
      ].join('\n');

      await sock.sendMessage(from, { text, mentions: [extra.sender] }, { quoted: msg });

    } catch (error) {
      console.error('SetDesc Error:', error);
      await extra.reply(`❌ *ERROR*\n\n${pick(SLANG.error)} — ${error.message}`);
    }
  }
};
