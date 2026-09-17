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
          `📌 ${bold('AUTOSTICKER STATUS')}\n\n` +
          `${bold('Status')}: *${status}*\n\n` +
          `_When enabled, all images and videos go straight to sticker_${pick(SLANG.vibe)}\n\n` +
          `Usage:\n` +
          `  .autosticker on\n` +
          `  .autosticker off`
        );
      }
      
      const opt = args[0].toLowerCase();
      
      if (opt === 'on') {
        if (database.getGroupSettings(extra.from).autosticker) {
          return extra.reply(`✅ _${pick(SLANG.vibe)}, autosticker is already on_`);
        }
        database.updateGroupSettings(extra.from, { autosticker: true });
        return extra.reply(`✅ _${pick(SLANG.good)}, autosticker turned ON_\n\nevery image and video goes straight to sticker now hey`);
      }
      
      if (opt === 'off') {
        if (!database.getGroupSettings(extra.from).autosticker) {
          return extra.reply(`❌ _${pick(SLANG.vibe)}, autosticker is off already_`);
        }
        database.updateGroupSettings(extra.from, { autosticker: false });
        return extra.reply(`❌ _${pick(SLANG.error)}, autosticker turned off_`);
      }
      
      return extra.reply(`❌ _${pick(SLANG.error)}, invalid option_\nusage: .autosticker <on/off>`);
    } catch (error) {
      console.error('[AutoSticker Command Error]:', error);
      return extra.reply(`❌ _${pick(SLANG.error)} — couldn't update autosticker setting_`);
    }
  }
};

