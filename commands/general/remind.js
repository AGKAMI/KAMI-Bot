/**
 * Remind Command - Set a reminder for the group
 */

const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
    name: 'remind',
    aliases: ['reminder', 'remindme'],
    category: 'general',
    description: 'Set a reminder for yourself or the group',
    usage: '.remind <time><unit> <message> — e.g. .remind 10m Check the rules',
    groupOnly: true,

    async execute(sock, msg, args, extra) {
        try {
            const from = extra.from;
            const sender = extra.sender;

            if (args.length < 2) {
                return extra.reply(
                    `❌ *ERROR*\n\n` +
                    `💡 *Usage:* .remind <time><unit> <message>\n` +
                    `📝 *Examples:*\n` +
                    `• .remind 10m Check the rules\n` +
                    `• .remind 1h Meeting time\n` +
                    `• .remind 30s Ping me\n\n` +
                    `⏳ *Units:* s (seconds), m (minutes), h (hours), d (days)`
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

            await extra.reply(
                `✅ *REMINDER SET*\n\n` +
                `👤 *Who:* @${sender.split('@')[0]}\n` +
                `⏰ *When:* ${amount} ${fullUnit} from now\n` +
                `📝 *Message:* ${messageText}\n\n` +
                `_I'll ping you, ${pick(SLANG.vibe)} 🫡_`
            );

            setTimeout(async () => {
                try {
                    await sock.sendMessage(from, {
                        text: [
                            `⏰ *REMINDER TIME!*`,
                            ``,
                            `👤 *For:* @${sender.split('@')[0]}`,
                            `📝 *Message:* ${messageText}`,
                            ``,
                            `_Set ${amount} ${fullUnit} ago — ${pick(SLANG.vibe)}_`
                        ].join('\n'),
                        mentions: [sender]
                    });
                } catch (e) {
                    console.error('[Remind] Failed to send reminder:', e.message);
                }
            }, ms);

        } catch (error) {
            await extra.reply(`❌ *ERROR*\n\n💡 ${pick(SLANG.error)} — ${error.message}`);
        }
    }
};
