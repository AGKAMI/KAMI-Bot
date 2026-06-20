const games = new Map();
module.exports = {
  name: 'numberguess',
  category: 'games',
  aliases: ['nguess', 'guess'],
  execute: async (sock, msg, args, ctx) => {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'start' || sub === 'new') {
      const target = Math.floor(Math.random() * 100) + 1;
      games.set(ctx.from, { target, attempts: 0 });
      return ctx.reply('🎯 New game!\nI picked a number between 1 and 100.\nUse .nguess <number>');
    }
    if (sub === 'stop' || sub === 'end') {
      games.delete(ctx.from);
      return ctx.reply('Game ended.');
    }
    const n = parseInt(args[0]);
    if (isNaN(n)) return ctx.reply('Usage: .nguess start | .nguess <1-100> | .nguess stop');
    const g = games.get(ctx.from);
    if (!g) return ctx.reply('No game running. Use .nguess start');
    g.attempts++;
    if (n === g.target) {
      games.delete(ctx.from);
      return ctx.reply('🎉 Correct! ' + n + ' in ' + g.attempts + ' tries.');
    }
    if (n < g.target) return ctx.reply('📈 Higher!');
    return ctx.reply('📉 Lower!');
  }
};
