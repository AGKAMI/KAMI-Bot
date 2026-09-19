/**
 * Antiflood Command - Toggle anti-flood protection
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'antiflood',
  aliases: ['flood', 'spamprotect'],
  category: 'admin',
  description: 'Configure anti-flood protection',
  usage: '.antiflood <on/off/status/set <limit> <window>s <action>>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      const sub = (args[0] || '').toLowerCase();

      // No args — show usage
      if (!sub) {
        const settings = database.getGroupSettings(extra.from);
        return extra.reply(buildStatus(settings));
      }

      // .antiflood status
      if (sub === 'status') {
        const settings = database.getGroupSettings(extra.from);
        return extra.reply(buildStatus(settings));
      }

      // .antiflood on
      if (sub === 'on') {
        const settings = database.getGroupSettings(extra.from);
        if (settings.antiflood) {
          return extra.reply(
            `✅ *ANTIFLOOD*\n\n` +
            `_Already on, ${pick(SLANG.vibe)}_`
          );
        }
        database.updateGroupSettings(extra.from, { antiflood: true });
        return extra.reply(
          `✅ *ANTIFLOOD ON*\n\n` +
          `_Anti-flood protection activated, ${pick(SLANG.good)}!_`
        );
      }

      // .antiflood off
      if (sub === 'off') {
        database.updateGroupSettings(extra.from, { antiflood: false });
        return extra.reply(
          `✅ *ANTIFLOOD OFF*\n\n` +
          `_Anti-flood protection disabled_`
        );
      }

      // .antiflood set <limit> <window>s <action>
      if (sub === 'set') {
        if (args.length < 4) {
          return extra.reply(
            `❌ *ERROR*\n\n` +
            `_Usage: .antiflood set <limit> <window>s <action>_\n\n` +
            `_${pick(SLANG.vibe)}:_\n` +
            `• _Limit = max messages in window_\n` +
            `• _Window = time in seconds_\n` +
            `• _Action = warn / kick / mute_\n\n` +
            `_Example: .antiflood set 5 10s warn_`
          );
        }

        const limit = parseInt(args[1]);
        const windowRaw = args[2].replace(/s$/i, '');
        const windowSec = parseInt(windowRaw);
        const action = args[3].toLowerCase();

        if (isNaN(limit) || limit < 1) {
          return extra.reply(
            `❌ *ERROR*\n\n` +
            `_Invalid limit — must be a number > 0_`
          );
        }

        if (isNaN(windowSec) || windowSec < 1) {
          return extra.reply(
            `❌ *ERROR*\n\n` +
            `_Invalid window — must be seconds > 0_`
          );
        }

        if (!['warn', 'kick', 'mute'].includes(action)) {
          return extra.reply(
            `❌ *ERROR*\n\n` +
            `_Invalid action — choose warn, kick, or mute_`
          );
        }

        database.updateGroupSettings(extra.from, {
          antiflood: true,
          antifloodLimit: limit,
          antifloodWindow: windowSec,
          antifloodAction: action
        });

        return extra.reply(
          `✅ *ANTIFLOOD CONFIGURED*\n\n` +
          `📊 *Limit:* ${limit} messages\n` +
          `⏱️ *Window:* ${windowSec}s\n` +
          `🔨 *Action:* ${action}\n\n` +
          `_${pick(SLANG.good)}, anti-flood is set!_`
        );
      }

      return extra.reply(
        `❌ *ERROR*\n\n` +
        `_Use .antiflood for usage, ${pick(SLANG.vibe)}_`
      );

    } catch (error) {
      await extra.reply(`*❌ ERROR*\n\n_${error.message}_`);
    }
  }
};

function buildStatus(settings) {
  const status = settings.antiflood ? 'ON' : 'OFF';
  const limit = settings.antifloodLimit || 5;
  const window = settings.antifloodWindow || 10;
  const action = settings.antifloodAction || 'warn';

  return (
    `🛡️ *ANTIFLOOD STATUS*\n\n` +
    `⚡ *Status:* ${status}\n` +
    `📊 *Limit:* ${limit} messages\n` +
    `⏱️ *Window:* ${window}s\n` +
    `🔨 *Action:* ${action}\n\n` +
    `📱 *Commands:*\n` +
    `• _.antiflood on_\n` +
    `• _.antiflood off_\n` +
    `• _.antiflood set <limit> <window>s <action>_\n\n` +
    `_Actions: warn, kick, mute_`
  );
}
