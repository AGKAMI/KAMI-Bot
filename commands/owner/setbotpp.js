const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getTempDir, deleteTempFile } = require('../../utils/tempManager');
const { bold, italic, pick, SLANG } = require('../../utils/format');

// Max file size: 10MB for profile pictures
const MAX_FILE_SIZE = 10 * 1024 * 1024;

module.exports = {
  name: 'setbotpp',
  aliases: ['setppbot', 'setpp'],
  category: 'owner',
  description: 'Set bot profile picture from image or sticker',
  usage: '.setbotpp (reply to image or sticker)',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      // Check if message is a reply
      const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quotedMessage) {
        return extra.reply(`${bold('📷 SET BOT PP')}\n\n_reply to an image or sticker with .setbotpp_`);
      }

      const imageMessage = quotedMessage.imageMessage;
      const stickerMessage = quotedMessage.stickerMessage;
      
      if (!imageMessage && !stickerMessage) {
        return extra.reply(`${bold(pick(SLANG.error))} — need an image or sticker in the reply`);
      }
      
      // Use whichever message type is available
      const mediaMessage = imageMessage || stickerMessage;

      const tmpDir = getTempDir();
      const imagePath = path.join(tmpDir, `profile_${Date.now()}.jpg`);
      
      try {
        // Download the media (image or sticker)
        const stream = await downloadContentFromMessage(mediaMessage, 'image');
        let buffer = Buffer.from([]);
        
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk]);
        }

        // Check file size
        if (buffer.length > MAX_FILE_SIZE) {
          return extra.reply(`${bold(pick(SLANG.error))} — file too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB (max: ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
        }
        
        // Save the image
        fs.writeFileSync(imagePath, buffer);

        // Set the profile picture
        await sock.updateProfilePicture(sock.user.id.split(':')[0] + '@s.whatsapp.net', { url: imagePath });

        await extra.reply(`${bold('✅ PROFILE PIC UPDATED')}\n\n_${pick(SLANG.good)}, bot profile pic is updated_`);
      } catch (error) {
        console.error('setbotpp error:', error);
        extra.reply(`_${pick(SLANG.error)} — couldn't update profile pic_`);
      } finally {
        // Always cleanup temp file
        deleteTempFile(imagePath);
      }
    } catch (error) {
      console.error('setbotpp error:', error);
      extra.reply(`_${pick(SLANG.error)} — couldn't update profile pic_`);
    }
  }
};