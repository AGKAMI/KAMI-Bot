const answers = [
  'It is certain','It is decidedly so','Without a doubt','Yes definitely',
  'You may rely on it','As I see it, yes','Most likely','Outlook good',
  'Yes','Signs point to yes','Reply hazy try again','Ask again later',
  'Better not tell you now','Cannot predict now','Concentrate and ask again',
  "Don't count on it","My reply is no","My sources say no","Outlook not so good","Very doubtful"
];
module.exports = {
  name: '8ball',
  category: 'games',
  aliases: ['magic8ball', 'eightball'],
  execute: async (sock, msg, args, ctx) => {
    const q = args.join(' ');
    if (!q) return ctx.reply('usage: .8ball <yes/no question>');
    const ans = answers[Math.floor(Math.random() * answers.length)];
    await ctx.reply('🎱 ' + ans);
  }
};
