/**
 * Warnings Command — Visual warning tracker with auto-kick
 * Shows progress bar, per-warning details, danger zone alert
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG, mention } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

module.exports = {
  name: 'warnings',
  aliases: ['warns', 'checkwarn'],
  category: 'admin',
  description: 'Check a user\'s warning count with progress bar',
  usage: '.warnings @user',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
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
          `❌ ERROR\n\n` +
          `Tag or reply to someone\n\n` +
          `Usage:\n` +
          `• ${prefix}warnings @user`
        );
      }

      const warnings = database.getWarnings(extra.from, target);
      const max = config.maxWarnings;
      const count = warnings.count;
      const remaining = max - count;

      if (count === 0) {
        return sock.sendMessage(extra.from, {
          text: `✅ *CLEAN RECORD*\n\n` +
                `👤 ${mention(target)}\n` +
                `📊 *Warnings:* 0/${max}\n` +
                `🟩🟩🟩🟩🟩\n\n` +
                `_${pick(SLANG.good)}, they clean hey!_`,
          mentions: [target]
        }, { quoted: msg });
      }

      // Build progress bar: 🟩 for each warning, 🟥 if max hit, ⬜ for remaining
      const progressFull = '🟩'.repeat(Math.min(count, max - 1));
      const progressRed = count >= max ? '🟥' : '';
      const progressEmpty = '⬜'.repeat(Math.max(max - count - (count >= max ? 0 : 1), 0));
      const progressBar = progressFull + progressRed + progressEmpty;

      let text = `⚠️ *WARNINGS*\n\n`;
      text += `👤 ${mention(target)}\n`;
      text += `📊 *Count:* ${count}/${max}\n`;
      text += `${progressBar}\n`;
      text += `💀 *Remaining:* ${remaining} ${remaining === 1 ? 'strike' : 'strikes'}\n`;
      text += `----------\n`;

      // List each warning with details
      warnings.warnings.forEach((w, i) => {
        const date = new Date(w.date).toLocaleDateString('en-ZA', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
        const time = new Date(w.date).toLocaleTimeString('en-ZA', {
          hour: '2-digit',
          minute: '2-digit'
        });
        const warnedBy = w.warnedBy ? ` by ${mention(w.warnedBy)}` : '';
        text += `⚠️ *#${i + 1}* — ${w.reason}\n`;
        text += `   📅 ${date} at ${time}${warnedBy}\n`;
      });

      text += `----------\n`;

      // Danger zone when 1 strike remains
      if (remaining === 1) {
        text += `\n🚨 *DANGER ZONE*\n`;
        text += `_One more strike and they OUT!_\n`;
        text += `_Auto-kick is armed and ready 💀_\n`;
      } else if (remaining <= 0) {
        text += `\n🔴 *MAX WARNINGS HIT*\n`;
        text += `_This person should be removed ${pick(SLANG.vibe)}_\n`;
      } else {
        text += `\n_${remaining} more and they're gone_\n`;
      }

      await sendButtons(sock, extra.from, {
        text,
        mentions: [target],
        footer: 'Warning Management',
        buttons: [
          { id: `admin:clearwarnings:${target.split(':')[0]}`, text: '🗑️ Clear All' },
        ],
      }, { quoted: msg });

    } catch (error) {
      await extra.reply(`❌ *ERROR*\n\n_${error.message}_`);
    }
  }
};

// Button handlers
onButton('admin:clearwarnings', async (sock, msg, from, sender, btnId) => {
  const target = btnId.replace('admin:clearwarnings:', '');
  if (!target) return;
  try {
    database.clearWarnings(from, target);
    await sock.sendMessage(from, {
      text:
        `✅ SUCCESS\n\n` +
        `🗑️ WARNINGS CLEARED\n\n` +
        `${mention(target)} has been cleared of all warnings\n\n` +
        `_${pick(SLANG.vibe)}_`,
      mentions: [target],
    });
  } catch (e) {
    console.error('[CLEAR WARNINGS BTN] Error:', e.message);
    await sock.sendMessage(from, {
      text:
        `❌ ERROR\n\n` +
        `Couldn't clear warnings — ${e.message || 'Unknown error'}`,
    });
  }
});
