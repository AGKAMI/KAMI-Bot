module.exports = {
  name: 'dice',
  category: 'games',
  aliases: ['roll'],
  category: 'games',
  execute: async (sock, msg, args, ctx) => {
    const sides = parseInt(args[0]) || 6;
    if (sides < 2) return ctx.reply('Min sides: 2');
    if (sides > 1000) return ctx.reply('Max sides: 1000');
    const result = Math.floor(Math.random() * sides) + 1;
    await ctx.reply('🎲 You rolled a ' + result + ' (d' + sides + ')');
  }
};
