/**
 * Slowmode Command - Set message cooldown per user
 */

const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

// In-memory cooldown tracking (resets on restart)
const lastMessageTime = new Map();

module.exports = {
  name: 'slowmode',
  aliases: ['sm', 'cooldown'],
  category: 'admin',
  description: 'Set message cooldown per user',
  usage: '.slowmode off / .slowmode 10s / .slowmode 5m / .slowmode status',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: false,

  // Expose for handler to check before messages
  lastMessageTime,

  async execute(sock, msg, args, extra) {
    try {
      const { from, sender } = extra;
      const sub = (args[0] || '').toLowerCase();
      const settings = database.getGroupSettings(from);

      if (sub === 'status' || sub === '') {
        const seconds = settings.slowmode || 0;
        const status = seconds === 0 ? '❌ Off' : `✅ ${seconds}s`;
        let cooldownLabel = 'None';

        if (seconds > 0) {
          if (seconds >= 60) {
            cooldownLabel = `${Math.floor(seconds / 60)}m ${seconds % 60 > 0 ? seconds % 60 + 's' : ''}`.trim();
          } else {
            cooldownLabel = `${seconds}s`;
          }
        }

        const text = [
          `🐢 *SLOWMODE*`,
          '',
          `- ⏱️ ${bold('Status:')} ${status}`,
          `- ⏳ ${bold('Cooldown:')} ${cooldownLabel}`,
          `- 👥 ${bold('Group:')} ${extra.groupMetadata?.subject || 'Unknown'}`,
          '',
          `_💡 Usage: .slowmode 10s / .slowmode 5m / .slowmode off_`
        ].join('\n');

        return await extra.reply(text);
      }

      if (sub === 'off' || sub === '0') {
        database.updateGroupSettings(from, { slowmode: 0 });
        lastMessageTime.delete(from);

        const text = [
          `🐢 *SLOWMODE OFF*`,
          '',
          `- ✅ ${bold('Slowmode disabled')}`,
          `- 👤 ${bold('Changed by')} @${sender.split('@')[0]}`,
          "",
          `_${pick(SLANG.vibe)} — free messages for everyone_`
        ].join('\n');

        return await sock.sendMessage(from, { text, mentions: [sender] }, { quoted: msg });
      }

      // Parse time value
      let seconds = 0;
      const match = sub.match(/^(\d+)(s|m|h)$/);

      if (!match) {
        const text = [
          `❌ *ERROR*`,
          '',
          `💡 Usage:`,
          `- .slowmode 10s → 10 seconds`,
          `- .slowmode 5m → 5 minutes`,
          `- .slowmode 1h → 1 hour`,
          `- .slowmode off → disable`,
          `- .slowmode status → check status`
        ].join('\n');
        return await extra.reply(text);
      }

      const value = parseInt(match[1]);
      const unit = match[2];

      if (unit === 's') seconds = value;
      else if (unit === 'm') seconds = value * 60;
      else if (unit === 'h') seconds = value * 3600;

      if (seconds < 5) {
        return await extra.reply(`❌ *ERROR*\n\nMinimum slowmode is 5 seconds, ${pick(SLANG.friend)}`);
      }

      if (seconds > 3600) {
        return await extra.reply(`❌ *ERROR*\n\nMaximum slowmode is 1 hour, ${pick(SLANG.friend)}`);
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

      const text = [
        `🐢 *SLOWMODE ENABLED*`,
        "",
        `- ⏱️ ${bold('Cooldown:')} ${cooldownLabel}`,
        `- 👤 ${bold('Set by')} @${sender.split('@')[0]}`,
        `- ⚠️ ${bold('Rule:')} Members must wait ${cooldownLabel} between messages`,
        "",
        `_${pick(SLANG.good)} — keeping the chat clean, ${pick(SLANG.vibe)}_`
      ].join('\n');

      await sock.sendMessage(from, { text, mentions: [sender] }, { quoted: msg });

    } catch (error) {
      console.error('Slowmode Error:', error);
      await extra.reply(`❌ *ERROR*\n\n${pick(SLANG.error)} — ${error.message}`);
    }
  }
};
