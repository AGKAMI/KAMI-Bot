/**
 * Addbadword Command - Add word to blacklist
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'addbadword',
  aliases: ['addword', 'banword'],
  category: 'admin',
  description: 'Add word to bad word blacklist',
  usage: '.addbadword <word>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      const word = (args[0] || '').toLowerCase().trim();

      if (!word) {
        return extra.reply(
          `❌ *ERROR*\n\n` +
          `_Provide the word to blacklist, ${pick(SLANG.vibe)}_\n\n` +
          `_Example: .addbadword stupid_`
        );
      }

      const settings = database.getGroupSettings(extra.from);
      const badwords = settings.badwords || [];

      if (badwords.includes(word)) {
        return extra.reply(
          `⚠️ *ALREADY EXISTS*\n\n` +
          `_${word} is already in the blacklist, ${pick(SLANG.vibe)}_`
        );
      }

      badwords.push(word);
      database.updateGroupSettings(extra.from, { badwords });

      return extra.reply(
        `✅ *WORD ADDED*\n\n` +
        `📝 *Word:* ${word}\n` +
        `📊 *Total:* ${badwords.length} words\n\n` +
        `_${pick(SLANG.good)}, blacklisted!_`
      );

    } catch (error) {
      await extra.reply(`*❌ ERROR*\n\n_${error.message}_`);
    }
  }
};
