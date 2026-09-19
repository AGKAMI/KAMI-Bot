/**
 * Leaderboard Command - Show who's most active in the group
 */

const { bold, pick, SLANG } = require('../../utils/format');
const { getStats } = require('../../utils/groupstats');

module.exports = {
    name: 'leaderboard',
    aliases: ['lb', 'top', 'ranking'],
    category: 'general',
    description: 'Show the most active members in the group',
    usage: '.leaderboard [top <number>]',
    groupOnly: true,

    async execute(sock, msg, args, extra) {
        try {
            const from = extra.from;
            const stats = getStats(from);

            if (!stats || !stats.users || Object.keys(stats.users).length === 0) {
                return extra.reply(`❌ *ERROR*\n\n💡 No message data yet — let people chat first, ${pick(SLANG.vibe)}`);
            }

            let limit = 10;
            if (args.length >= 2 && args[0].toLowerCase() === 'top') {
                const parsed = parseInt(args[1]);
                if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
                    limit = parsed;
                }
            }

            const sorted = Object.entries(stats.users)
                .sort((a, b) => b[1] - a[1])
                .slice(0, limit);

            const medals = ['🥇', '🥈', '🥉'];

            const text = [
                `🏆 *LEADERBOARD*`,
                ``,
                `📊 *Group Activity — Today*`,
                `👥 *Total Messages:* ${stats.total}`,
                `----------`,
                ...sorted.map(([jid, count], i) => {
                    const medal = i < 3 ? medals[i] : `${i + 1}.`;
                    const tag = `@${jid.split('@')[0]}`;
                    return `${medal} ${tag} — *${count}* msgs`;
                }),
                `----------`,
                `_Showing top ${sorted.length} of ${Object.keys(stats.users).length} — ${pick(SLANG.vibe)}_`
            ].join('\n');

            await sock.sendMessage(from, {
                text,
                mentions: sorted.map(([jid]) => jid)
            }, { quoted: msg });

        } catch (error) {
            await extra.reply(`❌ *ERROR*\n\n💡 ${pick(SLANG.error)} — ${error.message}`);
        }
    }
};
