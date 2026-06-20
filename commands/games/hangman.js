const WORDS = ['python','javascript','banana','computer','elephant','guitar','house','internet','jacket','king','lion','monkey','notebook','orange','piano','queen','rabbit','sun','tree','umbrella','violin','water','yellow','zebra','mountain','river','ocean','rocket','phone','castle'];
function mask(word, guessed) {
  return word.split('').map(c => guessed.has(c) ? c : '_').join(' ');
}
const games = new Map();
module.exports = {
  name: 'hangman',
  category: 'games',
  aliases: ['hang'],
  execute: async (sock, msg, args, ctx) => {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'stop') {
      games.delete(ctx.from);
      return ctx.reply('Hangman stopped.');
    }
    const g = games.get(ctx.from);
    if (!g) {
      const word = WORDS[Math.floor(Math.random() * WORDS.length)];
      games.set(ctx.from, { word, guessed: new Set(), wrong: 0 });
      const m = mask(word, new Set());
      return ctx.reply('📝 Hangman started!\n\n' + m + '\nLength: ' + word.length + '\nGuesses: 6/6\nUse .hangman <letter>');
    }
    if (sub.length === 1 && /^[a-z]$/.test(sub)) {
      if (g.guessed.has(sub)) return ctx.reply('Already guessed that letter!');
      g.guessed.add(sub);
      if (g.word.includes(sub)) {
        const m = mask(g.word, g.guessed);
        if (!m.includes('_')) {
          games.delete(ctx.from);
          return ctx.reply('🎉 You won! Word: ' + g.word);
        }
        return ctx.reply('✅ Correct!\n' + m + '\nWrong: ' + g.wrong + '/6');
      }
      g.wrong++;
      if (g.wrong >= 6) {
        games.delete(ctx.from);
        return ctx.reply('💀 Game over! Word was: ' + g.word);
      }
      return ctx.reply('❌ Wrong!\n' + mask(g.word, g.guessed) + '\nWrong: ' + g.wrong + '/6');
    }
    if (sub.length > 1) {
      if (sub === g.word) {
        games.delete(ctx.from);
        return ctx.reply('🎉 You guessed the word: ' + g.word);
      }
      games.delete(ctx.from);
      return ctx.reply('💀 Wrong word! It was: ' + g.word);
    }
    return ctx.reply('Use .hangman <letter> or .hangman stop');
  }
};
