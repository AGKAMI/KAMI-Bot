/**
 * Antibadword Command - Toggle bad word filter
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'antibadword',
  aliases: ['badword', 'wordfilter', 'autocensor'],
  category: 'admin',
  description: 'Toggle bad word filter',
  usage: '.antibadword <on/off/status>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      const sub = (args[0] || '').toLowerCase();

      // No args — show status
      if (!sub) {
        const settings = database.getGroupSettings(extra.from);
        return extra.reply(buildStatus(settings));
      }

      // .antibadword status
      if (sub === 'status') {
        const settings = database.getGroupSettings(extra.from);
        return extra.reply(buildStatus(settings));
      }

      // .antibadword on
      if (sub === 'on') {
        const settings = database.getGroupSettings(extra.from);
        if (settings.antibadword) {
          return extra.reply(
            `✅ *ANTIBADWORD*\n\n` +
            `_Already on, ${pick(SLANG.vibe)}_`
          );
        }
        database.updateGroupSettings(extra.from, { antibadword: true });
        return extra.reply(
          `✅ *ANTIBADWORD ON*\n\n` +
          `_Bad word filter activated, ${pick(SLANG.good)}!_`
        );
      }

      // .antibadword off
      if (sub === 'off') {
        database.updateGroupSettings(extra.from, { antibadword: false });
        return extra.reply(
          `✅ *ANTIBADWORD OFF*\n\n` +
          `_Bad word filter disabled_`
        );
      }

      return extra.reply(
        `❌ *ERROR*\n\n` +
        `_Use .antibadword for usage, ${pick(SLANG.vibe)}_`
      );

    } catch (error) {
      await extra.reply(`*❌ ERROR*\n\n_${error.message}_`);
    }
  }
};

function buildStatus(settings) {
  const status = settings.antibadword ? 'ON' : 'OFF';
  const words = settings.badwords || [];
  const count = words.length;

  return (
    `🛡️ *ANTIBADWORD STATUS*\n\n` +
    `⚡ *Status:* ${status}\n` +
    `📝 *Words:* ${count} in blacklist\n\n` +
    `📱 *Commands:*\n` +
    `• _.antibadword on_\n` +
    `• _.antibadword off_\n` +
    `• _.addbadword <word>_\n` +
    `• _.delbadword <word>_`
  );
}
