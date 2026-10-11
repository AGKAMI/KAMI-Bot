const config = require('../../config');
const { sendButtons } = require('../../utils/buttonHelper');
module.exports = {
  name: 'coinflip',
  reactions: { received: '🪙', done: '📈' },
  description: 'Flip a coin — heads or tails',
  aliases: ['flip', 'coin'],
  category: 'games',
  execute: async (sock, msg, args, ctx) => {
    const side = Math.random() < 0.5 ? 'heads' : 'tails';
    await sendButtons(sock, ctx.from, {
      text: `🪙 Coin: ${side}\n\n_flip again?_`,
      footer: config.botName || 'KAMI Bot',
      buttons: [{ id: 'again:coinflip', text: '🪙 Flip again' }],
    }, msg);
  }
};
