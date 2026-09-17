const { bold, italic, pick, SLANG } = require('../../utils/format');
const games = new Map();
module.exports = {
  name: 'numberguess',
  description: 'Guess a number between 1-100',
  category: 'games',
  aliases: ['nguess', 'guess'],
  execute: async (sock, msg, args, ctx) => {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'start' || sub === 'new') {
      const target = Math.floor(Math.random() * 100) + 1;
      games.set(ctx.from, { target, attempts: 0 });
      return ctx.reply(`🎯 New game!\nI picked a number between 1 and 100.\nUse .nguess <number>`);
    }
    if (sub === 'stop' || sub === 'end') {
      games.delete(ctx.from);
      return ctx.reply(`${pick(SLANG.vibe)}, game ended!`);
    }
    const n = parseInt(args[0]);
    if (isNaN(n)) return ctx.reply(`❌ _${pick(SLANG.error)} — usage: .nguess start | .nguess <1-100> | .nguess stop_`);
    const g = games.get(ctx.from);
    if (!g) return ctx.reply(`❌ _no game running — .nguess start_`);
    g.attempts++;
    if (n === g.target) {
      games.delete(ctx.from);
      return ctx.reply(`🎉 ${pick(SLANG.good)}, correct! ${n} in ${g.attempts} tries.`);
    }
    if (n < g.target) return ctx.reply('📈 Higher!');
    return ctx.reply('📉 Lower!');
  }
};
