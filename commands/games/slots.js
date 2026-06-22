const REELS = ['🍒','🍋','🍇','🍉','🔔','💎','7️⃣'];
const PAYOUTS = {
  '7️⃣7️⃣7️⃣': 100,
  '💎💎💎': 50,
  '🔔🔔🔔': 25,
  '🍇🍇🍇': 15,
  '🍉🍉🍉': 10,
  '🍋🍋🍋': 8,
  '🍒🍒🍒': 5,
};
const TWO_MATCH = 2;

module.exports = {
  name: 'slots',
  aliases: ['slot', 'spin'],
  category: 'games',
  execute: async (sock, msg, args, ctx) => {
    const r1 = REELS[Math.floor(Math.random() * REELS.length)];
    const r2 = REELS[Math.floor(Math.random() * REELS.length)];
    const r3 = REELS[Math.floor(Math.random() * REELS.length)];
    const combo = r1 + r2 + r3;
    const tripleMatch = PAYOUTS[combo];
    const twoMatch = (r1 === r2 || r2 === r3 || r1 === r3);
    const win = tripleMatch || (twoMatch ? TWO_MATCH : 0);
    let text = '🎰 | ' + r1 + ' | ' + r2 + ' | ' + r3 + ' |\n';
    if (win > 0) {
      text += '🏆 Win: ' + win + ' points!';
    } else {
      text += '😢 No match. Try again!';
    }
    await ctx.reply(text);
  }
};
