/**
 * Joke Command - Send random jokes
 */

const APIs = require('../../utils/api');
const config = require('../../config');
const { voice } = require('../../utils/format');
const { sendButtons } = require('../../utils/buttonHelper');

module.exports = {
  name: 'joke',
  reactions: { received: '😂', generating: '📖', done: '😄' },
  aliases: ['jokes'],
  category: 'fun',
  description: 'Get random joke',
  usage: '.joke',
  
  async execute(sock, msg, args, extra) {
    try {
      const joke = await APIs.getJoke();
      
      let text = `${joke.setup}\n\n${joke.punchline}`;
      
      await sendButtons(sock, extra.from, {
        text,
        footer: config.botName || 'KAMI Bot',
        buttons: [{ id: 'again:joke', text: '🔁 Another joke' }],
      }, msg);
      
    } catch (error) {
      extra.fail();
      await extra.reply(`❌ _${voice.openErr()} — ${error.message}_`);
    }
  }
};
