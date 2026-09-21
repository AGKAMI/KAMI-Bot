/**
 * Translate Command - Translate text to different languages
 */

const APIs = require('../../utils/api');
const config = require('../../config');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'translate',
  aliases: ['tr', 'trans'],
  category: 'general',
  description: 'Translate text to another language',
  usage: '.translate <lang code> <text>',
  
  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      if (args.length < 2) {
        return extra.reply(`❌ *ERROR*\n💡 Usage: ${prefix}translate <lang> <text>\n\n📝 *Example:* ${prefix}translate es Hello world`);
      }
      
      const targetLang = args[0];
      const text = args.slice(1).join(' ');
      
      await extra.reply(`⏳ *TRANSLATING...*\n💡 _translating..._`);
      
      const result = await APIs.translate(text, targetLang);
      
      let replyText = `✅ *TRANSLATION*\n\n`;
      replyText += `📝 *Original:* ${text}\n`;
      replyText += `🌐 *Translated:* ${result.translation || result}\n`;
      replyText += `🗣️ *Language:* ${targetLang.toUpperCase()}`;
      
      await extra.reply(replyText);
      
    } catch (error) {
      await extra.reply(`❌ *ERROR*\n💡 ${pick(SLANG.error)}, translation failed — ${error.message}\n\n💡 Supported codes: en, es, fr, de, it, pt, ru, ja, ko, zh`);
    }
  }
};
