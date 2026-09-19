/**
 * Giveaway Command - Run a giveaway with multiple winners and min entries
 */

const { bold, pick, SLANG } = require('../../utils/format');

const activeGiveaways = new Map();
const lastGiveaway = new Map();

module.exports = {
    name: 'giveaway',
    aliases: ['gw', 'give'],
    category: 'admin',
    description: 'Run a giveaway — members react with 🎁 to enter',
    usage: '.giveaway <prize> | <duration>m | <winners>n | min <number>\n.giveaway reroll',
    groupOnly: true,
    adminOnly: true,

    async execute(sock, msg, args, extra) {
        try {
            const from = extra.from;
            const fullArgs = args.join(' ');

            if (args.length >= 1 && args[0].toLowerCase() === 'reroll') {
                const last = lastGiveaway.get(from);
                if (!last || last.winners.length === 0) {
                    return extra.reply(`❌ *ERROR*\n\n💡 No previous giveaway to reroll, ${pick(SLANG.vibe)}`);
                }

                if (last.entries.length === 0) {
                    return extra.reply(`❌ *ERROR*\n\n💡 Previous giveaway had no entries, ${pick(SLANG.vibe)}`);
                }

                const shuffled = [...last.entries].sort(() => Math.random() - 0.5);
                const rerollWinners = shuffled.slice(0, last.winners.length);

                const winnerMentions = rerollWinners.map(w => `@${w.split('@')[0]}`).join('\n');

                await sock.sendMessage(from, {
                    text: [
                        `🎁 *REROLL RESULTS!*`,
                        ``,
                        `🏆 *Prize:* ${last.prize}`,
                        `👥 *Entries:* ${last.entries.length}`,
                        ``,
                        `🎉 *NEW WINNER${rerollWinners.length > 1 ? 'S' : ''}:*`,
                        winnerMentions,
                        ``,
                        `_Congratulations, ${pick(SLANG.good)}! 🥳_`
                    ].join('\n'),
                    mentions: rerollWinners
                });
                return;
            }

            if (activeGiveaways.has(from)) {
                return extra.reply(`❌ *ERROR*\n\n💡 A giveaway is already running, ${pick(SLANG.friend)}`);
            }

            if (!fullArgs.trim()) {
                return extra.reply(
                    `❌ *ERROR*\n\n` +
                    `💡 *Usage:*\n` +
                    `• .giveaway <prize> <winners> <duration>\n` +
                    `• .giveaway Flag Cab 1 30\n` +
                    `• .giveaway <prize> | <duration>m | <winners>n\n` +
                    `• .giveaway <prize> | <duration>m | min <number>\n` +
                    `• .giveaway reroll`
                );
            }

            let prize = fullArgs;
            let durationMinutes = 5;
            let numWinners = 1;
            let minEntries = 0;

            if (fullArgs.includes('|')) {
                const parts = fullArgs.split('|').map(p => p.trim());
                prize = parts[0];

                if (parts[1]) {
                    const timeMatch = parts[1].match(/^(\d+)m$/i);
                    if (timeMatch) {
                        durationMinutes = parseInt(timeMatch[1]);
                    }
                }

                for (let i = 2; i < parts.length; i++) {
                    const winMatch = parts[i].match(/^(\d+)n$/i);
                    if (winMatch) {
                        numWinners = parseInt(winMatch[1]);
                    }
                    const minMatch = parts[i].match(/^min\s+(\d+)$/i);
                    if (minMatch) {
                        minEntries = parseInt(minMatch[1]);
                    }
                }
            } else {
                // Positional form: .giveaway <prize> <winners> <duration>
                // Trailing numeric tokens = winners + minutes; prize = the rest.
                const tokens = fullArgs.split(/\s+/);
                const trailingNums = [];
                let i = tokens.length - 1;
                while (i >= 0 && /^\d+$/.test(tokens[i])) {
                    trailingNums.unshift(tokens.pop());
                    i--;
                }
                // trailingNums now holds numeric tokens from the end (in order).
                // Last = duration minutes, second-last = winner count.
                if (trailingNums.length >= 2) {
                    numWinners = parseInt(trailingNums[trailingNums.length - 2]);
                    durationMinutes = parseInt(trailingNums[trailingNums.length - 1]);
                } else if (trailingNums.length === 1) {
                    durationMinutes = parseInt(trailingNums[0]);
                }
                prize = tokens.join(' ').trim() || fullArgs;
            }

            if (durationMinutes < 1 || durationMinutes > 60) {
                return extra.reply(`❌ *ERROR*\n\n💡 Duration must be 1-60 minutes, ${pick(SLANG.vibe)}`);
            }
            if (numWinners < 1 || numWinners > 20) {
                return extra.reply(`❌ *ERROR*\n\n💡 Winners must be 1-20, ${pick(SLANG.vibe)}`);
            }

            const endTime = Date.now() + (durationMinutes * 60 * 1000);

            const lines = [
                `🎁 *GIVEAWAY TIME!*`,
                ``,
                `🏆 *Prize:* ${prize}`,
                `⏱️ *Duration:* ${durationMinutes} minute${durationMinutes > 1 ? 's' : ''}`,
                `📅 *Ends:* ${new Date(endTime).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' })}`,
                `🎯 *Winners:* ${numWinners}`,
            ];

            if (minEntries > 0) {
                lines.push(`📋 *Min Entries:* ${minEntries}`);
            }

            lines.push(``, `✋ *React with 🎁 to enter!*`, `_Hurry, this one's closing soon — ${pick(SLANG.vibe)}_`);

            const sent = await sock.sendMessage(from, { text: lines.join('\n') }, { quoted: msg });

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

            activeGiveaways.set(from, { entries, endTime, prize, numWinners, minEntries, listener: messageListener });

            setTimeout(async () => {
                sock.ev.off('messages.upsert', messageListener);
                activeGiveaways.delete(from);

                const entryList = Array.from(entries);

                if (entryList.length === 0) {
                    lastGiveaway.set(from, { winners: [], entries: [], prize });
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

                if (minEntries > 0 && entryList.length < minEntries) {
                    const extraTime = 2;
                    const newEndTime = Date.now() + (extraTime * 60 * 1000);
                    activeGiveaways.set(from, { entries, endTime: newEndTime, prize, numWinners, minEntries, listener: messageListener });
                    sock.ev.on('messages.upsert', messageListener);

                    activeGiveaways.set(from, { entries, endTime: newEndTime, prize, numWinners, minEntries, listener: messageListener });

                    await sock.sendMessage(from, {
                        text: [
                            `🎁 *NOT ENOUGH ENTRIES!*`,
                            ``,
                            `📋 *Required:* ${minEntries}`,
                            `👥 *Current:* ${entryList.length}`,
                            `⏰ *Extended:* 2 more minutes`,
                            ``,
                            `React with 🎁 to join — ${pick(SLANG.vibe)}!`
                        ].join('\n')
                    });
                    return;
                }

                const shuffled = [...entryList].sort(() => Math.random() - 0.5);
                const winners = shuffled.slice(0, numWinners);
                const winnerMentions = winners.map(w => `@${w.split('@')[0]}`).join('\n');

                lastGiveaway.set(from, { winners, entries: entryList, prize });

                await sock.sendMessage(from, {
                    text: [
                        `🎁 *GIVEAWAY ENDED!*`,
                        ``,
                        `🏆 *Prize:* ${prize}`,
                        `👥 *Total Entries:* ${entryList.length}`,
                        ``,
                        `🎉 *WINNER${winners.length > 1 ? 'S' : ''}:*`,
                        winnerMentions,
                        ``,
                        `_Congratulations, ${pick(SLANG.good)}! 🥳_`
                    ].join('\n'),
                    mentions: winners
                });

            }, durationMinutes * 60 * 1000);

        } catch (error) {
            activeGiveaways.delete(extra.from);
            await extra.reply(`❌ *ERROR*\n\n💡 ${pick(SLANG.error)} — ${error.message}`);
        }
    }
};
