/**
 * Delbadword Command - Remove word from blacklist
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'delbadword',
  aliases: ['delword', 'removebadword', 'unbanword'],
  category: 'admin',
  description: 'Remove word from bad word blacklist',
  usage: '.delbadword <word>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      const word = (args[0] || '').toLowerCase().trim();

      if (!word) {
        return extra.reply(
          `❌ *ERROR*\n\n` +
          `_Provide the word to remove, ${pick(SLANG.vibe)}_\n\n` +
          `_Example: .delbadword stupid_`
        );
      }

      const settings = database.getGroupSettings(extra.from);
      const badwords = settings.badwords || [];

      if (!badwords.includes(word)) {
        return extra.reply(
          `❌ *NOT FOUND*\n\n` +
          `_${word} isn't in the blacklist, ${pick(SLANG.vibe)}_`
        );
      }

      const updated = badwords.filter(w => w !== word);
      database.updateGroupSettings(extra.from, { badwords: updated });

      return extra.reply(
        `✅ *WORD REMOVED*\n\n` +
        `📝 *Word:* ${word}\n` +
        `📊 *Remaining:* ${updated.length} words\n\n` +
        `_${pick(SLANG.good)}, removed from blacklist!_`
      );

    } catch (error) {
      await extra.reply(`*❌ ERROR*\n\n_${error.message}_`);
    }
  }
};
