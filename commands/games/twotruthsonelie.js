const rounds = [
  { statements: ['The Eiffel Tower can grow by more than 6 inches in summer.', 'Octopuses have three hearts.', 'Bananas are berries, but strawberries are not.'], lie: 0 },
  { statements: ['Honey never spoils.', 'Tomatoes are vegetables.', 'Wombats have cube-shaped poop.'], lie: 1 },
  { statements: ['A group of flamingos is called a flamboyance.', 'Venus is the hottest planet.', 'Bananas glow blue under UV light.'], lie: 2 },
  { statements: ['The shortest war in history lasted 38 minutes.', 'Oxford is older than the Aztec Empire.', 'A jiffy is 1/100th of a second.'], lie: 1 },
  { statements: ['Snails can sleep for 3 years.', "The heart of a shrimp is in its head.", "A crocodile can't stick its tongue out."], lie: 2 }
];
module.exports = {
  name: 'twotruthsonelie',
  category: 'games',
  aliases: ['ttol'],
  execute: async (sock, msg, args, ctx) => {
    const r = rounds[Math.floor(Math.random() * rounds.length)];
    const text = r.statements.map((s, i) => (i + 1) + '. ' + s).join('\n');
    await ctx.reply('🤔 Two Truths and a Lie!\n\n' + text + '\n\nWhich is the lie?');
  }
};
