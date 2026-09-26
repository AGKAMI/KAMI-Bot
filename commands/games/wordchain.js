const { bold, italic, pick, SLANG } = require('../../utils/format');
const chains = new Map();
module.exports = {
  name: 'wordchain',
  reactions: { received: '🧵', done: '📝' },
  description: 'Word chain — each word starts with the last letter',
  category: 'games',
  aliases: ['chain', 'word'],
  groupOnly: true,
  execute: async (sock, msg, args, ctx) => {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'start' || sub === 'new') {
      chains.set(ctx.from, { last: null, count: 0 });
      return ctx.reply(`🔁 word chain started!\n.word <word> to play. Last letter = next first letter.`);
    }
    if (sub === 'stop') {
      chains.delete(ctx.from);
      return ctx.reply(`${pick(SLANG.vibe)}, word chain stopped!`);
    }
    if (sub === 'score') {
      const g = chains.get(ctx.from);
      if (!g) return ctx.reply(`❌ _no active game_`);
      return ctx.reply(`Words in chain: ${g.count}`);
    }
    const word = args.join(' ');
    if (!word) return ctx.reply(`❌ _${pick(SLANG.error)} — use: .chain start | .chain <word> | .chain stop | .chain score_`);
    const g = chains.get(ctx.from);
    if (!g) return ctx.reply(`❌ _no active game — use .chain start_`);
    if (g.last && !word.toLowerCase().startsWith(g.last)) {
      return ctx.reply(`❌ _word must start with "${g.last}"!_`);
    }
    g.last = word.toLowerCase().slice(-1);
    g.count++;
    return ctx.reply(`✅ ${word}\nNext word must start with "${g.last}"`);
  }
};
