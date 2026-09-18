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
          `📌 AUTOSTICKER STATUS\n\n` +
          `*Status*: ${status}\n\n` +
          `When enabled, all images and videos go straight to sticker ${pick(SLANG.vibe)}\n\n` +
          `📱 *Usage*:\n` +
          `• .autosticker on\n` +
          `• .autosticker off`
        );
      }
      
      const opt = args[0].toLowerCase();
      
      if (opt === 'on') {
        if (database.getGroupSettings(extra.from).autosticker) {
          return extra.reply(`✅ SUCCESS\n\nAutosticker is already on ${pick(SLANG.vibe)}`);
        }
        database.updateGroupSettings(extra.from, { autosticker: true });
        return extra.reply(`✅ SUCCESS\n\nAutosticker turned ON ${pick(SLANG.good)}\n\nEvery image and video goes straight to sticker now`);
      }
      
      if (opt === 'off') {
        if (!database.getGroupSettings(extra.from).autosticker) {
          return extra.reply(`⚠️ WARNING\n\nAutosticker is off already ${pick(SLANG.vibe)}`);
        }
        database.updateGroupSettings(extra.from, { autosticker: false });
        return extra.reply(`✅ SUCCESS\n\nAutosticker turned OFF`);
      }
      
      return extra.reply(`❌ ERROR\n\nInvalid option\nUsage: .autosticker <on/off>`);
    } catch (error) {
      console.error('[AutoSticker Command Error]:', error);
      return extra.reply(`❌ ERROR\n\nCouldn't update autosticker setting`);
    }
  }
};

