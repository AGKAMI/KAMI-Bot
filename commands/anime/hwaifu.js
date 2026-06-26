/**
 * Hwaifu Command - Get random hwaifu anime images
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getTempDir, deleteTempFile } = require('../../utils/tempManager');

const BASE = 'https://api.waifu.pics/sfw/waifu';
const API_KEY = 'prince';

module.exports = {
  name: 'hwaifu',
  aliases: ['hwaifunsfw'],
  category: 'anime',
  desc: 'Get random hwaifu NSFW anime images',
  usage: 'hwaifu',
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
        throw new Error('Invalid API response: missing image URL');
      }
      
      const imageUrl = response.data.url;
      
      if (!imageUrl || typeof imageUrl !== 'string') {
        throw new Error('Invalid image URL in API response');
      }
      
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'image/*'
        },
        timeout: 30000
      });
      
      const imageBuffer = Buffer.from(imageResponse.data);
      
      if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error('Empty image response');
      }
      
      const maxImageSize = 5 * 1024 * 1024;
      if (imageBuffer.length > maxImageSize) {
        throw new Error(`Image too large: ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB (max 5MB)`);
      }
      
      const contentType = imageResponse.headers['content-type'] || '';
      let extension = 'jpg';
      if (contentType.includes('png')) {
        extension = 'png';
      } else if (contentType.includes('jpeg')) {
        extension = 'jpg';
      } else if (imageUrl.match(/\.(png|jpg|jpeg)$/i)) {
        const match = imageUrl.match(/\.(png|jpg|jpeg)$/i);
        extension = match[1].toLowerCase();
      }
      
      const tempDir = getTempDir();
      const timestamp = Date.now();
      const tempImagePath = path.join(tempDir, `hwaifu_${timestamp}.${extension}`);
      
      let finalBuffer = null;
      
      try {
        fs.writeFileSync(tempImagePath, imageBuffer);
        finalBuffer = fs.readFileSync(tempImagePath);
        
        if (!finalBuffer || finalBuffer.length === 0) {
          throw new Error('Failed to read image from temp file');
        }
        
        await sock.sendMessage(extra.from, {
          image: finalBuffer
        }, { quoted: msg });
        
      } finally {
        try {
          deleteTempFile(tempImagePath);
        } catch (cleanupError) {
        }
      }
      
    } catch (error) {
      console.error('Error in hwaifu command:', error);
      
      if (error.response?.status === 404) {
        await extra.reply('❌ image not found — try again');
      } else if (error.response?.status === 429) {
        await extra.reply('❌ rate limit — try again later');
      } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        await extra.reply('❌ timed out — try again');
      } else {
        await extra.reply(`❌ Failed to fetch hwaifu image: ${error.message}`);
      }
    }
  }
};

