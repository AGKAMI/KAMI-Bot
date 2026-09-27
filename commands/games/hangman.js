const config = require('../../config');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');
const WORDS = ['python','javascript','banana','computer','elephant','guitar','house','internet','jacket','king','lion','monkey','notebook','orange','piano','queen','rabbit','sun','tree','umbrella','violin','water','yellow','zebra','mountain','river','ocean','rocket','phone','castle'];
function mask(word, guessed) {
  return word.split('').map(c => guessed.has(c) ? c : '_').join(' ');
}
const games = new Map();
module.exports = {
  name: 'hangman',
  reactions: { received: '🔤', done: '🪢' },
  description: 'Play hangman — guess the word letter by letter',
  category: 'games',
  aliases: ['hang'],
  execute: async (sock, msg, args, ctx) => {
    const prefix = config.prefix || '.';
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'stop') {
      games.delete(ctx.from);
      return ctx.reply(`${voice.lead('neutral')}, hangman stopped!`);
    }
    const g = games.get(ctx.from);
    if (!g) {
      const word = WORDS[Math.floor(Math.random() * WORDS.length)];
      games.set(ctx.from, { word, guessed: new Set(), wrong: 0 });
      const m = mask(word, new Set());
      return ctx.reply(`📝 hangman started!\n\n${m}\nLength: ${word.length}\nGuesses: 6/6\nUse ${prefix}hangman <letter>`);
    }
    // No args and game active — show current state
    if (!sub) {
      return ctx.reply(`📝 hangman active!\n\n${mask(g.word, g.guessed)}\nWrong: ${g.wrong}/6\nUse ${prefix}hangman <letter>`);
    }
    if (sub.length === 1 && /^[a-z]$/.test(sub)) {
      if (g.guessed.has(sub)) return ctx.reply(`already guessed that letter, ${voice.tag('neutral')}`);
      g.guessed.add(sub);
      if (g.word.includes(sub)) {
        const m = mask(g.word, g.guessed);
        if (!m.includes('_')) {
          games.delete(ctx.from);
          return ctx.reply(`🎉 ${voice.lead('affirm')}, you won! word: ${g.word}`);
        }
        return ctx.reply(`✅ Correct!\n${m}\nWrong: ${g.wrong}/6`);
      }
      g.wrong++;
      if (g.wrong >= 6) {
        games.delete(ctx.from);
        return ctx.reply(`💀 ${voice.openErr()}, game over! word was: ${g.word}`);
      }
      ctx.fail();
      return ctx.reply(`❌ Wrong!\n${mask(g.word, g.guessed)}\nWrong: ${g.wrong}/6`);
    }
    if (sub.length > 1) {
      if (sub === g.word) {
        games.delete(ctx.from);
        return ctx.reply(`🎉 ${voice.lead('affirm')}, you got the word: ${g.word}`);
      }
      games.delete(ctx.from);
      return ctx.reply(`💀 ${voice.openErr()}, wrong word! it was: ${g.word}`);
    }
    return ctx.reply(`Use ${prefix}hangman <letter> or ${prefix}hangman stop`);
  }
};
