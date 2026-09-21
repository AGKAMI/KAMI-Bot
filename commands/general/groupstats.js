// commands/admin/groupstats.js

const config = require('../../config');
const { getStats } = require('../../utils/groupstats');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
    name: 'groupstats',
    aliases: ['stats', 'leaderboard', 'gstats', 'topmembers', 'msgs', 'messagestats'],
    category: 'general',
    description: 'Show today\'s group chat statistics',
    usage: '.groupstats',
    groupOnly: true,

    async execute(sock, msg, args, extra) {
      const prefix = config.prefix || '.';
        try {
            const from = extra.from;
            const stats = getStats(from);

            if (!stats)
                return extra.reply(`⚠️ *WARNING*\n💡 Nothing happening today hey`);

            const { total, users } = stats;

            // top members
            const sortedUsers = Object.entries(users)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            let topText = sortedUsers.length
                ? sortedUsers.map(([id, count], i) => `${i + 1}) @${id.split('@')[0]} — ${count} msgs`).join('\n')
                : 'No active users yet.';

            const text = `
📊 *GROUP STATS — TODAY*

📌 *Total Messages:* ${total}

👥 *Top Active Members:*
${topText}

💡 _Type ${prefix}myactivity to see your stats._
`.trim();

            await sock.sendMessage(from, {
                text,
                mentions: sortedUsers.map(u => u[0])
            }, { quoted: msg });

        } catch (err) {
            console.error('[groupstats cmd] error:', err);
            extra.reply(`❌ *ERROR*\n💡 ${pick(SLANG.error)}, couldn't load stats`);
        }
    }
};
