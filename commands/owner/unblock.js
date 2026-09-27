/**
 * Unblock Command - Unblock a user
 */

const config = require('../../config');
const { bold, pick, SLANG, voice } = require('../../utils/format');
const { updateBlockStatusSafe, mentionJid } = require('../../utils/jidHelper');

const parsePhoneNumber = (input) => {
  if (!input) return null;
  let digits = input.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  if (digits.startsWith('0')) digits = (config.defaultCountryCode || '27') + digits.slice(1);
  return digits + '@s.whatsapp.net';
};

module.exports = {
  name: 'unblock',
  reactions: { received: '⭕', done: '🔓' },
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
            return extra.reply(`❌ ERROR\n\n_Tag, reply, or drop a number_\n\n_Examples:_\n.unblock 27833882383\n.unblock 083 388 2383\n.unblock me`);
          }
        }
      }

      // Unblock directly — fetchBlocklist is unreliable.
      // Mentions can arrive as LID digits on the wrong server; try each variant.
      await updateBlockStatusSafe(sock, target, 'unblock');

      // Real number when the target arrived as LID digits (used for the DM too)
      const shown = mentionJid(target);

      // Confirmation to owner
      await sock.sendMessage(extra.from, {
        text: `*✅ UNBLOCKED*\n\n@${shown.split('@')[0]} _has been unblocked, ${voice.tag('affirm')}!_`,
        mentions: [shown]
      }, { quoted: msg });

      // DM the unblocked user
      try {
        await sock.sendMessage(shown, {
          text:
            `━━━━━━━━━━━━━━━━\n` +
            `*KAMI UNLOCKED YOU* 🔓\n` +
            `━━━━━━━━━━━━━━━━\n\n` +
            `${voice.greetOpen()}, ${voice.mate()}\n\n` +
            `_You were blocked but you're free now_`
        });
      } catch (dmErr) {
        console.error('[UNBLOCK] DM to unblocked user failed:', dmErr.message);
      }
      
    } catch (error) {
      extra.fail();
      await extra.reply(`❌ *ERROR*\n💡 ${voice.openErr()} — couldn't unblock them: ${error.message}`);
    }
  }
};
