/**
 * Giveaway Command - Run a giveaway in the group
 */

const { bold, pick, SLANG } = require('../../utils/format');

const activeGiveaways = new Map();

module.exports = {
    name: 'giveaway',
    aliases: ['gw', 'give'],
    category: 'admin',
    description: 'Run a giveaway — members react with 🎁 to enter',
    usage: '.giveaway <prize> | <duration>m',
    groupOnly: true,
    adminOnly: true,

    async execute(sock, msg, args, extra) {
        try {
            const from = extra.from;

            if (activeGiveaways.has(from)) {
                return extra.reply(`❌ *ERROR*\n\n💡 A giveaway is already running in this group, ${pick(SLANG.friend)}`);
            }

            const fullArgs = args.join(' ');
            if (!fullArgs.trim()) {
                return extra.reply(`❌ *ERROR*\n\n💡 Usage: *.giveaway <prize> | <duration>m*\n📝 Example: *.giveaway iPhone 15 | 5m*`);
            }

            let prize = fullArgs;
            let durationMinutes = 5;

            if (fullArgs.includes('|')) {
                const parts = fullArgs.split('|').map(p => p.trim());
                prize = parts[0];
                const timeStr = parts[1] || '';
                const match = timeStr.match(/^(\d+)m$/i);
                if (match) {
                    durationMinutes = parseInt(match[1]);
                }
            } else {
                const timeMatch = fullArgs.match(/\s+(\d+)m$/i);
                if (timeMatch) {
                    prize = fullArgs.replace(/\s+\d+m$/i, '').trim();
                    durationMinutes = parseInt(timeMatch[1]);
                }
            }

            if (durationMinutes < 1 || durationMinutes > 60) {
                return extra.reply(`❌ *ERROR*\n\n💡 Duration must be between 1 and 60 minutes, ${pick(SLANG.vibe)}`);
            }

            const endTime = Date.now() + (durationMinutes * 60 * 1000);

            const announcement = [
                `🎁 *GIVEAWAY TIME!*`,
                ``,
                `🏆 *Prize:* ${prize}`,
                `⏱️ *Duration:* ${durationMinutes} minute${durationMinutes > 1 ? 's' : ''}`,
                `📅 *Ends:* ${new Date(endTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`,
                ``,
                `✋ *React with 🎁 to enter!*`,
                `_Hurry, this one's closing soon — ${pick(SLANG.vibe)}_`
            ].join('\n');

            const sent = await sock.sendMessage(from, { text: announcement }, { quoted: msg });

            await sock.sendMessage(from, {
                react: { text: '🎁', key: sent.key }
            });

            const entries = new Set();

            const messageListener = async (update) => {
                try {
                    if (!update.messages) return;
                    const m = update.messages[0];
                    if (!m || !m.message) return;
                    if (m.key.remoteJid !== from) return;
                    if (m.key.id === sent.key.id) return;

                    const reactionMsg = m.message.reactionMessage;
                    if (reactionMsg && reactionMsg.key.id === sent.key.id) {
                        const reactor = m.key.participant || m.key.remoteJid;
                        if (reactionMsg.text === '🎁') {
                            entries.add(reactor);
                        } else {
                            entries.delete(reactor);
                        }
                    }
                } catch (e) {
                    // Ignore listener errors
                }
            };

            sock.ev.on('messages.upsert', messageListener);

            activeGiveaways.set(from, { entries, endTime, prize, listener: messageListener });

            setTimeout(async () => {
                sock.ev.off('messages.upsert', messageListener);
                activeGiveaways.delete(from);

                if (entries.size === 0) {
                    await sock.sendMessage(from, {
                        text: [
                            `🎁 *GIVEAWAY ENDED*`,
                            ``,
                            `❌ *No entries!*`,
                            `🏆 *Prize:* ${prize}`,
                            ``,
                            `Nobody entered hey — better luck next time, ${pick(SLANG.vibe)} 💀`
                        ].join('\n')
                    });
                    return;
                }

                const entryList = Array.from(entries);
                const winner = entryList[Math.floor(Math.random() * entryList.length)];

                await sock.sendMessage(from, {
                    text: [
                        `🎁 *GIVEAWAY ENDED!*`,
                        ``,
                        `🏆 *Prize:* ${prize}`,
                        `👥 *Total Entries:* ${entryList.length}`,
                        ``,
                        `🎉 *WINNER:* @${winner.split('@')[0]}`,
                        ``,
                        `_Congratulations, ${pick(SLANG.good)}! 🥳_`
                    ].join('\n'),
                    mentions: [winner]
                });

            }, durationMinutes * 60 * 1000);

        } catch (error) {
            activeGiveaways.delete(extra.from);
            await extra.reply(`❌ *ERROR*\n\n💡 ${pick(SLANG.error)} — ${error.message}`);
        }
    }
};
