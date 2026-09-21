/**
 * Antibadword Command - Toggle bad word filter with wildcard/phrase support
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'antibadword',
  aliases: ['badword', 'wordfilter', 'autocensor'],
  category: 'admin',
  description: 'Toggle bad word filter',
  usage: '.antibadword <on/off/status/exempt/exceptions>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const sub = (args[0] || '').toLowerCase();

      if (!sub || sub === 'status') {
        const settings = database.getGroupSettings(extra.from);
        return extra.reply(buildStatus(settings, prefix));
      }

      if (sub === 'on') {
        const settings = database.getGroupSettings(extra.from);
        if (settings.antibadword) {
          return extra.reply(
            `✅ *ANTIBADWORD*\n\n` +
            `_Already on, ${pick(SLANG.vibe)}_`
          );
        }
        // Seed defaults so the filter works out of the box
        const config = require('../../config');
        const seeded = [...(settings.badwords || [])];
        const defaults = config.defaultBadwords || [];
        for (const w of defaults) {
          if (!seeded.includes(w)) seeded.push(w);
        }
        database.updateGroupSettings(extra.from, { antibadword: true, badwords: seeded });
        return extra.reply(
          `✅ *ANTIBADWORD ON*\n\n` +
          `_Bad word filter activated with ${seeded.length} patterns, ${pick(SLANG.good)}!_`
        );
      }

      if (sub === 'off') {
        database.updateGroupSettings(extra.from, { antibadword: false });
        return extra.reply(
          `✅ *ANTIBADWORD OFF*\n\n` +
          `_Bad word filter disabled_`
        );
      }

      if (sub === 'set') {
        const action = (args[1] || '').toLowerCase();
        if (!['warn', 'delete', 'kick'].includes(action)) {
          return extra.reply(
            `❌ *ERROR*\n\n` +
            `${bold('Usage:')} ${prefix}antibadword set <warn|delete|kick>${pick(SLANG.vibe)}\n\n` +
            `• _warn_ — warn the user but don't delete\n` +
            `• _delete_ — delete the bad message\n` +
            `• _kick_ — delete + kick the user`
          );
        }
        database.updateGroupSettings(extra.from, { badwordAction: action });
        return extra.reply(
          `✅ *ANTIBADWORD SET*\n\n` +
          `🔨 *Action:* ${action}\n\n` +
          `_${pick(SLANG.good)}, bad word action updated!_`
        );
      }

      if (sub === 'exempt') {
        const mention = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mention) {
          return extra.reply(
            `❌ *ERROR*\n\n` +
            `_Tag a user to exempt, ${pick(SLANG.vibe)}_\n\n` +
            `_Example: ${prefix}antibadword exempt @user_`
          );
        }

        const settings = database.getGroupSettings(extra.from);
        const exempt = settings.badwordExempt || [];
        if (exempt.includes(mention)) {
          return extra.reply(
            `⚠️ *ALREADY EXEMPT*\n\n` +
            `@${mention.split('@')[0]} _is already exempt from bad word filter_`
          );
        }

        exempt.push(mention);
        database.updateGroupSettings(extra.from, { badwordExempt: exempt });

        return extra.reply(
          `✅ *USER EXEMPTED*\n\n` +
          `👤 *User:* @${mention.split('@')[0]}\n` +
          `🛡️ *Status:* Bypasses bad word filter\n\n` +
          `_${pick(SLANG.good)}, exempted!_`,
          [mention]
        );
      }

      if (sub === 'exceptions') {
        const settings = database.getGroupSettings(extra.from);
        const exempt = settings.badwordExempt || [];
        if (exempt.length === 0) {
          return extra.reply(
            `📋 *BADWORD EXCEPTIONS*\n\n` +
            `_No users exempted yet, ${pick(SLANG.vibe)}_\n` +
            `_Admins are always exempt by default_`
          );
        }

        const list = exempt.map((j, i) => `${i + 1}. @${j.split('@')[0]}`).join('\n');
        return extra.reply(
          `📋 *BADWORD EXCEPTIONS*\n\n` +
          `👑 *Admins:* Always exempt\n` +
          `👥 *Exempt users (${exempt.length}):*\n${list}`,
          exempt
        );
      }

      return extra.reply(
        `❌ *ERROR*\n\n` +
        `_Use ${prefix}antibadword for usage, ${pick(SLANG.vibe)}_`
      );

    } catch (error) {
      await extra.reply(`❌ *ERROR*\n\n_${error.message}_`);
    }
  }
};

function buildStatus(settings, prefix) {
  const status = settings.antibadword ? 'ON' : 'OFF';
  const words = settings.badwords || [];
  const wildcards = words.filter(w => w.includes('*')).length;
  const phrases = words.filter(w => w.startsWith('"') && w.endsWith('"')).length;
  const simple = words.length - wildcards - phrases;
  const exempt = settings.badwordExempt || [];
  const action = settings.badwordAction || 'delete';

  return (
    `🛡️ *ANTIBADWORD STATUS*\n\n` +
    `⚡ *Status:* ${status}\n` +
    `🔨 *Action:* ${action} (warn/delete/kick)\n` +
    `📝 *Patterns:* ${wildcards} wildcards, ${phrases} phrases, ${simple} simple\n` +
    `📊 *Total:* ${words.length} patterns\n` +
    `👥 *Exempt:* ${exempt.length} users + admins\n\n` +
    `📱 *Commands:*\n` +
    `• _${prefix}antibadword on_ — enable (auto-seeds SA slurs)\n` +
    `• _${prefix}antibadword off_\n` +
    `• _${prefix}antibadword set <warn|delete|kick>_\n` +
    `• _${prefix}addbadword <pattern>_\n` +
    `• _${prefix}delbadword <pattern>_\n` +
    `• _${prefix}antibadword exempt @user_\n` +
    `• _${prefix}antibadword exceptions_\n\n` +
    `💡 _Patterns: *bad* = wildcard, "bad word" = phrase, bad = simple. Matching is case-insensitive._`
  );
}
