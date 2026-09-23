const { bold, italic, pick, SLANG } = require('../../utils/format');
const config = require('../../config');
const WORDS = ['python','javascript','banana','computer','elephant','guitar','house','internet','jacket','king','lion','monkey','notebook','orange','piano','queen','rabbit','sun','tree','umbrella','violin','water','yellow','zebra','mountain','river','ocean','rocket','phone','castle'];
function mask(word, guessed) {
  return word.split('').map(c => guessed.has(c) ? c : '_').join(' ');
}
const games = new Map();
module.exports = {
  name: 'grouphangman',
  description: 'Play hangman with the whole group',
  category: 'games',
  aliases: ['ghang'],
  groupOnly: true,
  execute: async (sock, msg, args, ctx) => {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'stop') {
      games.delete(ctx.from);
      return ctx.reply(`${pick(SLANG.vibe)}, group hangman stopped!`);
    }
    const g = games.get(ctx.from);
    if (!g) {
      const word = WORDS[Math.floor(Math.random() * WORDS.length)];
      games.set(ctx.from, { word, guessed: new Set(), wrong: 0 });
      const m = mask(word, new Set());
      return ctx.reply(`📝 group hangman!\n\n${m}\nLength: ${word.length}\nGuesses: 6/6\nUse ${config.prefix}ghang <letter>`);
    }
    // No args and game active — show current state
    if (!sub) {
      return ctx.reply(`📝 group hangman active!\n\n${mask(g.word, g.guessed)}\nWrong: ${g.wrong}/6\nUse ${config.prefix}ghang <letter>`);
    }
    if (sub.length === 1 && /^[a-z]$/.test(sub)) {
      if (g.guessed.has(sub)) return ctx.reply(`already guessed that, ${pick(SLANG.vibe)}`);
      g.guessed.add(sub);
      if (g.word.includes(sub)) {
        const m = mask(g.word, g.guessed);
        if (!m.includes('_')) {
          games.delete(ctx.from);
          return ctx.reply(`🎉 ${pick(SLANG.good)}, group won! word: ${g.word}`);
        }
        return ctx.reply(`✅ ${sub} is in the word!\n${m}\nWrong: ${g.wrong}/6`);
      }
      g.wrong++;
      if (g.wrong >= 6) {
        games.delete(ctx.from);
        return ctx.reply(`💀 ${pick(SLANG.error)}, game over! word: ${g.word}`);
      }
      return ctx.reply(`❌ ${sub} not in word!\n${mask(g.word, g.guessed)}\nWrong: ${g.wrong}/6`);
    }
    return ctx.reply(`Use ${config.prefix}ghang <letter> or ${config.prefix}ghang stop`);
  }
};
