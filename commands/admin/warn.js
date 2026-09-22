/**
 * Warn Command - Warn a user
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG, mention } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

module.exports = {
  name: 'warn',
  aliases: ['warning'],
  category: 'admin',
  description: 'Warn a user',
  usage: '.warn @user <reason>',
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
        return extra.reply(`*⚠️ WARN*\n\n_Tag, reply, or add a number_\n\n_Example: ${prefix}warn @user breaking rules_`);
      }

      const reason = args.slice(mentioned.length > 0 ? 1 : 0).join(' ') || 'No reason specified';

      // Cannot warn admins
      const foundParticipant = extra.groupMetadata.participants.find(
        p => (p.id === target || p.lid === target) && (p.admin === 'admin' || p.admin === 'superadmin')
      );

      if (foundParticipant) {
        return extra.reply(`*🚫 CAN'T WARN AN ADMIN*\n\n_Nice try though_`);
      }

      const warnings = database.addWarning(extra.from, target, reason, extra.sender);
      const remaining = config.maxWarnings - warnings.count;

      let text = `⚠️ *WARNING ${warnings.count}/${config.maxWarnings}*\n\n`;
      text += `👤 ${mention(target)}\n`;
      text += `📝 *Reason:* ${reason}\n`;

      if (warnings.count >= config.maxWarnings) {
        text += `❌ *MAX WARNINGS HIT*\n\n`;
        text += `${mention(target)} _is being removed from the group_${pick(SLANG.vibe)}`;

        await sock.sendMessage(extra.from, {
          text,
          mentions: [target]
        }, { quoted: msg });

        if (extra.isBotAdmin) {
          try {
            await sock.groupParticipantsUpdate(extra.from, [target], 'remove');
            await sock.sendMessage(extra.from, {
              text: `*🔨 KICKED*\n\n${mention(target)} _has been removed for exceeding max warnings_`,
              mentions: [target]
            });
          } catch (e) {
            await extra.reply(`*❌ KICK FAILED*\n\n_Couldn't remove the user — check if I'm admin_`);
          }
          database.clearWarnings(extra.from, target);
        }
      } else {
        text += `⚠️ *${remaining} more ${remaining === 1 ? 'strike' : 'strikes'} and you're out*`;

        await sendButtons(sock, extra.from, {
          text,
          footer: `${remaining} strikes left`,
          mentions: [target],
          buttons: [
            { id: `admin:undowarn:${target.split(':')[0]}`, text: '↩️ Undo Warning' },
            { id: `admin:kick:${target.split(':')[0]}`, text: '🔨 Kick Now' },
          ],
        }, { quoted: msg });
      }

    } catch (error) {
      await extra.reply(`*❌ ERROR*\n\n_${error.message}_`);
    }
  }
};

// Button handlers
onButton('admin:undowarn', async (sock, msg, from, sender, btnId) => {
  const target = btnId.replace('admin:undowarn:', '');
  if (!target) return;
  try {
    const database = require('../../database');
    database.removeWarning(from, target);
    await sock.sendMessage(from, {
      text: `✅ *WARNING REMOVED*\n\n${mention(target)} _has been cleared of their last warning_`,
      mentions: [target],
    });
  } catch (e) {
    console.error('[UNDOWARN] Error:', e.message);
    await sock.sendMessage(from, { text: `❌ *UNDO FAILED*\n\n${e.message || "Couldn't remove warning"}` });
  }
});

onButton('admin:kick', async (sock, msg, from, sender, btnId) => {
  const target = btnId.replace('admin:kick:', '');
  if (!target) return;
  try {
    await sock.groupParticipantsUpdate(from, [target], 'remove');
    await sock.sendMessage(from, {
      text: `*🔨 KICKED*\n\n${mention(target)} _has been removed from the group_`,
      mentions: [target],
    });
    const database = require('../../database');
    database.clearWarnings(from, target);
  } catch (e) {
    console.error('[KICK BTN] Error:', e.message);
    await sock.sendMessage(from, { text: `❌ *KICK FAILED*\n\n${e.message || "Couldn't kick user"}` });
  }
});
