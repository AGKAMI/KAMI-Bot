/**
 * Remind Command - Set reminders for the group with list and cancel support
 */

const config = require('../../config');
const { bold, pick, SLANG, mention } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

const activeReminders = new Map();
const MAX_REMINDERS = 5;
const firedReminders = new Map(); // reminderId → fired reminder data (1h TTL, for snooze)

module.exports = {
    name: 'remind',
    aliases: ['reminder', 'remindme'],
    category: 'general',
    description: 'Set a reminder, list active ones, or cancel a reminder',
    usage: '.remind <time><unit> <message> | .remind list | .remind cancel <number>',
    groupOnly: true,

    async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
        try {
            const from = extra.from;
            const sender = extra.sender;

            if (!activeReminders.has(from)) {
                activeReminders.set(from, []);
            }

            const groupReminders = activeReminders.get(from);

            if (args.length >= 1 && args[0].toLowerCase() === 'list') {
                if (groupReminders.length === 0) {
                    return extra.reply(
                        `✅ *SUCCESS*\n\n` +
                        `📋 *Active Reminders:* None\n\n` +
                        `_No reminders set for this group, ${pick(SLANG.vibe)}_`
                    );
                }

                const lines = [
                    `📋 *ACTIVE REMINDERS*`,
                    ``,
                    `_Total: ${groupReminders.length}/${MAX_REMINDERS}_`,
                    ``,
                ];

                for (let i = 0; i < groupReminders.length; i++) {
                    const r = groupReminders[i];
                    const senderTag = mention(r.sender);
                    lines.push(`*#${i + 1}* ${senderTag} — ${r.message}`);
                    lines.push(`⏰ Fires in ${r.timeLabel}`);
                }

                lines.push(``, `_To cancel: ${prefix}remind cancel <number>_`);

                const mentions = groupReminders.map(r => r.sender);

                return sock.sendMessage(from, {
                    text: lines.join('\n'),
                    mentions
                }, { quoted: msg });
            }

            if (args.length >= 2 && args[0].toLowerCase() === 'cancel') {
                const index = parseInt(args[1]) - 1;
                if (isNaN(index) || index < 0 || index >= groupReminders.length) {
                    return extra.reply(
                        `❌ *ERROR*\n\n` +
                        `💡 Invalid reminder number. Use *${prefix}remind list* to see active reminders, ${pick(SLANG.vibe)}`
                    );
                }

                const reminder = groupReminders[index];
                clearTimeout(reminder.timeout);
                groupReminders.splice(index, 1);

                return extra.reply(
                    `✅ *SUCCESS*\n\n` +
                    `🗑️ *Reminder #${index + 1} cancelled*\n` +
                    `📝 *Message:* ${reminder.message}\n\n` +
                    `_Done, ${pick(SLANG.vibe)} 🫡_`
                );
            }

            if (args.length < 2) {
                return extra.reply(
                    `❌ *ERROR*\n\n` +
                    `💡 *Usage:*\n` +
                    `• ${prefix}remind 10m Check the rules\n` +
                    `• ${prefix}remind 1h Meeting time\n` +
                    `• ${prefix}remind 30s Ping me\n` +
                    `• ${prefix}remind list\n` +
                    `• ${prefix}remind cancel <number>\n\n` +
                    `⏳ *Units:* s (seconds), m (minutes), h (hours), d (days)\n` +
                    `📋 *Max active reminders:* ${MAX_REMINDERS}`
                );
            }

            if (groupReminders.length >= MAX_REMINDERS) {
                return extra.reply(
                    `❌ *ERROR*\n\n` +
                    `📋 Max ${MAX_REMINDERS} active reminders per group.\n` +
                    `Use *${prefix}remind list* or *${prefix}remind cancel <number>*, ${pick(SLANG.vibe)}`
                );
            }

            const timeStr = args[0];
            const match = timeStr.match(/^(\d+)([smhd])$/i);

            if (!match) {
                return extra.reply(
                    `❌ *ERROR*\n\n` +
                    `💡 Invalid time format. Use:\n` +
                    `• *10m* = 10 minutes\n` +
                    `• *1h* = 1 hour\n` +
                    `• *30s* = 30 seconds\n` +
                    `• *2d* = 2 days`
                );
            }

            const amount = parseInt(match[1]);
            const unit = match[2].toLowerCase();

            const multipliers = {
                s: 1000,
                m: 60 * 1000,
                h: 60 * 60 * 1000,
                d: 24 * 60 * 60 * 1000
            };

            const unitNames = {
                s: 'second',
                m: 'minute',
                h: 'hour',
                d: 'day'
            };

            const ms = amount * multipliers[unit];
            const fullUnit = unitNames[unit] + (amount > 1 ? 's' : '');

            if (ms > 7 * 24 * 60 * 60 * 1000) {
                return extra.reply(`❌ *ERROR*\n\n💡 Max reminder is 7 days, ${pick(SLANG.vibe)}`);
            }

            const messageText = args.slice(1).join(' ');
            const reminderId = Date.now().toString(36);

            // Resolve who to remind: a mentioned user, or the command sender if no mention.
            const ctxM = msg.message?.extendedTextMessage?.contextInfo;
            const mentionedJids = ctxM?.mentionedJid || [];
            const targetJids = mentionedJids.length > 0 ? mentionedJids : [sender];
            const targetJid = targetJids[0];

            // Strip raw @jid tokens out of the message so it reads cleanly
            const cleanMessage = messageText
              .replace(/@\d+/g, '')
              .replace(/@lid/g, '')
              .replace(/\s+/g, ' ')
              .trim() || `Reminder for ${mention(targetJid)}`;

            const timeout = setTimeout(async () => {
                const idx = groupReminders.findIndex(r => r.id === reminderId);
                if (idx !== -1) groupReminders.splice(idx, 1);

                // Keep the fired reminder briefly so the snooze button can re-create it
                firedReminders.set(reminderId, {
                    message: cleanMessage,
                    targetJids,
                    groupId: from,
                    ms,
                    amount,
                    fullUnit,
                });
                setTimeout(() => firedReminders.delete(reminderId), 60 * 60 * 1000);

                try {
                    await sendButtons(sock, from, {
                        text: [
                            `⏰ *REMINDER TIME!*`,
                            ``,
                            `👤 *For:* ${targetJids.map(j => mention(j)).join(', ')}`,
                            `📝 *Message:* ${cleanMessage}`,
                            ``,
                            `_Set ${amount} ${fullUnit} ago — ${pick(SLANG.vibe)}_`
                        ].join('\n'),
                        mentions: targetJids,
                        footer: 'Reminder',
                        buttons: [
                            { id: `remind:again:${reminderId}`, text: '⏰ Remind Again' },
                            { id: `remind:done:${reminderId}`, text: '✅ Done' },
                        ],
                    });
                } catch (e) {
                    console.error('[Remind] Failed to send reminder:', e.message);
                }
            }, ms);

            groupReminders.push({
                id: reminderId,
                sender: targetJid,
                message: cleanMessage,
                timeLabel: `${amount} ${fullUnit}`,
                timeout
            });

            await sock.sendMessage(from, {
                text:
                  `✅ *SUCCESS*\n\n` +
                  `⏰ *Reminder Set*\n` +
                  `👤 *Who:* ${targetJids.map(j => mention(j)).join(', ')}\n` +
                  `⏳ *When:* ${amount} ${fullUnit} from now\n` +
                  `📝 *Message:* ${cleanMessage}\n\n` +
                  `_I'll ping ${targetJids.length > 1 ? 'them' : 'you'}, ${pick(SLANG.vibe)} 🫡_`,
                mentions: targetJids
              }, { quoted: msg });

        } catch (error) {
            await extra.reply(`❌ *ERROR*\n\n💡 ${pick(SLANG.error)} — ${error.message}`);
        }
    }
};

