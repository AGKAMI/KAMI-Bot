const config = require('../../config');
const { voice } = require('../../utils/format');
const { sendButtons } = require('../../utils/buttonHelper');

const rollBtns = [
  { id: 'again:dice', text: '🎲 d6' },
  { id: 'again:dice:20', text: '🎯 d20' },
  { id: 'again:dice:100', text: '💯 d100' },
];

module.exports = {
  name: 'dice',
  reactions: { received: '🎲', done: '🔢' },
  description: 'Roll a dice (default d6)',
  category: 'games',
  aliases: ['roll'],
  execute: async (sock, msg, args, ctx) => {
    const sides = parseInt(args[0]) || 6;
    if (sides < 2) { ctx.fail(); return ctx.reply(`❌ _${voice.openErr()} — min sides: 2_`); }
    if (sides > 1000) { ctx.fail(); return ctx.reply(`❌ _${voice.openErr()} — max sides: 1000_`); }
    const result = Math.floor(Math.random() * sides) + 1;
    await sendButtons(sock, ctx.from, {
      text: `🎲 ${voice.lead('neutral')}, you rolled a ${result} (d${sides})\n\n_roll again?_`,
      footer: config.botName || 'KAMI Bot',
      buttons: rollBtns,
    }, msg);
  }
};
