/**
 * Translate Command - Translate text to different languages
 */

const APIs = require('../../utils/api');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'translate',
  aliases: ['tr', 'trans'],
  category: 'general',
  description: 'Translate text to another language',
  usage: '.translate <lang code> <text>',
  
  async execute(sock, msg, args, extra) {
    try {
      if (args.length < 2) {
        return extra.reply(`❌ _${pick(SLANG.error)}, usage: .translate <lang> <text>\n\nExample: .translate es Hello world_`);
      }
      
      const targetLang = args[0];
      const text = args.slice(1).join(' ');
      
      await extra.reply(`${italic('translating...')}`);
      
      const result = await APIs.translate(text, targetLang);
      
      let replyText = `${bold('Translation')}\n\n`;
      replyText += `${bold('Original:')} ${text}\n`;
      replyText += `${bold('Translated:')} ${result.translation || result}\n`;
      replyText += `${bold('Language:')} ${targetLang.toUpperCase()}`;
      
      await extra.reply(replyText);
      
    } catch (error) {
      await extra.reply(`❌ _${pick(SLANG.error)}, translation failed — ${error.message}_\n\nsupported codes: en, es, fr, de, it, pt, ru, ja, ko, zh`);
    }
  }
};
