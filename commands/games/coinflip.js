const { bold, italic, pick, SLANG } = require('../../utils/format');
module.exports = {
  name: 'coinflip',
  reactions: { received: '🪙', done: '📈' },
  description: 'Flip a coin — heads or tails',
  aliases: ['flip', 'coin'],
  category: 'games',
  execute: async (sock, msg, args, ctx) => {
    const side = Math.random() < 0.5 ? 'heads' : 'tails';
    await ctx.reply('🪙 Coin: ' + side);
  }
};
