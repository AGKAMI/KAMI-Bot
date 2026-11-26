/**
 * Random Command - Get random anime data
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getTempDir, deleteTempFile } = require('../../utils/tempManager');
const { sendSfw, sfwRow } = require('../../utils/sfwAnime');
const { sendButtons } = require('../../utils/buttonHelper');

const BASE = 'https://nekos.life/api/v2/img/waifu';
const API_KEY = 'prince';

module.exports = {
  name: 'random',
  reactions: { received: '🎲', generating: '⬇️', done: '🖼️' },
  aliases: ['animerandom', 'randomanime'],
  category: 'anime',
  description: 'Get random anime data',
  usage: 'random',
  execute: async (sock, msg, args, extra) => {
    try {
      const url = `${BASE}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        },
        timeout: 30000
      });
      
      if (!response.data || !response.data.url) {
        throw new Error('Invalid API response: missing anime data');
      }
      
      // BASE returns { url: "<image url>" } — the URL itself is the media
      const imageUrl = response.data.url;

      if (!imageUrl || typeof imageUrl !== 'string') {
        throw new Error('Invalid image URL in API response');
      }

      // Download the image
      let imageBuffer = null;
      try {
        const imageResponse = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'image/*'
          },
          timeout: 30000
        });

        imageBuffer = Buffer.from(imageResponse.data);

        if (!imageBuffer || imageBuffer.length === 0) {
          imageBuffer = null;
        } else if (imageBuffer.length > 5 * 1024 * 1024) {
          imageBuffer = null; // Skip image if too large
        }
      } catch (imgError) {
        console.error('Error downloading image:', imgError);
        imageBuffer = null;
      }

      // Build caption
      let caption = `*Random Anime*\n\n_Enjoy!_`;

      // Send with image if available
      if (imageBuffer) {
        const tempDir = getTempDir();
        const timestamp = Date.now();
        const tempImagePath = path.join(tempDir, `anime_${timestamp}.jpg`);

        try {
          fs.writeFileSync(tempImagePath, imageBuffer);
          const finalBuffer = fs.readFileSync(tempImagePath);

          await sendSfw(sock, extra.from, msg, 'random', finalBuffer, caption);

        } finally {
          try {
            deleteTempFile(tempImagePath);
          } catch (cleanupError) {
          }
        }
      } else {
        // Send text only if no image (still with SFW buttons so the loop closes)
        await sendButtons(sock, extra.from, {
          text: caption,
          buttonText: '👇 More below',
          footer: require('../../config').botName || 'KAMI Bot',
          buttons: sfwRow('random'),
        }, msg);
      }
      
    } catch (error) {
      console.error('Error in random command:', error);
      
      if (error.response?.status === 404) {
        extra.fail();
        await extra.reply('❌ no anime data — try again');
      } else if (error.response?.status === 429) {
        extra.fail();
        await extra.reply('❌ rate limit — try again later');
      } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        extra.fail();
        await extra.reply('❌ timed out — try again');
      } else {
        extra.fail();
        await extra.reply(`❌ Couldn't grab the anime data: ${error.message}`);
      }
    }
  }
};

