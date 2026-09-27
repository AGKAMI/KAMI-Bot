/**
 * Set Group Profile Picture Command
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { bold, pick, SLANG, mention, voice } = require('../../utils/format');
const database = require('../../database');

const config = require('../../config');
module.exports = {
  name: 'setgrouppp',
  reactions: { received: '📸', generating: '📐', done: '🖼️' },
  aliases: ['setgrouppic', 'grouppp', 'setpp'],
  category: 'admin',
  description: 'Set group profile picture (reply to an image)',
  usage: '.setgrouppp (reply to an image)',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const { from } = extra;

      const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
      if (!ctxInfo?.quotedMessage) {
        const text = [
          `❌ *ERROR*`,
          '',
          `💡 Reply to an image with ${prefix}setgrouppp`,
          `_Make sure the replied message is a photo, ${voice.tag('neutral')}_`
        ].join('\n');
        return await extra.reply(text);
      }

      const quotedMsg = ctxInfo.quotedMessage;
      if (!quotedMsg.imageMessage) {
        extra.fail();
        return await extra.reply(`❌ *ERROR*\n\nYou need to reply to a *photo* — not that type of message`);
      }

      const settings = database.getGroupSettings(from);
      if (settings.lock) {
        const text = [
          `🔒 *GROUP LOCKED*`,
          '',
          `- This group is locked, ${voice.tag('err')}`,
          `- Only admins can unlock it with .unlock`
        ].join('\n');
        return await extra.reply(text);
      }

      await extra.reply(`⏳ Downloading image...`);

      const targetMessage = {
        key: {
          remoteJid: from,
          id: ctxInfo.stanzaId,
          participant: ctxInfo.participant,
        },
        message: quotedMsg,
      };

      const mediaBuffer = await downloadMediaMessage(
        targetMessage,
        'buffer',
        {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage }
      );

      if (!mediaBuffer) {
        extra.fail();
        return await extra.reply(`❌ *ERROR*\n\n${voice.openErr()} — couldn't download the image, try again`);
      }

      await sock.updateProfilePicture(from, mediaBuffer);

      const text = [
        `✅ *PROFILE PICTURE UPDATED*`,
        '',
        `- 🖼️ ${bold('New profile picture set')}`,
        `- 👤 ${bold('Changed by')} ${mention(extra.sender)}`,
        "",
        `_${voice.lead('affirm')} — group looking fresh, ${voice.tag('affirm')}_`
      ].join('\n');

      await sock.sendMessage(from, { text, mentions: [extra.sender] }, { quoted: msg });

    } catch (error) {
      console.error('SetGroupPP Error:', error);
      extra.fail();
      await extra.reply(`❌ *ERROR*\n\n${voice.openErr()} — ${error.message}`);
    }
  }
};
