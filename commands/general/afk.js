/**
 * AFK Command - Set AFK status
 */

const { bold, italic, pick, SLANG } = require('../../utils/format');

const afkUsers = new Map();

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
}

function checkAfk(jid) {
    return afkUsers.get(jid) || null;
}

function clearAfk(jid) {
    afkUsers.delete(jid);
}

function isAfkUser(jid) {
    return afkUsers.has(jid);
}

module.exports = {
    name: 'afk',
    aliases: ['away', 'brb'],
    category: 'general',
    description: 'Set your AFK status — auto-replies when someone mentions you',
    usage: '.afk [reason]',

    checkAfk,
    clearAfk,
    isAfkUser,

    async execute(sock, msg, args, extra) {
        try {
            const sender = extra.sender;
            const from = extra.from;

            const existing = afkUsers.get(sender);
            if (existing) {
                const duration = formatDuration(Date.now() - existing.since);
                afkUsers.delete(sender);

                const reasonText = existing.reason ? `\n📝 *Reason:* ${existing.reason}` : '';

                return sock.sendMessage(from, {
                    text: [
                        `✅ *AFK CLEARED*`,
                        ``,
                        `👋 *Welcome back!*`,
                        `⏱️ *AFK for:* ${duration}`,
                        reasonText,
                        ``,
                        `_Good to have you back, ${pick(SLANG.vibe)} 💀_`
                    ].filter(Boolean).join('\n'),
                    mentions: [sender]
                }, { quoted: msg });
            }

            const reason = args.join(' ') || '';

            afkUsers.set(sender, {
                reason,
                since: Date.now(),
                from
            });

            const reasonLine = reason ? `\n📝 *Reason:* ${reason}` : '';

            await sock.sendMessage(from, {
                text: [
                    `💤 *AFK MODE ON*`,
                    ``,
                    `👤 *User:* @${sender.split('@')[0]}`,
                    reasonLine,
                    ``,
                    `_I'll let them know you're away, ${pick(SLANG.vibe)} 🫡_`
                ].filter(Boolean).join('\n'),
                mentions: [sender]
            }, { quoted: msg });

        } catch (error) {
            await extra.reply(`❌ *ERROR*\n\n💡 ${pick(SLANG.error)} — ${error.message}`);
        }
    }
};

module.exports.afkUsers = afkUsers;
module.exports.checkAfk = checkAfk;
module.exports.isAfkUser = isAfkUser;
