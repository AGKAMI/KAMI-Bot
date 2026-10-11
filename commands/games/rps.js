const config = require('../../config');
const { voice } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

const CHOICES = ['rock', 'paper', 'scissors'];
const btnRow = [
  { id: 'games:rps:play:rock', text: '✊ Rock' },
  { id: 'games:rps:play:paper', text: '📄 Paper' },
  { id: 'games:rps:play:scissors', text: '✂️ Scissors' },
];

async function play(sock, msg, from, user) {
  const bot = CHOICES[Math.floor(Math.random() * 3)];
  let text;
  if (user === bot) {
    text = `${voice.lead('neutral')}, it's a tie! Both chose ${user}`;
  } else {
    const win = (user === 'rock' && bot === 'scissors') || (user === 'paper' && bot === 'rock') || (user === 'scissors' && bot === 'paper');
    text = win ? `${voice.lead('affirm')}, you win! ${user} beats ${bot}` : `${voice.openErr()}, you lose! ${bot} beats ${user}`;
  }
  await sendButtons(sock, from, {
    text: `${text}\n\n_play again?_`,
    footer: config.botName || 'KAMI Bot',
    buttons: btnRow,
  }, msg);
}

module.exports = {
  name: 'rps',
  reactions: { received: '✊', done: '🤝' },
  description: 'Play rock paper scissors',
  category: 'games',
  aliases: ['rockpaperscissors'],
  usage: '.rps [rock|paper|scissors]',
  execute: async (sock, msg, args, ctx) => {
    const prefix = config.prefix || '.';
    const user = (args[0] || '').toLowerCase();
    if (!CHOICES.includes(user)) {
      return sendButtons(sock, ctx.from, {
        text: `✊ *ROCK PAPER SCISSORS*\n\n_pick your weapon below, or type ${prefix}rps <rock|paper|scissors>_`,
        footer: config.botName || 'KAMI Bot',
        buttons: btnRow,
      }, msg);
    }
    return play(sock, msg, ctx.from, user);
  }
};

onButton('games:rps:play:', async (sock, msg, from, sender, btnId) => {
  const user = btnId.split(':').pop();
  if (!CHOICES.includes(user)) return;
  await play(sock, msg, from, user);
});
