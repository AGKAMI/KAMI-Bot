/**
 * Antiflood Command - Toggle anti-flood protection with exemptions
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG, mention } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

module.exports = {
  name: 'antiflood',
  aliases: ['flood', 'spamprotect'],
  category: 'admin',
  description: 'Configure anti-flood protection',
  usage: '.antiflood <on/off/status/set/exempt/unexempt/exemptlist>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const sub = (args[0] || '').toLowerCase();
      const settings = database.getGroupSettings(extra.from);

      if (!sub || sub === 'status') {
        const statusText = buildStatus(settings, prefix);
        const isOn = settings.antiflood;
        return sendButtons(sock, extra.from, {
          text: statusText,
          footer: 'Antiflood Settings',
          buttons: isOn
            ? [{ id: 'admin:antiflood:off', text: '🚫 Disable Protection' }]
            : [{ id: 'admin:antiflood:on', text: '🛡️ Enable Protection' }],
        }, { quoted: msg });
      }

      if (sub === 'on') {
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

      if (sub === 'off') {
        database.updateGroupSettings(extra.from, { antiflood: false });
        return extra.reply(
          `✅ *ANTIFLOOD OFF*\n\n` +
          `_Anti-flood protection disabled_`
        );
      }

      if (sub === 'set') {
        if (args.length < 4) {
          return extra.reply(
            `❌ *ERROR*\n\n` +
            `_Usage: ${prefix}antiflood set <limit> <window>s <action>_\n\n` +
            `_${pick(SLANG.vibe)}:_\n` +
            `• _Limit = max messages in window_\n` +
            `• _Window = time in seconds_\n` +
            `• _Action = warn / delete / kick_\n\n` +
            `_Example: ${prefix}antiflood set 5 10s warn_`
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

        if (!['warn', 'delete', 'kick'].includes(action)) {
          return extra.reply(
            `❌ *ERROR*\n\n` +
            `_Invalid action — choose warn, delete, or kick_`
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

      if (sub === 'exempt') {
        const exemptJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!exemptJid) {
          return extra.reply(
            `❌ *ERROR*\n\n` +
            `_Tag a user to exempt, ${pick(SLANG.vibe)}_\n\n` +
            `_Example: ${prefix}antiflood exempt @user_`
          );
        }

        const exempt = settings.antifloodExempt || [];
        if (exempt.includes(exemptJid)) {
          return extra.reply(
            `⚠️ *ALREADY EXEMPT*\n\n` +
            `${mention(exemptJid)} _is already exempt from flood detection_`
          );
        }

        exempt.push(exemptJid);
        database.updateGroupSettings(extra.from, { antifloodExempt: exempt });

        return extra.reply(
          `✅ *USER EXEMPTED*\n\n` +
          `👤 *User:* ${mention(exemptJid)}\n` +
          `🛡️ *Status:* Bypasses flood detection\n\n` +
          `_${pick(SLANG.good)}, exempted!_`,
          [exemptJid]
        );
      }

      if (sub === 'unexempt') {
        const exemptJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!exemptJid) {
          return extra.reply(
            `❌ *ERROR*\n\n` +
            `_Tag a user to unexempt, ${pick(SLANG.vibe)}_\n\n` +
            `_Example: ${prefix}antiflood unexempt @user_`
          );
        }

        const exempt = settings.antifloodExempt || [];
        if (!exempt.includes(exemptJid)) {
          return extra.reply(
            `❌ *NOT EXEMPT*\n\n` +
            `${mention(exemptJid)} _is not in the exemption list_`
          );
        }

        const updated = exempt.filter(j => j !== exemptJid);
        database.updateGroupSettings(extra.from, { antifloodExempt: updated });

        return extra.reply(
          `✅ *EXEMPTION REMOVED*\n\n` +
          `👤 *User:* ${mention(exemptJid)}\n` +
          `_Now subject to flood detection again_`,
          [exemptJid]
        );
      }

      if (sub === 'exemptlist') {
        const exempt = settings.antifloodExempt || [];
        if (exempt.length === 0) {
          return extra.reply(
            `📋 *EXEMPT LIST*\n\n` +
            `_No users exempted yet, ${pick(SLANG.vibe)}_`
          );
        }

        const list = exempt.map((j, i) => `${i + 1}. ${mention(j)}`).join('\n');
        return extra.reply(
          `📋 *EXEMPT LIST*\n\n` +
          `👥 *Exempt users (${exempt.length}):*\n${list}\n\n` +
          `_These users bypass flood detection_`,
          exempt
        );
      }

      return extra.reply(
        `❌ *ERROR*\n\n` +
        `_Use ${prefix}antiflood for usage, ${pick(SLANG.vibe)}_`
      );

    } catch (error) {
      await extra.reply(`❌ *ERROR*\n\n_${error.message}_`);
    }
  }
};

function buildStatus(settings, prefix) {
  const status = settings.antiflood ? 'ON' : 'OFF';
  const limit = settings.antifloodLimit || 5;
  const windowSec = settings.antifloodWindow || 10;
  const action = settings.antifloodAction || 'warn';
  const exempt = settings.antifloodExempt || [];

  return (
    `🛡️ *ANTIFLOOD STATUS*\n\n` +
    `⚡ *Status:* ${status}\n` +
    `📊 *Limit:* ${limit} messages\n` +
    `⏱️ *Window:* ${windowSec}s\n` +
    `🔨 *Action:* ${action}\n` +
    `👥 *Exempt:* ${exempt.length} users\n\n` +
    `📱 *Commands:*\n` +
    `• _${prefix}antiflood on_\n` +
    `• _${prefix}antiflood off_\n` +
    `• _${prefix}antiflood set <limit> <window>s <action>_\n` +
    `• _${prefix}antiflood exempt @user_\n` +
    `• _${prefix}antiflood unexempt @user_\n` +
    `• _${prefix}antiflood exemptlist_\n\n` +
    `_Actions: warn, delete, kick_`
  );
}

// Button handlers
onButton('admin:antiflood:on', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { antiflood: true });
  await sock.sendMessage(from, {
    text: `✅ *ANTIFLOOD ON*\n\n_Anti-flood protection activated_`,
  });
});

onButton('admin:antiflood:off', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { antiflood: false });
  await sock.sendMessage(from, {
    text: `✅ *ANTIFLOOD OFF*\n\n_Anti-flood protection disabled_`,
  });
});
