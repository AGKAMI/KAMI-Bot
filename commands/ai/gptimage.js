/**
 * GPT Image Command
 * Edit image using GPT Vision with prompt
 */

const axios = require('axios');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { webp2png } = require('../../utils/webp2mp4');
const sharp = require('sharp');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'gptimage',
  aliases: ['gptimg', 'editimage', 'aiimage', 'vision','gi'],
  category: 'ai',
  description: 'Edit image using GPT Vision with prompt',
  usage: '.gptimage <prompt> (reply to image/sticker)',
  
  async execute(sock, msg, args, extra) {
    try {
      // Check if message is a reply
      const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
      if (!ctxInfo?.quotedMessage) {
        return await extra.reply(
          '📷 _kiff, gpt image editor_\n\n' +
          '_reply to an image or sticker with a prompt to edit it_\n\n' +
          `_Usage: ${extra.prefix || '.'}gptimage <your prompt>_\n\n` +
          '_Example: Reply to an image with:_\n' +
          `_${extra.prefix || '.'}gptimage change the background to a beach_`
        );
      }
      
      // Get prompt from args
      const prompt = args.join(' ').trim();
      if (!prompt) {
        return await extra.reply(
          `❌ _${pick(SLANG.error)} — give me a prompt hey_\n\n` +
          `_Usage: ${extra.prefix || '.'}gptimage <your prompt>_\n\n` +
          '_Example: change the background to a beach_'
        );
      }
      
      const targetMessage = {
        key: {
          remoteJid: extra.from,
          id: ctxInfo.stanzaId,
          participant: ctxInfo.participant,
        },
        message: ctxInfo.quotedMessage,
      };
      
      // Check if quoted message is an image or sticker
      const quotedMsg = ctxInfo.quotedMessage;
      const isImage = !!quotedMsg.imageMessage;
      const isSticker = !!quotedMsg.stickerMessage;
      
      if (!isImage && !isSticker) {
        return await extra.reply(`❌ _${pick(SLANG.error)} — reply to an image or sticker_`);
      }
      
      // Download media
      const mediaBuffer = await downloadMediaMessage(
        targetMessage,
        'buffer',
        {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage },
      );
      
      if (!mediaBuffer) {
        return await extra.reply(`❌ _${pick(SLANG.error)} — couldn't download the image — try again_`);
      }
      
      // Convert sticker to image if needed
      let imageBuffer = mediaBuffer;
      if (isSticker) {
        const stickerMessage = quotedMsg.stickerMessage;
        const isAnimated = stickerMessage.isAnimated || stickerMessage.mimetype?.includes('animated');
        
        if (isAnimated) {
          return await extra.reply(`❌ _${pick(SLANG.error)} — animated stickers don't work — use a static image_`);
        }
        
        // Convert webp sticker to PNG
        try {
          imageBuffer = await webp2png(mediaBuffer);
        } catch (error) {
          console.error('Error converting sticker to PNG:', error);
          return await extra.reply(`❌ _${pick(SLANG.error)} — couldn't convert sticker — try with a regular image_`);
        }
      }
      
      // Convert to JPEG if needed (API might prefer JPEG)
      // Check if it's already JPEG, if not convert
      let finalImageBuffer = imageBuffer;
      try {
        const metadata = await sharp(imageBuffer).metadata();
        if (metadata.format !== 'jpeg' && metadata.format !== 'jpg') {
          // Convert to JPEG
          finalImageBuffer = await sharp(imageBuffer)
            .jpeg({ quality: 90 })
            .toBuffer();
        }
      } catch (error) {
        // If sharp fails, use original buffer
        console.error('Error processing image with sharp:', error);
        finalImageBuffer = imageBuffer;
      }
      
      // Send loading message
      const sent = await extra.reply(`\u{1F5BC}\uFE0F _processing your image..._`);
      
      // Prepare form data
      const form = new FormData();
      form.append('image', finalImageBuffer, {
        filename: 'image.jpg',
        contentType: 'image/jpeg'
      });
      form.append('param', prompt);
      
      // Send POST request to API
      const apiUrl = 'https://api.nexray.web.id/ai/gptimage';
      
      const response = await axios.post(apiUrl, form, {
        headers: {
          ...form.getHeaders(),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        responseType: 'arraybuffer',
        timeout: 120000, // 2 minutes timeout for AI processing
        maxContentLength: 10 * 1024 * 1024, // 10MB max
      });
      
      if (!response.data) {
        return await extra.edit(sent.key, `\u274C _${pick(SLANG.error)} - no image came back - try again_`);
      }
      
      const resultImageBuffer = Buffer.from(response.data);
      
      // Validate buffer
      if (!resultImageBuffer || resultImageBuffer.length === 0) {
        return await extra.edit(sent.key, `\u274C _${pick(SLANG.error)} - empty image returned - try again_`);
      }
      
      // Check if response is actually an image (not JSON error)
      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('application/json') || resultImageBuffer[0] === 0x7B) {
        try {
          const errData = JSON.parse(resultImageBuffer.toString());
          return await extra.edit(sent.key, `\u274C _${pick(SLANG.error)} - ${errData.error || 'API returned error'}_`);
        } catch {}
        return await extra.edit(sent.key, `\u274C _${pick(SLANG.error)} - API returned non-image data_`);
      }
      
      // Check file size (WhatsApp image limit is 5MB)
      const maxImageSize = 5 * 1024 * 1024; // 5MB
      if (resultImageBuffer.length > maxImageSize) {
        return await extra.edit(sent.key,
          `\u274C _${pick(SLANG.error)} - image too large: ${(resultImageBuffer.length / 1024 / 1024).toFixed(2)}MB (max 5MB)_\n` +
          '_The API returned an image that exceeds WhatsApp limits._'
        );
      }
      
      // Send the modified image
      await sock.sendMessage(extra.from, {
        image: resultImageBuffer,
        caption: `\u2728 _kiff, here's your GPT Vision result_\n\n\u{1F4DD} Prompt: ${prompt}`
      }, { quoted: msg });
      
      await extra.edit(sent.key, `\u2728 _done! check the image above_`);
      
    } catch (error) {
      console.error('Error in gptimage command:', error);
      
      if (error.response) {
        // API error
        const status = error.response.status;
        if (status === 400) {
          return await extra.reply(`❌ _${pick(SLANG.error)} — bad request — check your prompt and image_`);
        } else if (status === 429) {
          return await extra.reply(`❌ _${pick(SLANG.error)} — rate limit hit — try again later_`);
        } else if (status === 500) {
          return await extra.reply(`❌ _${pick(SLANG.error)} — server error — try again later_`);
        }
      }
      
      if (error.code === 'ECONNABORTED') {
        return await extra.reply(`❌ _${pick(SLANG.error)} — request timed out — try again_`);
      }
      
      return await extra.reply(`❌ _${pick(SLANG.error)} — ${error.message || 'something went stukkend'}_`);
    }
  },
};

