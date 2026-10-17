/**
 * Remind Command - Set reminders for the group with list and cancel support
 * Backed by utils/reminderStore — pending reminders survive restarts
 * (database/reminders.json); index.js re-schedules them on boot and
 * overdue ones fire immediately.
 */

const config = require('../../config');
const { bold, pick, SLANG, mention, voice } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');
const store = require('../../utils/reminderStore');

const MAX_REMINDERS = 5;
const SNOOZE_TTL = 60 * 60 * 1000; // snooze button valid 1h after firing
const firedReminders = new Map(); // reminderId → fired reminder data (in-memory only — snooze is ephemeral)

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const fireReminder = async (sock, r, meta = {}) => {
    firedReminders.set(r.id, {
        message: r.message,
        targetJids: r.targetJids,
        groupId: r.chatJid,
        ms: r.ms,
        amount: r.amount,
        fullUnit: r.fullUnit,
    });
    setTimeout(() => firedReminders.delete(r.id), SNOOZE_TTL);

    const lateNote = meta.late ? `\n⚠️ _I was down when this was due — sending late_` : '';
    try {
        await sendButtons(sock, r.chatJid, {
            text: [
                `⏰ *REMINDER TIME!*`,
                ``,
                `👤 *For:* ${r.targetJids.map(j => mention(j)).join(', ')}`,
                `📝 *Message:* ${r.message}`,
                ``,
                `_Set ${r.amount} ${r.fullUnit} ago — ${voice.tag('neutral')}_${lateNote}`
            ].join('\n'),
            mentions: r.targetJids,
            footer: 'Reminder',
            buttons: [
                { id: `remind:again:${r.id}`, text: '⏰ Remind Again' },
                { id: `remind:done:${r.id}`, text: '✅ Done' },
            ],
        });
    } catch (e) {
        console.error('[Remind] Failed to send reminder:', e.message);
    }
};

// Route store fires through our message builder (registered at module load,
// which happens at boot via commandLoader — before index.js restore)
store.setFireHandler(fireReminder);

// Re-arm the snooze timer through the store so a snoozed reminder also
// survives a restart mid-snooze
const scheduleSnooze = (sock, id, fired) => {
    store.add(sock, {
        id,
        chatJid: fired.groupId,
        sender: fired.targetJids[0],
        targetJids: fired.targetJids,
        message: fired.message,
        dueAt: Date.now() + fired.ms,
        ms: fired.ms,
        amount: fired.amount,
        fullUnit: fired.fullUnit,
        snoozed: true,
    });
};

module.exports = {
    name: 'remind',
    reactions: { received: '⏰', done: '🔔' },
    aliases: ['reminder', 'remindme'],
    category: 'general',
    description: 'Set a reminder, list them, or cancel one',
    usage: '.remind <time><unit> <message> | .remind list | .remind cancel <number>',
    groupOnly: true,

    async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
        try {
            const from = extra.from;
            const sender = extra.sender;

            const groupReminders = store.listForGroup(from);

            if (args.length >= 1 && args[0].toLowerCase() === 'list') {
                if (groupReminders.length === 0) {
                    return extra.reply(
                        `✅ *SUCCESS*\n\n` +
                        `📋 *Active Reminders:* None\n\n` +
                        `_No reminders set for this group, ${voice.tag('err')}_`
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
                    const minsLeft = Math.max(1, Math.round((r.dueAt - Date.now()) / 60000));
                    lines.push(`*#${i + 1}* ${senderTag} — ${r.message}`);
                    lines.push(`⏰ Fires in ~${minsLeft}m (${r.msLabel || r.amount + ' ' + r.fullUnit})`);
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
                    extra.fail();
                    return extra.reply(
                        `❌ *ERROR*\n\n` +
                        `💡 No good: reminder number. Use *${prefix}remind list* to see active reminders`
                    );
                }

                const reminder = groupReminders[index];
                store.cancel(reminder.id);

                return extra.reply(
                    `✅ *SUCCESS*\n\n` +
                    `🗑️ *Reminder #${index + 1} cancelled*\n` +
                    `📝 *Message:* ${reminder.message}\n\n` +
                    `_Done, ${voice.tag('neutral')} 🫡_`
                );
            }

            if (args.length < 2) {
                extra.fail();
                return extra.reply(
                    `❌ *ERROR*\n\n` +
                    `💡 *Usage:*\n` +
                    `• ${prefix}remind 10m Check the rules\n` +
                    `• ${prefix}remind 1h Meeting time\n` +
                    `• ${prefix}remind 30s Ping me\n` +
                    `• ${prefix}remind list\n` +
                    `• ${prefix}remind cancel <number>\n\n` +
                    `⏳ *Units:* s (seconds), m (minutes), h (hours), d (days)\n` +
                    `📋 *Max active reminders:* ${MAX_REMINDERS}\n` +
                    `💾 _Reminders survive bot restarts_`
                );
            }

            if (groupReminders.length >= MAX_REMINDERS) {
                extra.fail();
                return extra.reply(
                    `❌ *ERROR*\n\n` +
                    `📋 Max ${MAX_REMINDERS} active reminders per group, hey.\n` +
                    `Use *${prefix}remind list* or *${prefix}remind cancel <number>*`
                );
            }

            const timeStr = args[0];
            const match = timeStr.match(/^(\d+)([smhd])$/i);

            if (!match) {
                extra.fail();
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
                extra.fail();
                return extra.reply(`❌ *ERROR*\n\n💡 Furthest reminder is 7 days`);
            }

            const messageText = args.slice(1).join(' ');
            const reminderId = newId();

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

            store.add(sock, {
                id: reminderId,
                chatJid: from,
                sender: targetJid,
                targetJids,
                message: cleanMessage,
                dueAt: Date.now() + ms,
                ms,
                amount,
                fullUnit,
            });

            await sock.sendMessage(from, {
                text:
                  `✅ *SUCCESS*\n\n` +
                  `⏰ *Reminder Set*\n` +
                  `👤 *Who:* ${targetJids.map(j => mention(j)).join(', ')}\n` +
                  `⏳ *When:* ${amount} ${fullUnit} from now\n` +
                  `📝 *Message:* ${cleanMessage}\n\n` +
                  `_I'll ping ${targetJids.length > 1 ? 'them' : 'you'}, ${voice.tag('neutral')} 🫡_`,
                mentions: targetJids
              }, { quoted: msg });

        } catch (error) {
            extra.fail();
            await extra.reply(`❌ *ERROR*\n\n💡 ${voice.openErr()} — ${error.message}`);
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
  const snoozeId = newId();
  scheduleSnooze(sock, snoozeId, fired);

  await sock.sendMessage(from, {
    text: `⏰ *SNOOZED*\n\n${mention(sender)} pushed the reminder to ${fired.amount} ${fired.fullUnit} from now`,
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
