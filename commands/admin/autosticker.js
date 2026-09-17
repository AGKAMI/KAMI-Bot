/**
 * AutoSticker Command - Enable or disable auto-sticker conversion
 */

const database = require('../../database');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'autosticker',
  aliases: ['autos', 'asticker'],
  category: 'admin',
  description: 'Enable or disable auto-sticker conversion (images/videos automatically become stickers)',
  usage: '.autosticker <on/off>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: false,
  
  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.autosticker ? 'ON' : 'OFF';
        return extra.reply(
          `📌 ${bold('AutoSticker Status')}\n\n` +
          `${bold('Status')}: *${status}*\n\n` +
          `When enabled, all images and videos sent in this group will automatically be converted to stickers.\n\n` +
          `Usage:\n` +
          `  .autosticker on\n` +
          `  .autosticker off`
        );
      }
      
      const opt = args[0].toLowerCase();
      
      if (opt === 'on') {
        if (database.getGroupSettings(extra.from).autosticker) {
          return extra.reply('✅ _sho, autosticker is already on_');
        }
        database.updateGroupSettings(extra.from, { autosticker: true });
        return extra.reply('✅ _lekke, autosticker turned ON_\n\nevery image and video goes straight to sticker now');
      }
      
      if (opt === 'off') {
        if (!database.getGroupSettings(extra.from).autosticker) {
          return extra.reply('❌ _autosticker is off already_');
        }
        database.updateGroupSettings(extra.from, { autosticker: false });
        return extra.reply('❌ _moegoe, autosticker turned off_');
      }
      
      return extra.reply('❌ _moegoe, invalid option_\nusage: .autosticker <on/off>');
    } catch (error) {
      console.error('[AutoSticker Command Error]:', error);
      return extra.reply("❌ _moegoe, couldn't update autosticker setting_");
    }
  }
};

