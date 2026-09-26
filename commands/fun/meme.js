/**
 * Meme Command - Send random memes
 */

const APIs = require('../../utils/api');
const axios = require('axios');
const { bold, italic, pick, SLANG } = require('../../utils/format');

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
      
      await sock.sendMessage(extra.from, {
        image: Buffer.from(imageBuffer.data),
        caption: `😂 *${meme.title}*\n\n_lekke, from_ r/${meme.subreddit}\n👤 By: ${meme.author}\n⬆️ Upvotes: ${meme.ups}`
      }, { quoted: msg });
      
    } catch (error) {
      await extra.reply(`❌ _${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};
