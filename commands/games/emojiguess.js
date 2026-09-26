const { bold, italic, pick, SLANG, mention } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');
const config = require('../../config');
const rounds = [
  { emojis: '🐱👻🍕', answer: 'cat ghost pizza' },
  { emojis: '🌞🎸🎸', answer: 'sun guitar guitar' },
  { emojis: '🦁👑', answer: 'lion king' },
  { emojis: '🍎💻', answer: 'apple computer' },
  { emojis: '🚀🌕', answer: 'rocket moon' },
  { emojis: '🐻🌲🍯', answer: 'bear forest honey' },
  { emojis: '🤖💡', answer: 'robot lightbulb' },
  { emojis: '🎸🎤', answer: 'guitar microphone' }
];
const active = new Map();

function startRound(sock, from, quoted) {
  const r = rounds[Math.floor(Math.random() * rounds.length)];
  active.set(from, { answer: r.answer, emojis: r.emojis });
  return sendButtons(sock, from, {
    text: `🎯 *GUESS THE PHRASE!*\n\n${r.emojis}\n\nUse ${config.prefix || '.'}emoji <answer>`,
    footer: 'Emoji Guess',
    buttons: [
      { id: 'emoji:next', text: '🔄 Next Round' },
    ],
  }, quoted);
}

module.exports = {
  name: 'emojiguess',
  description: 'Guess the phrase from emojis',
  category: 'games',
  aliases: ['emoji', 'eg'],
  execute: async (sock, msg, args, ctx) => {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'answer' || sub === 'skip') {
      const g = active.get(ctx.from);
      if (!g) return ctx.reply(`❌ _no active game, ${pick(SLANG.vibe)}_`);
      active.delete(ctx.from);
      return startRound(sock, ctx.from, msg);
    }
    if (sub === 'stop') {
      active.delete(ctx.from);
      return ctx.reply(`${pick(SLANG.vibe)}, emoji guess stopped!`);
    }
    const guess = args.join(' ').toLowerCase();
    const g = active.get(ctx.from);
    if (g && guess) {
      if (guess === g.answer) {
        const winner = mention(ctx.sender);
        active.delete(ctx.from);
        return sendButtons(sock, ctx.from, {
          text: `🎉 ${pick(SLANG.good)}, ${winner} guessed it! *${g.answer}*`,
          mentions: [ctx.sender],
          footer: 'Emoji Guess',
          buttons: [
            { id: 'emoji:next', text: '🔄 Next Round' },
          ],
        }, msg);
      }
      const hint = g.answer.split(' ').map(w => w[0] + '_'.repeat(w.length - 1)).join(' / ');
      return ctx.reply(`❌ ${pick(SLANG.error)}, wrong! hint: ${hint}`);
    }
    return startRound(sock, ctx.from, msg);
  }
};

// ── Next round button ────────────────────────────────────────
onButton('emoji:next', async (sock, msg, from) => {
  if (!from.endsWith('@g.us')) return;
  await startRound(sock, from, msg);
});