// ── Snooze / Done buttons — only the reminder's target or the owner ──
onButton('remind:again:', async (sock, msg, from, sender, btnId) => {
  const reminderId = btnId.replace('remind:again:', '');
  const fired = firedReminders.get(reminderId);
  if (!fired || fired.groupId !== from) return;

  const senderNum = sender.split(':')[0].split('@')[0].replace(/\D/g, '');
  const isTarget = fired.targetJids.some(j => String(j).split(':')[0].split('@')[0].replace(/\D/g, '') === senderNum);
  const isOwnerBtn = (config.ownerNumber || []).some(n => n.replace(/\D/g, '') === senderNum);
  if (!isTarget && !isOwnerBtn) return;

  firedReminders.delete(reminderId);
  const newId = Date.now().toString(36);

  const timeout = setTimeout(async () => {
    try {
      await sendButtons(sock, from, {
        text: [
            `⏰ *REMINDER TIME!*`,
            ``,
            `👤 *For:* ${fired.targetJids.map(j => mention(j)).join(', ')}`,
            `📝 *Message:* ${fired.message}`,
            ``,
            `_Snoozed ${fired.amount} ${fired.fullUnit} — ${pick(SLANG.vibe)}_`
        ].join('\n'),
        mentions: fired.targetJids,
        footer: 'Reminder',
        buttons: [
            { id: `remind:again:${newId}`, text: '⏰ Remind Again' },
            { id: `remind:done:${newId}`, text: '✅ Done' },
        ],
      });
    } catch (e) {
      console.error('[Remind] snooze fire failed:', e.message);
    }
    firedReminders.delete(newId);
    setTimeout(() => firedReminders.delete(newId), 60 * 60 * 1000);
  }, fired.ms);

  firedReminders.set(newId, {
    message: fired.message,
    targetJids: fired.targetJids,
    groupId: from,
    ms: fired.ms,
    amount: fired.amount,
    fullUnit: fired.fullUnit,
    timeout,
  });
  setTimeout(() => firedReminders.delete(newId), Math.max(fired.ms, 60000) + 60 * 60 * 1000);

  await sock.sendMessage(from, {
    text: `⏰ *SNOOZED*\n\n${mention(sender)} re-set the reminder for ${fired.amount} ${fired.fullUnit} from now`,
    mentions: [sender],
  }, { quoted: msg });
});

onButton('remind:done:', async (sock, msg, from, sender, btnId) => {
  const reminderId = btnId.replace('remind:done:', '');
  const fired = firedReminders.get(reminderId);
  if (!fired || fired.groupId !== from) return;

  const senderNum = sender.split(':')[0].split('@')[0].replace(/\D/g, '');
  const isTarget = fired.targetJids.some(j => String(j).split(':')[0].split('@')[0].replace(/\D/g, '') === senderNum);
  const isOwnerBtn = (config.ownerNumber || []).some(n => n.replace(/\D/g, '') === senderNum);
  if (!isTarget && !isOwnerBtn) return;

  firedReminders.delete(reminderId);
  await sock.sendMessage(from, {
    text: `✅ *SORTED*\n\n${mention(sender)} marked it done`,
    mentions: [sender],
  }, { quoted: msg });
});
