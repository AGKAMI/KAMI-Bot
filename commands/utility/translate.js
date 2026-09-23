/**
 * Translate Command - Translate text to different languages
 */

const axios = require('axios');
const config = require('../../config');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'translate',
  aliases: ['trt', 'tr'],
  category: 'utility',
  description: 'Translate text to different languages',
  usage: '.translate <text> <lang> or .translate <lang> (reply to message)',
  
  async execute(sock, msg, args) {
    const prefix = config.prefix || '.';
    try {
      const chatId = msg.key.remoteJid;
      
      // Show typing indicator
      await sock.sendPresenceUpdate('composing', chatId);
      
      let textToTranslate = '';
      let lang = '';
      
      // Check if it's a reply
      const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      
      if (quotedMessage) {
        // Get text from quoted message
        textToTranslate = quotedMessage.conversation || 
                         quotedMessage.extendedTextMessage?.text || 
                         quotedMessage.imageMessage?.caption || 
                         quotedMessage.videoMessage?.caption || 
                         '';
        
        // Get language from command
        lang = args.join(' ').trim();
      } else {
        // Parse command arguments for direct message
        if (args.length < 2) {
          return await sock.sendMessage(chatId, {
            text: `*TRANSLATOR*\n\n` +
            `Usage:\n` +
            `1. Reply to a message with: ${prefix}translate <lang> or .trt <lang>\n` +
            `2. Or type: ${prefix}translate <text> <lang> or .trt <text> <lang>\n\n` +
            `Example:\n` +
            `${prefix}translate hello fr\n` +
            `.trt hello fr\n\n` +
            `Language codes:\n` +
            `fr - French, es - Spanish, de - German, it - Italian\n` +
            `pt - Portuguese, ru - Russian, ja - Japanese, ko - Korean\n` +
            `zh - Chinese, ar - Arabic, hi - Hindi`
          }, { quoted: msg });
        }
        
        lang = args.pop(); // Get language code
        textToTranslate = args.join(' '); // Get text to translate
      }
      
      if (!textToTranslate) {
        return await sock.sendMessage(chatId, { 
          text: `❌ _${pick(SLANG.error)}, no text to translate — reply to a message or add text_`
        }, { quoted: msg });
      }
      
      if (!lang) {
        return await sock.sendMessage(chatId, { 
          text: `❌ _${pick(SLANG.error)}, specify a language code_\n\n_Example:_ ${prefix}translate hello fr`
        }, { quoted: msg });
      }
      
      // Try multiple translation APIs in sequence
      let translatedText = null;
      
      // Try API 1 (Google Translate API)
      try {
        const response = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(textToTranslate)}`);
        if (response.status === 200) {
          const data = response.data;
          if (data && data[0] && data[0][0] && data[0][0][0]) {
            translatedText = data[0][0][0];
          }
        }
      } catch (e) {
        // Continue to next API
      }
      
      // If API 1 fails, try API 2
      if (!translatedText) {
        try {
          const response = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=auto|${lang}`);
          if (response.status === 200) {
            const data = response.data;
            if (data && data.responseData && data.responseData.translatedText) {
              translatedText = data.responseData.translatedText;
            }
          }
        } catch (e) {
          // Continue to next API
        }
      }
      
      // If API 2 fails, try API 3
      if (!translatedText) {
        try {
          const response = await axios.get(`https://api.dreaded.site/api/translate?text=${encodeURIComponent(textToTranslate)}&lang=${lang}`);
          if (response.status === 200) {
            const data = response.data;
            if (data && data.translated) {
              translatedText = data.translated;
            }
          }
        } catch (e) {
          // All APIs failed
        }
      }
      
      if (!translatedText) {
        return await sock.sendMessage(chatId, { 
          text: `❌ _${pick(SLANG.error)}, translation failed — try again later_`
        }, { quoted: msg });
      }
      
      // Send translation
      await sock.sendMessage(chatId, {
        text: `${translatedText}`
      }, { quoted: msg });
      
    } catch (error) {
      console.error('❌ Error in translate command:', error);
      await sock.sendMessage(msg.key.remoteJid, { 
        text: `❌ _${pick(SLANG.error)}, translation failed — try again later_`
      }, { quoted: msg });
    }
  }
};
