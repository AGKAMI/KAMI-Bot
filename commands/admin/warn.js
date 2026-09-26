/**
 * Warn Command - Warn a user
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG, mention } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

module.exports = {
  name: 'warn',
  reactions: { received: '⚠️', done: '🛑' },
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
        return extra.reply(
          `❌ ERROR\n\n` +
          `Tag, reply, or add a number\n\n` +
          `Usage:\n` +
          `• ${prefix}warn @user breaking rules\n` +
          `• Reply with ${prefix}warn <reason>`
        );
      }

      // ── Check if target is in the group ──────────────────
      const meta = await sock.groupMetadata(extra.from).catch(() => null);
      if (meta && meta.participants) {
        const isInGroup = meta.participants.some(
          p => p.id === target || p.lid === target
        );
        if (!isInGroup) {
          return extra.reply(
            `❌ ERROR\n\n` +
            `${mention(target)} is not in this group`
          );
        }
      }

      const reason = args.slice(mentioned.length > 0 ? 1 : 0).join(' ') || 'No reason specified';

      // Cannot warn admins
      const foundParticipant = extra.groupMetadata.participants.find(
        p => (p.id === target || p.lid === target) && (p.admin === 'admin' || p.admin === 'superadmin')
      );

      if (foundParticipant) {
        return extra.reply(
          `🚫 ERROR\n\n` +
          `Can't warn an admin`
        );
      }

      const warnings = database.addWarning(extra.from, target, reason, extra.sender);
      const remaining = config.maxWarnings - warnings.count;

      let text =
        `⚠️ WARNING ${warnings.count}/${config.maxWarnings}\n\n` +
        `👤 ${mention(target)}\n` +
        `📝 *Reason:* ${reason}\n`;

      if (warnings.count >= config.maxWarnings) {
        text += `❌ *MAX WARNINGS HIT*\n\n`;
        text += `${mention(target)} is being removed from the group`;

        await sock.sendMessage(extra.from, {
          text,
          mentions: [target]
        }, { quoted: msg });

        if (extra.isBotAdmin) {
          try {
            // Mark as bot-initiated so handler.js skips member protection (prevents re-add loop)
            const handler = require('../../handler');
            handler._botKicked.add(target);
            setTimeout(() => handler._botKicked.delete(target), 5000);

            await sock.groupParticipantsUpdate(extra.from, [target], 'remove');
            await sock.sendMessage(extra.from, {
              text:
                `✅ SUCCESS\n\n` +
                `🔨 KICKED\n\n` +
                `${mention(target)} has been removed for exceeding max warnings\n\n` +
                `_${pick(SLANG.vibe)}_`,
              mentions: [target]
            });
          } catch (e) {
            await extra.reply(
              `❌ ERROR\n\n` +
              `Couldn't remove the user — check if I'm admin`
            );
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
      console.error('[WARN] Error:', error);
      await extra.reply(
        `❌ ERROR\n\n` +
        `Couldn't warn — ${error.message || 'Unknown error'}`
      );
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
      text:
        `✅ SUCCESS\n\n` +
        `↩️ WARNING REMOVED\n\n` +
        `${mention(target)} has been cleared of their last warning\n\n` +
        `_${pick(SLANG.vibe)}_`,
      mentions: [target],
    });
  } catch (e) {
    console.error('[UNDOWARN] Error:', e.message);
    await sock.sendMessage(from, {
      text:
        `❌ ERROR\n\n` +
        `Couldn't remove warning — ${e.message || 'Unknown error'}`,
    });
  }
});

onButton('admin:kick', async (sock, msg, from, sender, btnId) => {
  const target = btnId.replace('admin:kick:', '');
  if (!target) return;

  // Check if target is still in the group
  try {
    const meta = await sock.groupMetadata(from).catch(() => null);
    if (meta && meta.participants) {
      const isInGroup = meta.participants.some(
        p => p.id === target || p.lid === target
      );
      if (!isInGroup) {
        return await sock.sendMessage(from, {
          text:
            `❌ ERROR\n\n` +
            `${mention(target)} is not in this group`,
          mentions: [target],
        });
      }
    }

    // Mark as bot-initiated so handler.js skips member protection (prevents re-add loop)
    const handler = require('../../handler');
    handler._botKicked.add(target);
    setTimeout(() => handler._botKicked.delete(target), 5000);

    await sock.groupParticipantsUpdate(from, [target], 'remove');
    await sock.sendMessage(from, {
      text:
        `✅ SUCCESS\n\n` +
        `🔨 KICKED\n\n` +
        `${mention(target)} has been removed from the group\n\n` +
        `_${pick(SLANG.vibe)}_`,
      mentions: [target],
    });
    const database = require('../../database');
    database.clearWarnings(from, target);
  } catch (e) {
    console.error('[KICK BTN] Error:', e.message);
    await sock.sendMessage(from, {
      text:
        `❌ ERROR\n\n` +
        `Couldn't kick — ${e.message || 'Unknown error'}`,
    });
  }
});
