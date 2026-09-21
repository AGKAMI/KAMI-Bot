/**
 * Slowmode Command - Set message cooldown per user with bypass system
 */

const { bold, pick, SLANG, mention } = require('../../utils/format');
const database = require('../../database');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

const config = require('../../config');
const lastMessageTime = new Map();

module.exports = {
  name: 'slowmode',
  aliases: ['sm', 'cooldown'],
  category: 'admin',
  description: 'Set message cooldown per user',
  usage: '.slowmode <on/off/status/bypass/unbypass>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: false,

  lastMessageTime,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const { from, sender } = extra;
      const sub = (args[0] || '').toLowerCase();
      const settings = database.getGroupSettings(from);

      if (sub === 'status' || sub === '') {
        const statusText = buildStatus(settings, extra, prefix);
        const isOn = (settings.slowmode || 0) > 0;
        return sendButtons(sock, extra.from, {
          text: statusText,
          footer: 'Slowmode Settings',
          buttons: isOn
            ? [{ id: 'admin:slowmode:off', text: '🚫 Disable Slowmode' }]
            : [{ id: 'admin:slowmode:10s', text: '⏱️ Set 10s' }, { id: 'admin:slowmode:30s', text: '⏱️ Set 30s' }],
        }, { quoted: msg });
      }

      if (sub === 'on') {
        const current = settings.slowmode || 0;
        if (current === 0) {
          return extra.reply(
            `❌ *ERROR*\n\n` +
            `_Set a time first, e.g. ${prefix}slowmode 10s_`
          );
        }
        return extra.reply(
          `✅ *SLOWMODE*\n\n` +
          `_Already on at ${current}s, ${pick(SLANG.vibe)}_`
        );
      }

      if (sub === 'off' || sub === '0') {
        database.updateGroupSettings(from, { slowmode: 0 });
        lastMessageTime.delete(from);

        return extra.reply(
          `🐢 *SLOWMODE OFF*\n\n` +
          `✅ *Slowmode disabled*\n` +
          `👤 *Changed by:* ${mention(sender)}\n\n` +
          `_${pick(SLANG.vibe)} — free messages for everyone_`,
          [sender]
        );
      }

      if (sub === 'bypass') {
        const bypassJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!bypassJid) {
          return extra.reply(
            `❌ *ERROR*\n\n` +
            `_Tag a user to bypass, ${pick(SLANG.vibe)}_\n\n` +
            `_Example: ${prefix}slowmode bypass @user_`
          );
        }

        const bypass = settings.slowmodeBypass || [];
        if (bypass.includes(bypassJid)) {
          return extra.reply(
            `⚠️ *ALREADY BYPASSED*\n\n` +
            `${mention(bypassJid)} _already bypasses slowmode_`
          );
        }

        bypass.push(bypassJid);
        database.updateGroupSettings(from, { slowmodeBypass: bypass });

        return extra.reply(
          `✅ *SLOWMODE BYPASS*\n\n` +
          `👤 *User:* ${mention(bypassJid)}\n` +
          `🐢 *Status:* Bypasses slowmode\n\n` +
          `_${pick(SLANG.good)}, exempted!_`,
          [bypassJid]
        );
      }

      if (sub === 'unbypass') {
        const bypassJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!bypassJid) {
          return extra.reply(
            `❌ *ERROR*\n\n` +
            `_Tag a user to remove bypass, ${pick(SLANG.vibe)}_\n\n` +
            `_Example: ${prefix}slowmode unbypass @user_`
          );
        }

        const bypass = settings.slowmodeBypass || [];
        if (!bypass.includes(bypassJid)) {
          return extra.reply(
            `❌ *NOT BYPASSED*\n\n` +
            `${mention(bypassJid)} _is not in the bypass list_`
          );
        }

        const updated = bypass.filter(j => j !== bypassJid);
        database.updateGroupSettings(from, { slowmodeBypass: updated });

        return extra.reply(
          `✅ *BYPASS REMOVED*\n\n` +
          `👤 *User:* ${mention(bypassJid)}\n` +
          `_Now subject to slowmode again_`,
          [bypassJid]
        );
      }

      let seconds = 0;
      const match = sub.match(/^(\d+)(s|m|h)$/);

      if (!match) {
        return extra.reply(
          `❌ *ERROR*\n\n` +
          `💡 *Usage:*\n` +
          `• _.slowmode 10s_ — 10 seconds\n` +
          `• _.slowmode 5m_ — 5 minutes\n` +
          `• _.slowmode 1h_ — 1 hour\n` +
          `• _.slowmode off_ — disable\n` +
          `• _.slowmode status_ — check status\n` +
          `• _.slowmode bypass @user_ — exempt user\n` +
          `• _.slowmode unbypass @user_ — remove exemption`
        );
      }

      const value = parseInt(match[1]);
      const unit = match[2];

      if (unit === 's') seconds = value;
      else if (unit === 'm') seconds = value * 60;
      else if (unit === 'h') seconds = value * 3600;

      if (seconds < 5) {
        return extra.reply(`❌ *ERROR*\n\nMinimum slowmode is 5 seconds`);
      }

      if (seconds > 3600) {
        return extra.reply(`❌ *ERROR*\n\nMaximum slowmode is 1 hour`);
      }

      database.updateGroupSettings(from, { slowmode: seconds });

      let cooldownLabel;
      if (seconds >= 3600) {
        cooldownLabel = `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
      } else if (seconds >= 60) {
        cooldownLabel = `${Math.floor(seconds / 60)}m ${seconds % 60 > 0 ? seconds % 60 + 's' : ''}`.trim();
      } else {
        cooldownLabel = `${seconds}s`;
      }

      return extra.reply(
        `🐢 *SLOWMODE ENABLED*\n\n` +
        `⏱️ *Cooldown:* ${cooldownLabel}\n` +
        `👤 *Set by:* ${mention(sender)}\n` +
        `⚠️ *Rule:* Members must wait ${cooldownLabel} between messages\n` +
        `👑 *Admins:* Always bypass\n\n` +
        `_${pick(SLANG.good)}, keeping the chat clean!_`,
        [sender]
      );

    } catch (error) {
      console.error('Slowmode Error:', error);
      await extra.reply(`❌ *ERROR*\n\n${pick(SLANG.error)} — ${error.message}`);
    }
  }
};

function buildStatus(settings, extra, prefix) {
  const seconds = settings.slowmode || 0;
  const status = seconds === 0 ? '❌ Off' : `✅ ${seconds}s`;
  let cooldownLabel = 'None';

  if (seconds > 0) {
    if (seconds >= 3600) {
      cooldownLabel = `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    } else if (seconds >= 60) {
      cooldownLabel = `${Math.floor(seconds / 60)}m ${seconds % 60 > 0 ? seconds % 60 + 's' : ''}`.trim();
    } else {
      cooldownLabel = `${seconds}s`;
    }
  }

  const bypass = settings.slowmodeBypass || [];

  return (
    `🐢 *SLOWMODE STATUS*\n\n` +
    `⏱️ *Status:* ${status}\n` +
    `⏳ *Cooldown:* ${cooldownLabel}\n` +
    `👥 *Group:* ${extra.groupMetadata?.subject || 'Unknown'}\n` +
    `👑 *Admins:* Always bypass\n` +
    `👥 *Bypass list:* ${bypass.length} users\n\n` +
    `📱 *Commands:*\n` +
    `• _${prefix}slowmode 10s / 5m / 1h_\n` +
    `• _${prefix}slowmode off_\n` +
    `• _${prefix}slowmode bypass @user_\n` +
    `• _${prefix}slowmode unbypass @user_`
  );
}

// Button handlers
onButton('admin:slowmode:off', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { slowmode: 0 });
  await sock.sendMessage(from, {
    text: `✅ *SLOWMODE OFF*\n\n_Message cooldown disabled_`,
  });
});

onButton('admin:slowmode:10s', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { slowmode: 10 });
  await sock.sendMessage(from, {
    text: `✅ *SLOWMODE ON*\n\n⏱️ *Cooldown:* 10s\n_Everyone must wait 10s between messages_`,
  });
});

onButton('admin:slowmode:30s', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { slowmode: 30 });
  await sock.sendMessage(from, {
    text: `✅ *SLOWMODE ON*\n\n⏱️ *Cooldown:* 30s\n_Everyone must wait 30s between messages_`,
  });
});
