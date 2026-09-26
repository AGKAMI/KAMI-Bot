/**
 * Poll Command — button-based voting with live results.
 * Usage: .poll Question | opt1 | opt2 | ...   (up to 8 options)
 *   .poll                    → show this group's active poll(s)
 *   .poll Pizza night? | Yes | No | Maybe
 * One vote per person (revote replaces). Polls auto-expire after 24h.
 */

const config = require('../../config');
const { pick, SLANG, mention } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

const POLL_TTL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_OPTIONS = 8; // buttons limit is 10, keep room for the End button

const polls = new Map(); // pollId → { question, options, votes(Map jid→idx), groupId, creator, createdAt, timeout }

setInterval(() => {
  const now = Date.now();
  for (const [id, poll] of polls) {
    if (now - poll.createdAt > POLL_TTL) {
      clearTimeout(poll.timeout);
      polls.delete(id);
    }
  }
}, 60 * 60 * 1000);

function formatResults(poll) {
  const votes = poll.votes;
  const total = votes.size;
  const counts = poll.options.map(() => 0);
  for (const idx of votes.values()) {
    if (counts[idx] !== undefined) counts[idx]++;
  }

  const lines = poll.options.map((opt, i) => {
    const pct = total > 0 ? Math.round((counts[i] / total) * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 10)) || '░';
    return `${bar} ${opt} — ${counts[i]} vote${counts[i] === 1 ? '' : 's'} (${pct}%)`;
  });

  return `${poll.question}\n\n${lines.join('\n')}\n\n👥 ${total} vote${total === 1 ? '' : 's'} cast`;
}

module.exports = {
  name: 'poll',
  aliases: ['vote', 'survey'],
  category: 'general',
  description: 'Create a button-based poll with live results',
  usage: '.poll <question> | <option1> | <option2> ...',
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    const prefix = config.prefix || '.';
    try {
      const from = extra.from;

      // No args → show active poll(s) in this group
      if (!args || args.length === 0) {
        const active = [...polls.values()].filter(p => p.groupId === from);
        if (active.length === 0) {
          return extra.reply(
            `📊 *POLLS*\n\nNo active polls in this group\n\n` +
            `Create one:\n\`${prefix}poll Pizza night? | Yes | No | Maybe\``
          );
        }

        for (const poll of active) {
          await sendButtons(sock, from, {
            text: formatResults(poll),
            footer: `Poll by ${poll.creator.split('@')[0]} — vote below`,
            buttons: [
              ...poll.options.map((opt, i) => ({ id: `poll:vote:${poll.id}:${i}`, text: `🗳️ ${opt}` })),
              { id: `poll:results:${poll.id}`, text: '📊 Results' },
              { id: `poll:end:${poll.id}`, text: '🏁 End Poll' },
            ],
          }, msg);
        }
        return;
      }

      // Parse: everything before the first | is the question, the rest are options
      const raw = args.join(' ');
      const parts = raw.split('|').map(s => s.trim()).filter(Boolean);
      if (parts.length < 3) {
        return extra.reply(
          `❌ ERROR\n\nNeed a question and at least 2 options\n\n` +
          `Usage:\n\`${prefix}poll Pizza night? | Yes | No | Maybe\``
        );
      }

      const question = parts[0];
      const options = parts.slice(1, MAX_OPTIONS + 1);
      if (parts.length - 1 > MAX_OPTIONS) {
        return extra.reply(`❌ ERROR\n\nMax ${MAX_OPTIONS} options`);
      }

      const pollId = Date.now().toString(36);
      const timeout = setTimeout(() => {
        const poll = polls.get(pollId);
        if (!poll) return;
        polls.delete(pollId);
        sock.sendMessage(poll.groupId, {
          text: `🏁 *POLL ENDED* (24h)\n\n${formatResults(poll)}\n\n_${pick(SLANG.vibe)}_`,
          mentions: [...poll.votes.keys()],
        }).catch(() => {});
      }, POLL_TTL);

      polls.set(pollId, {
        question,
        options,
        votes: new Map(),
        groupId: from,
        creator: extra.sender,
        createdAt: Date.now(),
        timeout,
      });

      await sendButtons(sock, from, {
        text:
          `📊 *NEW POLL*\n\n` +
          `${question}\n\n` +
          `Tap to vote 👇\n` +
          `_Results: ${prefix}poll — one vote per person, revote to change_`,
        footer: `Poll by ${mention(extra.sender)}`,
        mentions: [extra.sender],
        buttons: [
          ...options.map((opt, i) => ({ id: `poll:vote:${pollId}:${i}`, text: `🗳️ ${opt}` })),
          { id: `poll:results:${pollId}`, text: '📊 Results' },
          { id: `poll:end:${pollId}`, text: '🏁 End Poll' },
        ],
      }, { quoted: msg });

    } catch (error) {
      console.error('Poll error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — ${error.message}`);
    }
  },
};

// ── Button handlers ──────────────────────────────────────────

// Vote: poll:vote:<pollId>:<idx>
onButton('poll:vote:', async (sock, msg, from, sender, btnId) => {
  const parts = btnId.replace('poll:vote:', '').split(':');
  const pollId = parts[0];
  const idx = parseInt(parts[1]);

  const poll = polls.get(pollId);
  if (!poll || poll.groupId !== from) return;
  if (isNaN(idx) || idx < 0 || idx >= poll.options.length) return;

  const revote = poll.votes.has(sender);
  poll.votes.set(sender, idx);

  await sock.sendMessage(from, {
    text: revote
      ? `🔄 ${mention(sender)} changed their vote to *${poll.options[idx]}*`
      : `🗳️ ${mention(sender)} voted — tap ${config.prefix || '.'}poll for results`,
    mentions: [sender],
  }, { quoted: msg });
});

// Results: poll:results:<pollId>
onButton('poll:results:', async (sock, msg, from, sender, btnId) => {
  const pollId = btnId.replace('poll:results:', '');
  const poll = polls.get(pollId);
  if (!poll || poll.groupId !== from) return;

  await sock.sendMessage(from, {
    text: formatResults(poll),
  }, { quoted: msg });
});

// End: poll:end:<pollId> — creator or owner only
onButton('poll:end:', async (sock, msg, from, sender, btnId) => {
  const pollId = btnId.replace('poll:end:', '');
  const poll = polls.get(pollId);
  if (!poll || poll.groupId !== from) return;

  const senderNum = sender.split(':')[0].split('@')[0].replace(/\D/g, '');
  const creatorNum = poll.creator.split(':')[0].split('@')[0].replace(/\D/g, '');
  const isOwnerBtn = (config.ownerNumber || []).some(n => n.replace(/\D/g, '') === senderNum);
  if (senderNum !== creatorNum && !isOwnerBtn) {
    return await sock.sendMessage(from, {
      text: `🚫 *POLL CREATOR ONLY*\n\nOnly ${mention(poll.creator)} or the owner can end this poll`,
      mentions: [poll.creator],
    });
  }

  clearTimeout(poll.timeout);
  polls.delete(pollId);

  await sock.sendMessage(from, {
    text: `🏁 *POLL ENDED*\n\n${formatResults(poll)}\n\n_${pick(SLANG.vibe)}_`,
    mentions: [...poll.votes.keys()],
  });
});
