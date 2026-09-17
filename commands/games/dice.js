const { bold, italic, pick, SLANG } = require('../../utils/format');
module.exports = {
  name: 'dice',
  description: 'Roll a dice (default d6)',
  category: 'games',
  aliases: ['roll'],
  execute: async (sock, msg, args, ctx) => {
    const sides = parseInt(args[0]) || 6;
    if (sides < 2) return ctx.reply(`❌ _${pick(SLANG.error)} — min sides: 2_`);
    if (sides > 1000) return ctx.reply(`❌ _${pick(SLANG.error)} — max sides: 1000_`);
    const result = Math.floor(Math.random() * sides) + 1;
    await ctx.reply(`🎲 ${pick(SLANG.vibe)}, you rolled a ${result} (d${sides})`);
  }
};
