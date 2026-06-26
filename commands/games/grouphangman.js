const WORDS = ['python','javascript','banana','computer','elephant','guitar','house','internet','jacket','king','lion','monkey','notebook','orange','piano','queen','rabbit','sun','tree','umbrella','violin','water','yellow','zebra','mountain','river','ocean','rocket','phone','castle'];
function mask(word, guessed) {
  return word.split('').map(c => guessed.has(c) ? c : '_').join(' ');
}
const games = new Map();
module.exports = {
  name: 'grouphangman',
  category: 'games',
  aliases: ['ghang'],
  groupOnly: true,
  execute: async (sock, msg, args, ctx) => {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'stop') {
      games.delete(ctx.from);
      return ctx.reply('group hangman stopped');
    }
    const g = games.get(ctx.from);
    if (!g) {
      const word = WORDS[Math.floor(Math.random() * WORDS.length)];
      games.set(ctx.from, { word, guessed: new Set(), wrong: 0 });
      const m = mask(word, new Set());
      return ctx.reply('📝 group hangman!\n\n' + m + '\nLength: ' + word.length + '\nGuesses: 6/6\nUse .ghang <letter>');
    }
    if (sub.length === 1 && /^[a-z]$/.test(sub)) {
      if (g.guessed.has(sub)) return ctx.reply('already guessed that hey');
      g.guessed.add(sub);
      if (g.word.includes(sub)) {
        const m = mask(g.word, g.guessed);
        if (!m.includes('_')) {
          games.delete(ctx.from);
          return ctx.reply('🎉 group won! word: ' + g.word);
        }
        return ctx.reply('✅ ' + sub + ' is in the word!\n' + m + '\nWrong: ' + g.wrong + '/6');
      }
      g.wrong++;
      if (g.wrong >= 6) {
        games.delete(ctx.from);
        return ctx.reply('💀 game over! word: ' + g.word);
      }
      return ctx.reply('❌ ' + sub + ' not in word!\n' + mask(g.word, g.guessed) + '\nWrong: ' + g.wrong + '/6');
    }
    return ctx.reply('Use .ghang <letter> or .ghang stop');
  }
};
