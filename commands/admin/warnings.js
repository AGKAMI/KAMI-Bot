/**
 * Warnings Command - Check a user's warning count
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'warnings',
  aliases: ['warns', 'checkwarn'],
  category: 'admin',
  description: 'Check a user\'s warning count',
  usage: '.warnings @user',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      let target;
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      if (mentioned && mentioned.length > 0) {
        target = mentioned[0];
      } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
        target = ctx.participant;
      } else {
        return extra.reply(
          `⚠️ *WARNINGS*\n\n` +
          `_Tag or reply to the person you wanna check_${pick(SLANG.vibe)}\n\n` +
          `_Example: .warnings @user_`
        );
      }

      const warnings = database.getWarnings(extra.from, target);
      const max = config.maxWarnings;
      const remaining = max - warnings.count;

      if (warnings.count === 0) {
        return sock.sendMessage(extra.from, {
          text: `✅ *CLEAN RECORD*\n\n` +
                `👤 @${target.split('@')[0]}\n` +
                `📝 *Warnings:* 0/${max}\n\n` +
                `_${pick(SLANG.good)}, they're clean hey!_`,
          mentions: [target]
        }, { quoted: msg });
      }

      let text = `⚠️ *WARNINGS*\n\n`;
      text += `👤 @${target.split('@')[0]}\n`;
      text += `📊 *Count:* ${warnings.count}/${max}\n`;
      text += `💀 *Remaining:* ${remaining} ${remaining === 1 ? 'strike' : 'strikes'}\n`;
      text += `----------\n`;

      warnings.warnings.forEach((w, i) => {
        const date = new Date(w.date).toLocaleDateString('en-ZA', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
        text += `⚠️ *#${i + 1}* — ${w.reason}\n`;
        text += `   📅 ${date}\n`;
      });

      text += `----------\n\n`;
      text += remaining <= 1
        ? `🚨 _One more and they're OUT, ${pick(SLANG.vibe)}!_`
        : `__${remaining} more and they're gone, ${pick(SLANG.friend)}_`;

      await sock.sendMessage(extra.from, {
        text,
        mentions: [target]
      }, { quoted: msg });

    } catch (error) {
      await extra.reply(`*❌ ERROR*\n\n_${error.message}_`);
    }
  }
};
