/**
 * Set Prefix Command - Change bot command prefix
 * Saves to database so it persists across restarts (git reset)
 */

const config = require('../../config');
const database = require('../../database');
const { pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'setprefix',
  aliases: ['prefix'],
  category: 'owner',
  description: 'Change bot command prefix',
  usage: '.setprefix <new prefix>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const prefix = config.prefix || '.';
    try {
      if (args.length === 0) {
        const current = database.getPrefix() || config.prefix;
        return extra.reply(
          `*📌 CURRENT PREFIX*\n\n` +
          `📋 *Prefix:* *${current}*\n\n` +
          `💡 Usage: ${prefix}setprefix <new prefix>`
        );
      }

      const newPrefix = args[0];

      if (newPrefix.length > 3) {
        return extra.reply(`*❌ ERROR* — prefix must be 1-3 characters`);
      }

      // Save to database (survives git reset)
      database.setPrefix(newPrefix);

      // Also update in-memory config for immediate effect
      config.prefix = newPrefix;

      await extra.reply(
        `*✅ PREFIX UPDATED*\n\n` +
        `${pick(SLANG.good)}, prefix is now: *${newPrefix}*\n\n` +
        `🔄 New command format: ${newPrefix}command\n` +
        `💾 Saved to database — survives restarts`
      );

    } catch (error) {
      await extra.reply(`*❌ ERROR* — ${error.message}`);
    }
  }
};
