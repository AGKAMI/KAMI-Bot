/**
 * Block Command - Block a user
 */

const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'block',
  aliases: [],
  category: 'owner',
  description: 'Block a user',
  usage: '.block @user or reply',
  ownerOnly: true,
  
  async execute(sock, msg, args, extra) {
    try {
      let target;
      
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      
      if (mentioned && mentioned.length > 0) {
        target = mentioned[0];
      } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
        target = ctx.participant;
      } else {
        return extra.reply(`${bold(pick(SLANG.error))} — tag or reply to the oke you wanna block`);
      }
      
      await sock.updateBlockStatus(target, 'block');
      
      await sock.sendMessage(extra.from, {
        text: `${bold('✅ BLOCKED')}\n\n@${target.split('@')[0]} _has been blocked, ${pick(SLANG.good)}!_`,
        mentions: [target]
      }, { quoted: msg });
      
    } catch (error) {
      await extra.reply(`_${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};
