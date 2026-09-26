/**
 * Delbadword Command - Remove pattern from blacklist
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'delbadword',
  reactions: { received: '🗑️', done: '🚫' },
  aliases: ['delword', 'removebadword', 'unbanword'],
  category: 'admin',
  description: 'Remove pattern from bad word blacklist',
  usage: '.delbadword <pattern>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const raw = args.join(' ').trim();

      if (!raw) {
        return extra.reply(
          `❌ *ERROR*\n\n` +
          `_Provide the pattern to remove, ${pick(SLANG.vibe)}_\n\n` +
          `_Example: ${prefix}delbadword bad*_`
        );
      }

      const settings = database.getGroupSettings(extra.from);
      const badwords = settings.badwords || [];
      const normalized = raw.toLowerCase();

      if (!badwords.includes(normalized)) {
        return extra.reply(
          `❌ *NOT FOUND*\n\n` +
          `_${normalized} isn't in the blacklist, ${pick(SLANG.vibe)}_\n\n` +
          `_Use ${prefix}antibadword status to see all patterns_`
        );
      }

      const updated = badwords.filter(w => w !== normalized);
      database.updateGroupSettings(extra.from, { badwords: updated });

      const wildcards = updated.filter(w => w.includes('*')).length;
      const phrases = updated.filter(w => w.startsWith('"') && w.endsWith('"')).length;
      const simple = updated.length - wildcards - phrases;

      return extra.reply(
        `✅ *PATTERN REMOVED*\n\n` +
        `📝 *Pattern:* ${normalized}\n` +
        `📊 *Remaining:* ${updated.length} patterns (${wildcards} wildcards, ${phrases} phrases, ${simple} simple)\n\n` +
        `_${pick(SLANG.good)}, removed from blacklist!_`
      );

    } catch (error) {
      await extra.reply(`❌ *ERROR*\n\n_${error.message}_`);
    }
  }
};
