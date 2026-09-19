/**
 * Block Command - Block a user
 */

const { bold, pick, SLANG } = require('../../utils/format');

const parsePhoneNumber = (input) => {
  if (!input) return null;
  // Strip everything except digits
  let digits = input.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  // Convert leading 0 to 27 (South Africa)
  if (digits.startsWith('0')) digits = '27' + digits.slice(1);
  return digits + '@s.whatsapp.net';
};

module.exports = {
  name: 'block',
  aliases: [],
  category: 'owner',
  description: 'Block a user',
  usage: '.block @user/reply OR .block 27833882383',
  ownerOnly: true,
  
  async execute(sock, msg, args, extra) {
    try {
      let target;
      
      // .block <phone number>
      const rawArg = args.join(' ');
      if (rawArg && /\d/.test(rawArg)) {
        target = parsePhoneNumber(rawArg);
        if (!target) {
          return extra.reply(`❌ ERROR\n\n_Invalid number, ${pick(SLANG.friend)}_`);
        }
      } else {
        // Tag or reply
        const ctx = msg.message?.extendedTextMessage?.contextInfo;
        const mentioned = ctx?.mentionedJid || [];
        
        if (mentioned && mentioned.length > 0) {
          target = mentioned[0];
        } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
          target = ctx.participant;
        } else {
          return extra.reply(`❌ ERROR\n\n_Tag, reply, or add a number_\n\n_Example: .block 27833882383_`);
        }
      }
      
      await sock.updateBlockStatus(target, 'block');
      
      await sock.sendMessage(extra.from, {
        text: `*✅ BLOCKED*\n\n@${target.split('@')[0]} _has been blocked, ${pick(SLANG.good)}!_`,
        mentions: [target]
      }, { quoted: msg });
      
    } catch (error) {
      await extra.reply(`_${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};
