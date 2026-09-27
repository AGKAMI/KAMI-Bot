const { bold, italic, pick, SLANG, mention, voice } = require('../../utils/format');
const games = new Map();
module.exports = {
  name: 'groupguess',
  reactions: { received: '👥', done: '🎯' },
  description: 'Group number guessing game — closest wins',
  category: 'games',
  aliases: ['gguess'],
  execute: async (sock, msg, args, ctx) => {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'start' || sub === 'new') {
      const target = Math.floor(Math.random() * 100) + 1;
      games.set(ctx.from, { target, attempts: 0 });
      return ctx.reply(`🎯 Group Number Guess!\nI picked 1-100.\nUse .gguess <number> to play. Closest wins!`);
    }
    if (sub === 'stop') {
      games.delete(ctx.from);
      return ctx.reply(`${voice.lead('neutral')}, group guess ended!`);
    }
    const n = parseInt(args[0]);
    if (isNaN(n)) { ctx.fail(); return ctx.reply(`❌ _${voice.openErr()} — usage: .gguess start | .gguess <number> | .gguess stop_`); }
    const g = games.get(ctx.from);
    if (!g) { ctx.fail(); return ctx.reply(`❌ _no active game — .gguess start_`); }
    if (n === g.target) {
      const winner = mention(ctx.sender);
      games.delete(ctx.from);
      return ctx.reply(`🎉 ${voice.lead('affirm')}, ${winner} got it! Number was ${g.target}. Attempts: ${g.attempts}`);
    }
    g.attempts++;
    if (n < g.target) return ctx.reply('📈 Higher!');
    return ctx.reply('📉 Lower!');
  }
};
