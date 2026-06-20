const chains = new Map();
module.exports = {
  name: 'wordchain',
  category: 'games',
  aliases: ['chain', 'word'],
  groupOnly: true,
  execute: async (sock, msg, args, ctx) => {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'start' || sub === 'new') {
      chains.set(ctx.from, { last: null, count: 0 });
      return ctx.reply('🔁 Word Chain started!\n.word <word> to play. Last letter = next first letter.');
    }
    if (sub === 'stop') {
      chains.delete(ctx.from);
      return ctx.reply('Word chain stopped.');
    }
    if (sub === 'score') {
      const g = chains.get(ctx.from);
      if (!g) return ctx.reply('No game.');
      return ctx.reply('Words in chain: ' + g.count);
    }
    const word = args.join(' ');
    if (!word) return ctx.reply('Use: .chain start | .chain <word> | .chain stop | .chain score');
    const g = chains.get(ctx.from);
    if (!g) return ctx.reply('No active game. Use .chain start');
    if (g.last && !word.toLowerCase().startsWith(g.last)) {
      return ctx.reply('Word must start with "' + g.last + '"!');
    }
    g.last = word.toLowerCase().slice(-1);
    g.count++;
    return ctx.reply('✅ ' + word + '\nNext word must start with "' + g.last + '"');
  }
};
