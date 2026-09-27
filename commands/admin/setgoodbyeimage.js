/**
 * SetGoodbyeImage - Set custom goodbye image
 */

const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');

module.exports = {
  name: 'setgoodbyeimage',
  reactions: { received: '🖼️', generating: '🎨', done: '🌙' },
  aliases: ['setgoodbyeimg'],
  category: 'admin',
  description: 'Set a custom goodbye image (reply to an image/sticker)',
  usage: '.setgoodbyeimage (reply to image)',
  groupOnly: true,
  ownerOnly: true, adminOnly: false,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      if (!ctx?.quotedMessage) {
        return extra.reply(`*SET GOODBYE IMAGE*\n\n_Reply to an image or sticker to use as the goodbye image_`);
      }

      const quotedMsg = ctx.quotedMessage;
      if (!quotedMsg.imageMessage && !quotedMsg.stickerMessage) {
        return extra.reply(`_${voice.openErr()} — reply with an image or sticker_`);
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
        return extra.reply(`_${voice.openErr()} — couldn't download the image_`);
      }

      let finalBuffer = mediaBuffer;
      if (quotedMsg.stickerMessage) {
        const sharp = require('sharp');
        finalBuffer = await sharp(mediaBuffer).jpeg({ quality: 90 }).toBuffer();
      }

      const groupJid = extra.from.replace(/[^a-zA-Z0-9]/g, '_');
      const imagesDir = path.join(__dirname, '../../utils/images/goodbye');
      if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
      const imagePath = path.join(imagesDir, `${groupJid}.jpg`);
      fs.writeFileSync(imagePath, finalBuffer);

      await extra.reply(`*✅ GOODBYE IMAGE UPDATED*\n\n_${voice.lead('affirm')}, members who leave will see this image_`);
    } catch (error) {
      console.error('SetGoodbyeImage error:', error);
      await extra.reply(`_${voice.openErr()} — ${error.message}_`);
    }
  }
};
