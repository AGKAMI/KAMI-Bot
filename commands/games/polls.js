const { bold, italic, pick, SLANG } = require('../../utils/format');
module.exports = {
  name: 'poll',
  reactions: { received: '📊', done: '🗳️' },
  description: 'Create a yes/no or custom poll',
  category: 'games',
  aliases: ['vote'],
  groupOnly: true,
  execute: async (sock, msg, args, ctx) => {
    const question = args.join(' ');
    if (!question) return ctx.reply(`❌ _${pick(SLANG.error)} — usage: .poll <question>\nOr: .poll <q> | opt1 | opt2 | opt3_`);
    const parts = question.split('|').map(s => s.trim());
    let text = '🗳️ poll\n\n';
    if (parts.length <= 1) {
      text += parts[0] + '\n\n👍 Yes\n👎 No';
    } else {
      text += parts[0] + '\n\n';
      parts.slice(1).forEach((p, i) => {
        text += (i + 1) + '. ' + p + '\n';
      });
      text += '\nReact with the number!';
    }
    await ctx.reply(text);
  }
};
