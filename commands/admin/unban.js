/**
 * Unban Command - Unban a user (groups + DMs)
 * WhatsApp-unblocks them
 */

const config = require('../../config');
const { pick, SLANG, mention } = require('../../utils/format');

const parseNumber = (input) => {
  if (!input) return null;
  let digits = input.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  if (digits.startsWith('0')) digits = '27' + digits.slice(1);
  return digits + '@s.whatsapp.net';
};

module.exports = {
  name: 'unban',
  aliases: [],
  category: 'admin',
  description: 'Unban a user from the bot',
  usage: '.unban @user/reply/number or .unban me',
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    const prefix = config.prefix || '.';
    try {
      const { from, sender } = extra;
      let target;

      if (args[0] && args[0].toLowerCase() === 'me') {
        target = sender;
      } else {
        const rawArg = args.join(' ');
        if (rawArg && /\d/.test(rawArg)) {
          target = parseNumber(rawArg);
          if (!target) return extra.reply(`❌ ERROR\n\n_Invalid number_`);
        } else {
          const ctx = msg.message?.extendedTextMessage?.contextInfo;
          const mentioned = ctx?.mentionedJid || [];
          if (mentioned.length > 0) {
            target = mentioned[0];
          } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
            target = ctx.participant;
          } else {
            return extra.reply(`❌ ERROR\n\n_Tag, reply, or add a number_\n\n_Examples:_\n${prefix}unban 27833882383\n${prefix}unban me`);
          }
        }
      }

      // WhatsApp-unblock them
      try {
        await sock.updateBlockStatus(target, 'unblock');
      } catch (e) {
        console.error('[UNBAN] unblock failed:', e.message);
      }

      await sock.sendMessage(from, {
        text: `✅ *UNBANNED*\n\n${mention(target)} _has been unbanned, ${pick(SLANG.good)}!_`,
        mentions: [target]
      }, { quoted: msg });

    } catch (error) {
      await extra.reply(`❌ ERROR\n\n_${error.message}_`);
    }
  }
};
