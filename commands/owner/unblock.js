/**
 * Unblock Command - Unblock a user
 */

const { bold, pick, SLANG } = require('../../utils/format');

const parsePhoneNumber = (input) => {
  if (!input) return null;
  let digits = input.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  if (digits.startsWith('0')) digits = '27' + digits.slice(1);
  return digits + '@s.whatsapp.net';
};

module.exports = {
  name: 'unblock',
  aliases: [],
  category: 'owner',
  description: 'Unblock a user',
  usage: '.unblock @user/reply OR .unblock 27833882383 OR .unblock me',
  ownerOnly: true,
  
  async execute(sock, msg, args, extra) {
    try {
      let target;
      
      // .unblock me — unblock the sender
      if (args[0] && args[0].toLowerCase() === 'me') {
        target = extra.sender;
      } else {
        // .unblock <phone number>
        const rawArg = args.join(' ');
        if (rawArg && /\d/.test(rawArg)) {
          target = parsePhoneNumber(rawArg);
          if (!target) {
            return extra.reply(`❌ ERROR\n\n_Invalid number_`);
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
            return extra.reply(`❌ ERROR\n\n_Tag, reply, or add a number_\n\n_Examples:_\n.unblock 27833882383\n.unblock 083 388 2383\n.unblock me`);
          }
        }
      }
      
      await sock.updateBlockStatus(target, 'unblock');
      
      await sock.sendMessage(extra.from, {
        text: `*✅ UNBLOCKED*\n\n@${target.split('@')[0]} _has been unblocked, ${pick(SLANG.good)}!_`,
        mentions: [target]
      }, { quoted: msg });
      
    } catch (error) {
      await extra.reply(`_${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};
