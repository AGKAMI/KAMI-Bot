module.exports = {
  name: 'coinflip',
  aliases: ['flip', 'coin'],
  category: 'games',
  execute: async (sock, msg, args, ctx) => {
    const side = Math.random() < 0.5 ? 'heads' : 'tails';
    await ctx.reply('🪙 Coin: ' + side);
  }
};
