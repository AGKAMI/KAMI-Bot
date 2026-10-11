/**
 * Meme Command - Send random memes
 */

const APIs = require('../../utils/api');
const axios = require('axios');
const config = require('../../config');
const { voice } = require('../../utils/format');
const { sendButtons } = require('../../utils/buttonHelper');

module.exports = {
  name: 'meme',
  reactions: { received: '🤣', generating: '🖼️', done: '😜' },
  aliases: ['memes'],
  category: 'fun',
  description: 'Get random memes',
  usage: '.meme',
  
  async execute(sock, msg, args, extra) {
    try {
      const meme = await APIs.getMeme();
      
      const imageBuffer = await axios.get(meme.url, { responseType: 'arraybuffer' });
      
      await sendButtons(sock, extra.from, {
        image: Buffer.from(imageBuffer.data),
        text: `😂 *${meme.title}*\n\n_lekke, from_ r/${meme.subreddit}\n👤 By: ${meme.author}\n⬆️ Upvotes: ${meme.ups}`,
        buttonText: '🔁 Another meme',
        footer: config.botName || 'KAMI Bot',
        buttons: [{ id: 'again:meme', text: '🔁 Another meme' }],
      }, msg);
      
    } catch (error) {
      extra.fail();
      await extra.reply(`❌ _${voice.openErr()} — ${error.message}_`);
    }
  }
};
