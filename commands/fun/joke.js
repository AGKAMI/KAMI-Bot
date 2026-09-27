/**
 * Joke Command - Send random jokes
 */

const APIs = require('../../utils/api');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');

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
      
      await extra.reply(text);
      
    } catch (error) {
      extra.fail();
      await extra.reply(`❌ _${voice.openErr()} — ${error.message}_`);
    }
  }
};
