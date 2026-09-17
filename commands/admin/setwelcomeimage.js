/**
 * SetWelcomeImage - Set custom welcome image
 */

const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'setwelcomeimage',
  aliases: ['setwelcomeimg'],
  category: 'admin',
  description: 'Set custom welcome image (reply to image/sticker)',
  usage: '.setwelcomeimage (reply to image)',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      if (!ctx?.quotedMessage) {
        return extra.reply(`${bold('SET WELCOME IMAGE')}\n\n_Reply to an image or sticker to set as welcome image_`);
      }

      const quotedMsg = ctx.quotedMessage;
      if (!quotedMsg.imageMessage && !quotedMsg.stickerMessage) {
        return extra.reply(`_${pick(SLANG.error)} — need an image or sticker in the reply_`);
      }

      const targetMessage = {
        key: {
          remoteJid: extra.from,
          id: ctx.stanzaId,
          participant: ctx.participant,
        },
        message: quotedMsg,
      };

      const mediaBuffer = await downloadMediaMessage(
        targetMessage, 'buffer', {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage }
      );

      if (!mediaBuffer) {
        return extra.reply(`_${pick(SLANG.error)} — couldn't download the image_`);
      }

      let finalBuffer = mediaBuffer;
      if (quotedMsg.stickerMessage) {
        const sharp = require('sharp');
        finalBuffer = await sharp(mediaBuffer).jpeg({ quality: 90 }).toBuffer();
      }

      const imagePath = path.join(__dirname, '../../utils/welcome_image.jpg');
      fs.writeFileSync(imagePath, finalBuffer);

      await extra.reply(`${bold('✅ WELCOME IMAGE UPDATED')}\n\n_${pick(SLANG.good)}, new members will see this image_`);
    } catch (error) {
      console.error('SetWelcomeImage error:', error);
      await extra.reply(`_${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};
