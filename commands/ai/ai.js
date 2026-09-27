/**
 * AI Chat Command - ChatGPT-style responses
 */

const APIs = require('../../utils/api');
const config = require('../../config');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');

module.exports = {
  name: 'ai',
  reactions: { received: '🧠', generating: '💭', done: '✨' },
  aliases: ['gpt', 'chatgpt', 'ask'],
  category: 'ai',
  description: 'Chat with AI (ChatGPT-style)',
  usage: '.ai <question>',
  
  async execute(sock, msg, args, extra) {
    const prefix = config.prefix || '.';
    try {
      if (args.length === 0) {
        extra.fail();
        return extra.reply(`\u274C _${voice.openErr()} - usage: ${prefix}ai <question>_\n\n_example: ${prefix}ai what is the capital of france?_`);
      }
      
      const question = args.join(' ');
      
      const sent = await extra.reply(`\u{1F916} _thinking..._`);
      
      const response = await APIs.chatAI(question);
      
      // Send only the answer without labels
      const answer = response.response || response.msg || response.data?.msg || response;
      await extra.edit(sent.key, answer);
      
    } catch (error) {
      extra.fail();
      await extra.reply(`\u274C _${voice.openErr()} - ai error: ${error.message}_`);
    }
  }
};
