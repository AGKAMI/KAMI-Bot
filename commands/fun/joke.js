/**
 * Joke Command - Send random jokes
 */

const APIs = require('../../utils/api');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'joke',
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
      await extra.reply(`❌ _${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};
