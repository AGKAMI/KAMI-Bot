/**
 * AI Chat Command - ChatGPT-style responses
 */

const APIs = require('../../utils/api');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'ai',
  aliases: ['gpt', 'chatgpt', 'ask'],
  category: 'ai',
  description: 'Chat with AI (ChatGPT-style)',
  usage: '.ai <question>',
  
  async execute(sock, msg, args, extra) {
    try {
      if (args.length === 0) {
        return extra.reply(`❌ _${pick(SLANG.error)} — usage: .ai <question>_\n\n_example: .ai what is the capital of france?_`);
      }
      
      const question = args.join(' ');
      
      const response = await APIs.chatAI(question);
      
      // Send only the answer without labels
      const answer = response.response || response.msg || response.data?.msg || response;
      await extra.reply(answer);
      
    } catch (error) {
      await extra.reply(`❌ _${pick(SLANG.error)} — ai error: ${error.message}_`);
    }
  }
};
