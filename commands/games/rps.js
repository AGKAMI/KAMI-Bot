const { bold, italic, pick, SLANG } = require('../../utils/format');
module.exports = {
  name: 'rps',
  description: 'Play rock paper scissors',
  category: 'games',
  aliases: ['rockpaperscissors'],
  execute: async (sock, msg, args, ctx) => {
    const choices = ['rock', 'paper', 'scissors'];
    const bot = choices[Math.floor(Math.random() * 3)];
    const user = (args[0] || '').toLowerCase();
    if (!choices.includes(user)) return ctx.reply(`❌ _${pick(SLANG.error)} — usage: .rps <rock|paper|scissors>_`);
    if (user === bot) return ctx.reply(`${pick(SLANG.vibe)}, it's a tie! Both chose ${user}`);
    const win = (user === 'rock' && bot === 'scissors') || (user === 'paper' && bot === 'rock') || (user === 'scissors' && bot === 'paper');
    if (win) return ctx.reply(`${pick(SLANG.good)}, you win! ${user} beats ${bot}`);
    return ctx.reply(`${pick(SLANG.error)}, you lose! ${bot} beats ${user}`);
  }
};
