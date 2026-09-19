/**
 * AFK Command - Set AFK status with list, history, and DM auto-reply
 */

const { bold, pick, SLANG } = require('../../utils/format');

const afkUsers = new Map();
const afkHistory = new Map();
const MAX_HISTORY = 5;

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
    usage: '.afk [reason] | .afk list',

    checkAfk,
    clearAfk,
    isAfkUser,
    afkUsers,

    async execute(sock, msg, args, extra) {
        try {
            const sender = extra.sender;
            const from = extra.from;

            if (args.length >= 1 && args[0].toLowerCase() === 'list') {
                const allAfk = Array.from(afkUsers.entries());

                if (allAfk.length === 0) {
                    return extra.reply(
                        `✅ *SUCCESS*\n\n` +
                        `💤 *AFK Users:* None\n\n` +
                        `_Nobody's AFK right now, ${pick(SLANG.vibe)}_`
                    );
                }

                const lines = [
                    `💤 *AFK USERS*`,
                    ``,
                    `_Total: ${allAfk.length}_`,
                    ``,
                ];

                const mentions = [];
                for (const [jid, data] of allAfk) {
                    if (data.from !== from) continue;
                    const tag = `@${jid.split('@')[0]}`;
                    mentions.push(jid);
                    const duration = formatDuration(Date.now() - data.since);
                    const reasonText = data.reason ? ` — ${data.reason}` : '';
                    lines.push(`${tag} — AFK for ${duration}${reasonText}`);
                }

                if (mentions.length === 0) {
                    return extra.reply(
                        `✅ *SUCCESS*\n\n` +
                        `💤 *AFK Users:* None in this group\n\n` +
                        `_Nobody's AFK here, ${pick(SLANG.vibe)}_`
                    );
                }

                lines.push(``, `_Use .afk to toggle your status_`);

                return sock.sendMessage(from, {
                    text: lines.join('\n'),
                    mentions
                }, { quoted: msg });
            }

            const existing = afkUsers.get(sender);
            if (existing) {
                const duration = formatDuration(Date.now() - existing.since);

                if (!afkHistory.has(sender)) {
                    afkHistory.set(sender, []);
                }
                const history = afkHistory.get(sender);
                history.unshift({
                    reason: existing.reason,
                    since: existing.since,
                    duration
                });
                if (history.length > MAX_HISTORY) {
                    history.pop();
                }

                afkUsers.delete(sender);

                const reasonText = existing.reason ? `\n📝 *Reason:* ${existing.reason}` : '';

                const historyLines = [];
                const hist = afkHistory.get(sender);
                if (hist.length > 0) {
                    historyLines.push(``, `📋 *Last ${hist.length} AFK session${hist.length > 1 ? 's' : ''}:`);
                    for (let i = 0; i < Math.min(hist.length, 3); i++) {
                        const h = hist[i];
                        const r = h.reason ? ` — ${h.reason}` : '';
                        historyLines.push(`• ${h.duration}${r}`);
                    }
                }

                return sock.sendMessage(from, {
                    text: [
                        `✅ *AFK CLEARED*`,
                        ``,
                        `👋 *Welcome back!*`,
                        `⏱️ *AFK for:* ${duration}`,
                        reasonText,
                        ...historyLines,
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
module.exports.clearAfk = clearAfk;
module.exports.isAfkUser = isAfkUser;
