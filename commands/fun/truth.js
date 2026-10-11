/**
 * Truth - Get a random truth question, lekke from @bochilteam/scraper (translated to English)
 */

const { truth } = require('@bochilteam/scraper');
const { translate } = require('@vitalets/google-translate-api');
const config = require('../../config');
const { voice } = require('../../utils/format');
const { sendButtons } = require('../../utils/buttonHelper');

module.exports = {
    name: 'truth',
    reactions: { received: '🤥', done: '🤞' },
    aliases: [],
    category: 'fun',
    description: 'Get a random truth question, lekke',
    usage: 'truth',
    execute: async (sock, msg, args, extra) => {
      try {
        const question = await truth();
        
        // Translate to English
        const res = await translate(question, { to: 'en' });
        
        await sendButtons(sock, extra.from, {
          text: res.text,
          footer: config.botName || 'KAMI Bot',
          buttons: [{ id: 'again:truth', text: '🔁 Another truth' }],
        }, msg);
        
      } catch (error) {
        console.error('Truth Error:', error);
        extra.fail();
        await extra.reply(`❌ _${voice.openErr()} — ${error.message}_`);
      }
    }
  };
  