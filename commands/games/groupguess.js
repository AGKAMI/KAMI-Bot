const { bold, italic, pick, SLANG } = require('../../utils/format');
const games = new Map();
module.exports = {
  name: 'groupguess',
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
      return ctx.reply(`${pick(SLANG.vibe)}, group guess ended!`);
    }
    const n = parseInt(args[0]);
    if (isNaN(n)) return ctx.reply(`❌ _${pick(SLANG.error)} — usage: .gguess start | .gguess <number> | .gguess stop_`);
    const g = games.get(ctx.from);
    if (!g) return ctx.reply(`❌ _no active game — .gguess start_`);
    if (n === g.target) {
      const winner = ctx.sender.split('@')[0];
      games.delete(ctx.from);
      return ctx.reply(`🎉 ${pick(SLANG.good)}, ${winner} got it! Number was ${g.target}. Attempts: ${g.attempts}`);
    }
    g.attempts++;
    if (n < g.target) return ctx.reply('📈 Higher!');
    return ctx.reply('📉 Lower!');
  }
};
