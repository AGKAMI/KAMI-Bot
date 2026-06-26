module.exports = {
  name: 'rps',
  category: 'games',
  aliases: ['rockpaperscissors'],
  execute: async (sock, msg, args, ctx) => {
    const choices = ['rock', 'paper', 'scissors'];
    const bot = choices[Math.floor(Math.random() * 3)];
    const user = (args[0] || '').toLowerCase();
    if (!choices.includes(user)) return ctx.reply('usage: .rps <rock|paper|scissors>');
    if (user === bot) return ctx.reply("It's a tie! Both chose " + user);
    const win = (user === 'rock' && bot === 'scissors') || (user === 'paper' && bot === 'rock') || (user === 'scissors' && bot === 'paper');
    if (win) return ctx.reply('You win! ' + user + ' beats ' + bot);
    return ctx.reply('You lose! ' + bot + ' beats ' + user);
  }
};
