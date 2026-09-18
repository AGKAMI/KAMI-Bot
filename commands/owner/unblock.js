/**
 * Unblock Command - Unblock a user
 */

const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'unblock',
  aliases: [],
  category: 'owner',
  description: 'Unblock a user',
  usage: '.unblock @user or reply',
  ownerOnly: true,
  
  async execute(sock, msg, args, extra) {
    try {
      let target;
      
      // .unblock me — unblock the sender
      if (args[0] && args[0].toLowerCase() === 'me') {
        target = extra.sender;
      } else {
        const ctx = msg.message?.extendedTextMessage?.contextInfo;
        const mentioned = ctx?.mentionedJid || [];
        
        if (mentioned && mentioned.length > 0) {
          target = mentioned[0];
        } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
          target = ctx.participant;
        } else {
          return extra.reply(`${bold(pick(SLANG.error))} — tag or reply to the oke you wanna unblock\n\nor use: .unblock me`);
        }
      }
      
      await sock.updateBlockStatus(target, 'unblock');
      
      await sock.sendMessage(extra.from, {
        text: `${bold('✅ UNBLOCKED')}\n\n@${target.split('@')[0]} _has been unblocked, ${pick(SLANG.good)}!_`,
        mentions: [target]
      }, { quoted: msg });
      
    } catch (error) {
      await extra.reply(`_${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};
