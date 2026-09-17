/**
 * Block Command - Block a user
 */

module.exports = {
  name: 'block',
  aliases: [],
  category: 'owner',
  description: 'Block a user',
  usage: '.block @user or reply',
  ownerOnly: true,
  
  async execute(sock, msg, args, extra) {
    try {
      const { bold, italic, pick, SLANG } = require('../../utils/format');
      let target;
      
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      
      if (mentioned && mentioned.length > 0) {
        target = mentioned[0];
      } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
        target = ctx.participant;
      } else {
        return extra.reply('❌ _moegoe, tag or reply to the oke you wanna block_');
      }
      
      await sock.updateBlockStatus(target, 'block');
      
      await sock.sendMessage(extra.from, {
        text: `✅ @${target.split('@')[0]} _has been blocked, lekke_!`,
        mentions: [target]
      }, { quoted: msg });
      
    } catch (error) {
      await extra.reply(`❌ _moegoe, ${error.message}_`);
    }
  }
};
