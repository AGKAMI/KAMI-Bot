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
        return extra.reply(`\u274C *ERROR*\n\u{1F4A1} Usage: ${prefix}translate <lang> <text>\n\n\u{1F4DD} *Example:* ${prefix}translate es Hello world`);
      }
      
      const targetLang = args[0];
      const text = args.slice(1).join(' ');
      
      const sent = await extra.reply(`\u23F3 _translating..._`);
      
      const result = await APIs.translate(text, targetLang);
      
      let replyText = `\u2705 *TRANSLATION*\n\n`;
      replyText += `\u{1F4DD} *Original:* ${text}\n`;
      replyText += `\u{1F310} *Translated:* ${result.translation || result}\n`;
      replyText += `\u{1F5E3}\uFE0F *Language:* ${targetLang.toUpperCase()}`;
      
      await extra.edit(sent.key, replyText);
      
    } catch (error) {
      await extra.reply(`\u274C *ERROR*\n\u{1F4A1} ${pick(SLANG.error)}, translation failed - ${error.message}\n\n\u{1F4A1} Supported codes: en, es, fr, de, it, pt, ru, ja, ko, zh`);
    }
  }
};
