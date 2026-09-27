/**
 * Block Command - Block a user
 */

const config = require('../../config');
const { bold, pick, SLANG, voice } = require('../../utils/format');
const { updateBlockStatusSafe, mentionJid } = require('../../utils/jidHelper');

const parsePhoneNumber = (input) => {
  if (!input) return null;
  // Strip everything except digits
  let digits = input.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  // Convert leading 0 to default country code
  if (digits.startsWith('0')) digits = (config.defaultCountryCode || '27') + digits.slice(1);
  return digits + '@s.whatsapp.net';
};

module.exports = {
  name: 'block',
  reactions: { received: '🚫', done: '🔒' },
  aliases: [],
  category: 'owner',
  description: 'Block a user',
  usage: '.block @user/reply OR .block 27833882383',
  ownerOnly: true,
  
  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      let target;
      
      // .block <phone number>
      const rawArg = args.join(' ');
      if (rawArg && /\d/.test(rawArg)) {
        target = parsePhoneNumber(rawArg);
        if (!target) {
          extra.fail();
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
          extra.fail();
          return extra.reply(`❌ ERROR\n\n_Tag, reply, or drop a number_\n\n_Example: ${prefix}block 27833882383_`);
        }
      }
      
      await updateBlockStatusSafe(sock, target, 'block');

      // Show the real number when the target arrived as LID digits
      const shown = mentionJid(target);
      await sock.sendMessage(extra.from, {
        text: `*✅ BLOCKED*\n\n@${shown.split('@')[0]} _has been blocked, ${voice.tag('affirm')}!_`,
        mentions: [shown]
      }, { quoted: msg });

    } catch (error) {
      extra.fail();
      await extra.reply(`❌ *ERROR*\n💡 ${voice.openErr()} — couldn't block them: ${error.message}`);
    }
  }
};
