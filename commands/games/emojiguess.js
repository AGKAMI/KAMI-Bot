const { bold, italic, pick, SLANG, mention } = require('../../utils/format');
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
      return ctx.reply(`Answer was: ${g.answer}`);
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
        return ctx.reply(`🎉 ${pick(SLANG.good)}, ${winner} guessed it! ${g.answer}`);
      }
      const hint = g.answer.split(' ').map(w => w[0] + '_'.repeat(w.length - 1)).join(' / ');
      return ctx.reply(`❌ ${pick(SLANG.error)}, wrong! hint: ${hint}`);
    }
    const r = rounds[Math.floor(Math.random() * rounds.length)];
    active.set(ctx.from, { answer: r.answer, emojis: r.emojis });
    return ctx.reply(`🎯 guess the phrase!\n\n${r.emojis}\n\nUse .emoji <answer>`);
  }
};
