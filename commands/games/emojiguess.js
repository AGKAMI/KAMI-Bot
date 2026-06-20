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
  category: 'games',
  aliases: ['emoji', 'eg'],
  execute: async (sock, msg, args, ctx) => {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'answer' || sub === 'skip') {
      const g = active.get(ctx.from);
      if (!g) return ctx.reply('No active game.');
      active.delete(ctx.from);
      return ctx.reply('Answer was: ' + g.answer);
    }
    if (sub === 'stop') {
      active.delete(ctx.from);
      return ctx.reply('Emoji guess stopped.');
    }
    const guess = args.join(' ').toLowerCase();
    const g = active.get(ctx.from);
    if (g && guess) {
      if (guess === g.answer || guess.includes(g.answer.split(' ')[0])) {
        const winner = ctx.sender.split('@')[0];
        active.delete(ctx.from);
        return ctx.reply('🎉 ' + winner + ' guessed it! ' + g.answer);
      }
      return ctx.reply('❌ Wrong! Hint: ' + g.answer.split(' ').join(' / '));
    }
    const r = rounds[Math.floor(Math.random() * rounds.length)];
    active.set(ctx.from, { answer: r.answer, emojis: r.emojis });
    return ctx.reply('🎯 Guess the phrase!\n\n' + r.emojis + '\n\nUse .emoji <answer>');
  }
};
