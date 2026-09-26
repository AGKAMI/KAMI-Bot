/**
 * Addbadword Command - Add pattern to blacklist (wildcard/phrase/simple)
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'addbadword',
  reactions: { received: '🤬', done: '🚫' },
  aliases: ['addword', 'banword'],
  category: 'admin',
  description: 'Add pattern to bad word blacklist',
  usage: '.addbadword <pattern>',
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
          `_Provide a pattern to blacklist, ${pick(SLANG.vibe)}_\n\n` +
          `💡 *Pattern types:*\n` +
          `• _.addbadword bad* _ — wildcard (matches "badass", "badword")\n` +
          `• _.addbadword "bad word"_ — phrase (exact phrase match)\n` +
          `• _.addbadword stupid_ — simple (exact word match)\n\n` +
          `_Example: ${prefix}addbadword "bad word"_`
        );
      }

      const settings = database.getGroupSettings(extra.from);
      const badwords = settings.badwords || [];

      const normalized = raw.toLowerCase();

      if (badwords.includes(normalized)) {
        return extra.reply(
          `⚠️ *ALREADY EXISTS*\n\n` +
          `_${normalized} is already in the blacklist, ${pick(SLANG.vibe)}_`
        );
      }

      badwords.push(normalized);
      database.updateGroupSettings(extra.from, { badwords });

      const wildcards = badwords.filter(w => w.includes('*')).length;
      const phrases = badwords.filter(w => w.startsWith('"') && w.endsWith('"')).length;
      const simple = badwords.length - wildcards - phrases;

      let typeLabel = 'simple';
      if (normalized.includes('*')) typeLabel = 'wildcard';
      else if (normalized.startsWith('"') && normalized.endsWith('"')) typeLabel = 'phrase';

      return extra.reply(
        `✅ *PATTERN ADDED*\n\n` +
        `📝 *Pattern:* ${normalized}\n` +
        `🏷️ *Type:* ${typeLabel}\n` +
        `📊 *Total:* ${badwords.length} patterns (${wildcards} wildcards, ${phrases} phrases, ${simple} simple)\n\n` +
        `_${pick(SLANG.good)}, blacklisted!_`
      );

    } catch (error) {
      await extra.reply(`❌ *ERROR*\n\n_${error.message}_`);
    }
  }
};
