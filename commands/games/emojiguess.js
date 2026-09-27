const { bold, italic, pick, SLANG, mention, voice } = require('../../utils/format');
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
  reactions: { received: '🧩', done: '😀' },
  description: 'Guess the phrase from the emojis',
  category: 'games',
  aliases: ['emoji', 'eg'],
  execute: async (sock, msg, args, ctx) => {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'answer' || sub === 'skip') {
      const g = active.get(ctx.from);
      if (!g) { ctx.fail(); return ctx.reply(`❌ _no active game, ${voice.tag('err')}_`); }
      active.delete(ctx.from);
      return startRound(sock, ctx.from, msg);
    }
    if (sub === 'stop') {
      active.delete(ctx.from);
      return ctx.reply(`${voice.lead('neutral')}, emoji guess stopped!`);
    }
    const guess = args.join(' ').toLowerCase();
    const g = active.get(ctx.from);
    if (g && guess) {
      if (guess === g.answer) {
        const winner = mention(ctx.sender);
        active.delete(ctx.from);
        return sendButtons(sock, ctx.from, {
          text: `🎉 ${voice.lead('affirm')}, ${winner} guessed it! *${g.answer}*`,
          mentions: [ctx.sender],
          footer: 'Emoji Guess',
          buttons: [
            { id: 'emoji:next', text: '🔄 Next Round' },
          ],
        }, msg);
      }
      const hint = g.answer.split(' ').map(w => w[0] + '_'.repeat(w.length - 1)).join(' / ');
      ctx.fail();
      return ctx.reply(`❌ ${voice.openErr()}, wrong! hint: ${hint}`);
    }
    return startRound(sock, ctx.from, msg);
  }
};

// ── Next round button ────────────────────────────────────────
onButton('emoji:next', async (sock, msg, from) => {
  if (!from.endsWith('@g.us')) return;
  await startRound(sock, from, msg);
});
