const truths = [
  'What is your biggest fear?',
  'What is the most embarrassing thing you have done?',
  'Who was your first crush?',
  'What is a secret you have never told anyone?',
  'What is the silliest thing you have ever cried over?',
  'What is the worst lie you have ever told?',
  'What is the most childish thing you still do?',
  'Who in this group do you trust the least?',
  'What is the most trouble you have ever been in?',
  'What is the strangest dream you have ever had?',
];
const dares = [
  'Send a voice note singing the chorus of the last song you listened to.',
  'Change your display name to your first crush for 10 minutes.',
  'Speak in an accent for the next 3 messages.',
  'Type with your eyes closed for the next message.',
  'Send a selfie making the ugliest face you can.',
  'Reply to the last message in this chat with only emojis.',
  'Pretend to be a waiter and take orders from the last 3 people who messaged.',
  'Say the alphabet backwards out loud in a voice note.',
  'Send a message to the 5th person in your recent chats and say "i know your secret".',
  'Do 10 pushups and send proof.',
];
module.exports = {
  name: 'truthordare',
  aliases: ['tod'],
  category: 'games',
  execute: async (sock, msg, args, ctx) => {
    const choice = (args[0] || '').toLowerCase();
    if (!['truth', 'dare'].includes(choice)) {
      return ctx.reply('usage: .tod <truth|dare>');
    }
    const pool = choice === 'truth' ? truths : dares;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    await ctx.reply((choice === 'truth' ? '🟦 TRUTH: ' : '🟥 DARE: ') + pick);
  }
};
