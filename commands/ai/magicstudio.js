/**
 * Magic Studio AI Art Generation Command
 * Generate AI-powered art from text prompts
 */

const axios = require('axios');
const config = require('../../config');
const { bold, italic, pick, SLANG } = require('../../utils/format');

const BASE = 'https://api.siputzx.my.id/api/ai/magicstudio';

module.exports = {
  name: 'imagine',
  aliases: ['magic', 'magicai', 'generate'],
  category: 'ai',
  description: 'Generate AI art from text prompt',
  usage: 'magicstudio <prompt>',
  execute: async (sock, msg, args, extra) => {
    const prefix = config.prefix || '.';
    try {
      const prompt = args.join(' ').trim();
      
      if (!prompt) {
        return await extra.reply(
          `❌ _${pick(SLANG.error)} — usage: ${prefix}magicstudio <prompt>_\n\n_Example: ${prefix}magicstudio a cyberpunk city_`
        );
      }
      
      // Fetch image from API
      const url = `${BASE}?prompt=${encodeURIComponent(prompt)}`;
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': '*/*'
        },
        timeout: 120000 // 2 minutes timeout for AI generation
      });
      
      const imageBuffer = Buffer.from(response.data);
      
      // Verify buffer is valid
      if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error('Empty response from API');
      }
      
      // Check file size (WhatsApp image limit is 16MB)
      const maxImageSize = 16 * 1024 * 1024; // 16MB
      if (imageBuffer.length > maxImageSize) {
        throw new Error(`Image too large: ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB (max 16MB)`);
      }
      
      // Send the generated image
      await sock.sendMessage(extra.from, {
        image: imageBuffer
      }, { quoted: msg });
      
    } catch (error) {
      console.error('Error in magicstudio command:', error);
      
      // Handle specific error cases
      if (error.response?.status === 429) {
        await extra.reply(`❌ _${pick(SLANG.error)} — rate limit — try again later_`);
      } else if (error.response?.status === 400) {
        await extra.reply(`❌ _${pick(SLANG.error)} — invalid prompt — try something else_`);
      } else if (error.response?.status === 500) {
        await extra.reply(`❌ _${pick(SLANG.error)} — server error — try again later_`);
      } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        await extra.reply(`❌ _${pick(SLANG.error)} — timed out — try again_`);
      } else {
        await extra.reply(`❌ _${pick(SLANG.error)} — couldn't generate image: ${error.message}_`);
      }
    }
  }
};

