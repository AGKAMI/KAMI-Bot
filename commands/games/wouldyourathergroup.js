const questions = [
  'Have the ability to fly or be invisible?',
  'Always be 10 minutes late or 20 minutes early?',
  'Live without internet or without air conditioning?',
  'Have hands for feet or feet for hands?',
  'Be famous for something good or infamous for something bad?',
  'Go back in time or jump to the future?',
  'Always say everything on your mind or never speak again?',
  'Talk to animals or speak every language?',
  'Live in a world with no music or no movies?',
  'Have unlimited money or unlimited free time?'
];
module.exports = {
  name: 'wouldyourathergroup',
  category: 'games',
  aliases: ['wyrg'],
  groupOnly: true,
  execute: async (sock, msg, args, ctx) => {
    const q = questions[Math.floor(Math.random() * questions.length)];
    const parts = q.split(' or ');
    let text = '🧠 Would You Rather (Group)\n\n1️⃣ ' + parts[0].trim() + '\n2️⃣ ' + parts[1].trim() + '\n\nReact to vote!';
    await ctx.reply(text);
  }
};
