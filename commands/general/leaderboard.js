/**
 * Leaderboard Command - Show who's most active in the group
 * Supports time periods: today, week, month, all-time
 */

const { bold, pick, SLANG, mention } = require('../../utils/format');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../database/groupStats.json');

function loadDB() {
    try {
        if (!fs.existsSync(DB_PATH)) return {};
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch {
        return {};
    }
}

function aggregateStats(groupId, period) {
    const db = loadDB();
    if (!db[groupId]) return null;

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const dates = Object.keys(db[groupId]);

    let filtered;
    if (period === 'today') {
        filtered = dates.filter(d => d === today);
    } else if (period === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const cutoff = weekAgo.toISOString().slice(0, 10);
        filtered = dates.filter(d => d >= cutoff);
    } else if (period === 'month') {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        const cutoff = monthAgo.toISOString().slice(0, 10);
        filtered = dates.filter(d => d >= cutoff);
    } else {
        filtered = dates;
    }

    if (filtered.length === 0) return null;

    const merged = { total: 0, users: {} };
    for (const date of filtered) {
        const day = db[groupId][date];
        merged.total += day.total || 0;
        for (const [uid, count] of Object.entries(day.users || {})) {
            merged.users[uid] = (merged.users[uid] || 0) + count;
        }
    }
    return merged;
}

module.exports = {
    name: 'leaderboard',
    reactions: { received: '🏆', done: '🥇' },
    aliases: ['lb', 'top', 'ranking'],
    category: 'general',
    description: 'Show the most active members in the group',
    usage: '.leaderboard [week|month|all|top <number>]',
    groupOnly: true,

    async execute(sock, msg, args, extra) {
        try {
            const from = extra.from;

            let period = 'today';
            let limit = 10;
            const joined = args.join(' ').toLowerCase();

            if (joined.includes('week')) period = 'week';
            else if (joined.includes('month')) period = 'month';
            else if (joined.includes('all')) period = 'all';

            if (args.length >= 2 && args[0].toLowerCase() === 'top') {
                const parsed = parseInt(args[1]);
                if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
                    limit = parsed;
                }
            }

            const stats = aggregateStats(from, period);
            if (!stats || Object.keys(stats.users).length === 0) {
                return extra.reply(`❌ *ERROR*\n\n💡 No message data yet for this period, ${pick(SLANG.vibe)}`);
            }

            const sorted = Object.entries(stats.users)
                .sort((a, b) => b[1] - a[1])
                .slice(0, limit);

            const medals = ['🥇', '🥈', '🥉'];
            const periodLabels = {
                today: 'Today',
                week: 'This Week',
                month: 'This Month',
                all: 'All Time'
            };

            const lines = [
                `🏆 *LEADERBOARD*`,
                ``,
                `📊 *Period:* ${periodLabels[period]}`,
                `💬 *Total Messages:* ${stats.total}`,
                `----------`,
            ];

            for (let i = 0; i < sorted.length; i++) {
                const [jid, count] = sorted[i];
                const medal = i < 3 ? medals[i] : `${i + 1}.`;
                const tag = mention(jid);
                lines.push(`${medal} ${tag} — *${count}* msgs`);
            }

            lines.push(`----------`);
            lines.push(`_Showing top ${sorted.length} of ${Object.keys(stats.users).length} — ${pick(SLANG.vibe)}_`);

            await sock.sendMessage(from, {
                text: lines.join('\n'),
                mentions: sorted.map(([jid]) => jid)
            }, { quoted: msg });

        } catch (error) {
            await extra.reply(`❌ *ERROR*\n\n💡 ${pick(SLANG.error)} — ${error.message}`);
        }
    }
};
