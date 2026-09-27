const config = require('../../config');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');
module.exports = {
  name: 'rps',
  reactions: { received: '✊', done: '🤝' },
  description: 'Play rock paper scissors',
  category: 'games',
  aliases: ['rockpaperscissors'],
  execute: async (sock, msg, args, ctx) => {
    const prefix = config.prefix || '.';
    const choices = ['rock', 'paper', 'scissors'];
    const bot = choices[Math.floor(Math.random() * 3)];
    const user = (args[0] || '').toLowerCase();
    if (!choices.includes(user)) { ctx.fail(); return ctx.reply(`❌ _${voice.openErr()} — usage: ${prefix}rps <rock|paper|scissors>_`); }
    if (user === bot) return ctx.reply(`${voice.lead('neutral')}, it's a tie! Both chose ${user}`);
    const win = (user === 'rock' && bot === 'scissors') || (user === 'paper' && bot === 'rock') || (user === 'scissors' && bot === 'paper');
    if (win) return ctx.reply(`${voice.lead('affirm')}, you win! ${user} beats ${bot}`);
    return ctx.reply(`${voice.openErr()}, you lose! ${bot} beats ${user}`);
  }
};
