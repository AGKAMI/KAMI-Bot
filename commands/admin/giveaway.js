/**
 * Giveaway Command - Run a giveaway with media, custom time, multiple winners
 *
 * Usage:
 *   .giveaway <prize> | <time> | <winners>n | min <number>
 *   .giveaway <prize> <winners> <time>
 *   .giveaway reroll
 *
 * Time formats: 30s, 5m, 1h, 1h30m, 90m
 * Attach media: reply to an image/video with .giveaway <prize>
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { pick, SLANG } = require('../../utils/format');

const activeGiveaways = new Map();
const lastGiveaway = new Map();

// ── Parse time string → milliseconds ────────────────────────
function parseTime(str) {
  if (!str) return null;
  str = str.trim().toLowerCase();

  let totalMs = 0;
  const hMatch = str.match(/(\d+)h/);
  const mMatch = str.match(/(\d+)m/);
  const sMatch = str.match(/(\d+)s/);

  if (hMatch) totalMs += parseInt(hMatch[1]) * 60 * 60 * 1000;
  if (mMatch) totalMs += parseInt(mMatch[1]) * 60 * 1000;
  if (sMatch) totalMs += parseInt(sMatch[1]) * 1000;

  // Plain number = minutes (backwards compat)
  if (totalMs === 0 && /^\d+$/.test(str)) {
    totalMs = parseInt(str) * 60 * 1000;
  }

  return totalMs > 0 ? totalMs : null;
}

// ── Format ms → human readable ──────────────────────────────
function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0) parts.push(`${s}s`);
  return parts.join('') || '0m';
}

module.exports = {
  name: 'giveaway',
  aliases: ['gw', 'give'],
  category: 'admin',
  description: 'Run a giveaway — react with 🎁 to enter. Reply to media to use as visual.',
  usage: '.giveaway <prize> | <time> | <winners>n | min <number>\n.giveaway reroll',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const from = extra.from;
      const fullArgs = args.join(' ');

      // ── Reroll ──────────────────────────────────────────
      if (args.length >= 1 && args[0].toLowerCase() === 'reroll') {
        const last = lastGiveaway.get(from);
        if (!last || last.winners.length === 0) {
          return extra.reply(`❌ *ERROR*\n\nNo previous giveaway to reroll, ${pick(SLANG.vibe)}`);
        }
        if (last.entries.length === 0) {
          return extra.reply(`❌ *ERROR*\n\nPrevious giveaway had no entries, ${pick(SLANG.vibe)}`);
        }

        const shuffled = [...last.entries].sort(() => Math.random() - 0.5);
        const rerollWinners = shuffled.slice(0, last.winners.length);
        const winnerMentions = rerollWinners.map(w => `@${w.split('@')[0]}`).join('\n');

        const rerollMsg = {
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
          mentions: rerollWinners,
        };

        // Attach media if the original giveaway had it
        if (last.mediaBuffer) {
          rerollMsg.image = last.mediaBuffer;
          delete rerollMsg.text;
          rerollMsg.caption = [
            `🎁 *REROLL RESULTS!*`,
            ``,
            `🏆 *Prize:* ${last.prize}`,
            `👥 *Entries:* ${last.entries.length}`,
            ``,
            `🎉 *NEW WINNER${rerollWinners.length > 1 ? 'S' : ''}:*`,
            winnerMentions,
            ``,
            `_Congratulations, ${pick(SLANG.good)}! 🥳_`
          ].join('\n');
          rerollMsg.mentions = rerollWinners;
        }

        await sock.sendMessage(from, rerollMsg);
        return;
      }

      // ── Check for active giveaway ───────────────────────
      if (activeGiveaways.has(from)) {
        return extra.reply(`❌ *ERROR*\n\nA giveaway is already running`);
      }

      if (!fullArgs.trim()) {
        return extra.reply(
          `❌ *ERROR*\n\n` +
          `💡 *Usage:*\n` +
          `• \`.giveaway <prize> <time> winners <n>\`\n` +
          `• Reply to an image/video + \`.giveaway <prize>\`\n\n` +
          `⏱️ *Time:* 30s, 5m, 1h, 1h30m\n` +
          `🎯 *Winners:* winners 3 (default: 1)\n` +
          `📋 *Min entries:* min 5\n\n` +
          `*Examples:*\n` +
          `• \`.giveaway ADT Jeep SRT 1h winners 1\`\n` +
          `• \`.giveaway Airtime R50 30m winners 2\`\n` +
          `• \`.giveaway Voucher 45m winners 1 min 10\`\n` +
          `• Reply to photo + \`.giveaway iPhone 1h winners 3\``
        );
      }

      // ── Parse arguments ─────────────────────────────────
      // Supports both pipe and space formats:
      //   .giveaway prize | 1h | winners 3 | min 5
      //   .giveaway prize 1h winners 3 min 5
      //   .giveaway ADT Jeep SRT 1h winners 1
      let rawParts;
      if (fullArgs.includes('|')) {
        rawParts = fullArgs.split('|').map(p => p.trim()).filter(Boolean);
      } else {
        // Split into tokens, then group: time tokens, keyword tokens, prize tokens
        rawParts = [fullArgs];
      }

      let prize = fullArgs;
      let durationMs = 5 * 60 * 1000; // default 5 min
      let numWinners = 1;
      let minEntries = 0;

      // Extract known keywords from the full string
      const cleaned = fullArgs;

      // Extract winners: "winners 3", "winner 3", "3n"
      let winMatch = cleaned.match(/(?:winners?|win)\s+(\d+)/i);
      if (winMatch) {
        numWinners = parseInt(winMatch[1]);
      } else {
        // Fallback: "3n" format
        winMatch = cleaned.match(/(\d+)n\b/i);
        if (winMatch) numWinners = parseInt(winMatch[1]);
      }

      // Extract min entries: "min 5"
      const minMatch = cleaned.match(/\bmin\s+(\d+)/i);
      if (minMatch) {
        minEntries = parseInt(minMatch[1]);
      }

      // Extract time: first token matching time pattern (h/m/s), not preceded by "min"
      const timeTokens = cleaned.match(/\b(\d+[hms](?:\d+[hms])*)\b/gi);
      if (timeTokens && timeTokens.length > 0) {
        // Take the first valid time token
        for (const t of timeTokens) {
          const val = parseTime(t);
          if (val) {
            durationMs = val;
            break;
          }
        }
      } else {
        // Fallback: plain number at end = minutes
        const plainNum = cleaned.match(/\b(\d+)\s*$/);
        if (plainNum && !cleaned.match(/(?:winners?|win)\s+\d+$/i)) {
          durationMs = parseInt(plainNum[1]) * 60 * 1000;
        }
      }

      // Prize = everything minus extracted keywords
      prize = fullArgs
        .replace(/\|/g, '')
        .replace(/(?:winners?|win)\s+\d+/gi, '')
        .replace(/\d+n\b/gi, '')
        .replace(/\bmin\s+\d+/gi, '')
        .replace(/\b\d+[hms](?:\d+[hms])*\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim() || fullArgs;

      // ── Validate ────────────────────────────────────────
      if (durationMs < 1000 || durationMs > 3 * 60 * 60 * 1000) {
        return extra.reply(`❌ *ERROR*\n\nDuration must be 1 second to 3 hours, ${pick(SLANG.vibe)}`);
      }
      if (numWinners < 1 || numWinners > 20) {
        return extra.reply(`❌ *ERROR*\n\nWinners must be 1-20, ${pick(SLANG.vibe)}`);
      }

      // ── Download media if replying to one ───────────────
      let mediaBuffer = null;
      let mediaType = null;
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;

      if (quoted) {
        if (quoted.imageMessage) {
          mediaType = 'image';
        } else if (quoted.videoMessage) {
          mediaType = 'video';
        }

        if (mediaType) {
          try {
            mediaBuffer = await downloadMediaMessage(
              { message: quoted, key: msg.key },
              'buffer',
              {}
            );
          } catch (e) {
            console.error('[GIVEAWAY] Media download failed:', e.message);
          }
        }
      }

      // ── Build announcement ──────────────────────────────
      const endTime = Date.now() + durationMs;

      const caption = [
        `🎁 *GIVEAWAY TIME!*`,
        ``,
        `🏆 *Prize:* ${prize}`,
        `⏱️ *Duration:* ${formatDuration(durationMs)}`,
        `📅 *Ends:* ${new Date(endTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`,
        `🎯 *Winners:* ${numWinners}`,
      ];

      if (minEntries > 0) {
        caption.push(`📋 *Min Entries:* ${minEntries}`);
      }

      caption.push(``, `✋ *React with 🎁 to enter!*`, `_Hurry, this one's closing soon — ${pick(SLANG.vibe)}_`);

      let sent;
      if (mediaBuffer) {
        const mediaMsg = {
          caption: caption.join('\n'),
        };
        if (mediaType === 'image') {
          mediaMsg.image = mediaBuffer;
        } else if (mediaType === 'video') {
          mediaMsg.video = mediaBuffer;
        }
        sent = await sock.sendMessage(from, mediaMsg, { quoted: msg });
      } else {
        sent = await sock.sendMessage(from, { text: caption.join('\n') }, { quoted: msg });
      }

      await sock.sendMessage(from, { react: { text: '🎁', key: sent.key } });

      // ── Entry tracking ──────────────────────────────────
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
        } catch (e) {}
      };

      sock.ev.on('messages.upsert', messageListener);

      activeGiveaways.set(from, {
        entries, endTime, prize, numWinners, minEntries,
        listener: messageListener, mediaBuffer,
      });

      // ── Timer ───────────────────────────────────────────
      setTimeout(async () => {
        sock.ev.off('messages.upsert', messageListener);
        activeGiveaways.delete(from);

        const entryList = Array.from(entries);

        if (entryList.length === 0) {
          lastGiveaway.set(from, { winners: [], entries: [], prize, mediaBuffer });
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

        // Min entries check — extend once
        if (minEntries > 0 && entryList.length < minEntries) {
          const extraMs = 2 * 60 * 1000;
          const newEndTime = Date.now() + extraMs;
          // Remove old listener, add fresh one
          sock.ev.off('messages.upsert', messageListener);
          const newListener = messageListener; // same function ref is fine after off
          sock.ev.on('messages.upsert', newListener);

          activeGiveaways.set(from, {
            entries, endTime: newEndTime, prize, numWinners, minEntries,
            listener: newListener, mediaBuffer,
          });

          setTimeout(() => {
            // Second timeout — force end regardless
            sock.ev.off('messages.upsert', newListener);
            activeGiveaways.delete(from);
            pickAndAnnounceWinners(from, entries, prize, numWinners, mediaBuffer, sock);
          }, extraMs);

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

        pickAndAnnounceWinners(from, entries, prize, numWinners, mediaBuffer, sock);

      }, durationMs);

    } catch (error) {
      activeGiveaways.delete(extra.from);
      await extra.reply(`❌ *ERROR*\n\n${pick(SLANG.error)} — ${error.message}`);
    }
  },
};

// ── Pick winners and announce ──────────────────────────────
async function pickAndAnnounceWinners(from, entries, prize, numWinners, mediaBuffer, sock) {
  const entryList = Array.from(entries);

  if (entryList.length === 0) {
    lastGiveaway.set(from, { winners: [], entries: [], prize, mediaBuffer });
    await sock.sendMessage(from, {
      text: [
        `🎁 *GIVEAWAY ENDED*`,
        ``,
        `❌ *No entries!*`,
        `🏆 *Prize:* ${prize}`,
        ``,
        `Nobody entered hey — better luck next time 💀`
      ].join('\n')
    });
    return;
  }

  const shuffled = [...entryList].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, numWinners);
  const winnerMentions = winners.map(w => `@${w.split('@')[0]}`).join('\n');

  lastGiveaway.set(from, { winners, entries: entryList, prize, mediaBuffer });

  const resultText = [
    `🎁 *GIVEAWAY ENDED!*`,
    ``,
    `🏆 *Prize:* ${prize}`,
    `👥 *Total Entries:* ${entryList.length}`,
    ``,
    `🎉 *WINNER${winners.length > 1 ? 'S' : ''}:*`,
    winnerMentions,
    ``,
    `_Congratulations, ${pick(SLANG.good)}! 🥳_`
  ].join('\n');

  if (mediaBuffer) {
    await sock.sendMessage(from, {
      image: mediaBuffer,
      caption: resultText,
      mentions: winners,
    });
  } else {
    await sock.sendMessage(from, { text: resultText, mentions: winners });
  }
}
