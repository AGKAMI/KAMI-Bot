const games = new Map();
module.exports = {
  name: 'groupguess',
  category: 'games',
  aliases: ['gguess'],
  execute: async (sock, msg, args, ctx) => {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'start' || sub === 'new') {
      const target = Math.floor(Math.random() * 100) + 1;
      games.set(ctx.from, { target, attempts: 0 });
      return ctx.reply('🎯 Group Number Guess!\nI picked 1-100.\nUse .gguess <number> to play. Closest wins!');
    }
    if (sub === 'stop') {
      games.delete(ctx.from);
      return ctx.reply('group guess ended');
    }
    const n = parseInt(args[0]);
    if (isNaN(n)) return ctx.reply('Usage: .gguess start | .gguess <number> | .gguess stop');
    const g = games.get(ctx.from);
    if (!g) return ctx.reply('no active game — .gguess start');
    if (n === g.target) {
      const winner = ctx.sender.split('@')[0];
      games.delete(ctx.from);
      return ctx.reply('🎉 ' + winner + ' got it! Number was ' + g.target + '. Attempts: ' + g.attempts);
    }
    g.attempts++;
    if (n < g.target) return ctx.reply('📈 Higher!');
    return ctx.reply('📉 Lower!');
  }
};
