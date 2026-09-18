/**
 * Ban Command - Ban a user from using the bot (groups + DMs)
 * Sends ban message then WhatsApp-blocks them
 */

const config = require('../../config');
const { bold, pick, SLANG } = require('../../utils/format');

const parseNumber = (input) => {
  if (!input) return null;
  let digits = input.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  if (digits.startsWith('0')) digits = '27' + digits.slice(1);
  return digits + '@s.whatsapp.net';
};

module.exports = {
  name: 'ban',
  aliases: [],
  category: 'admin',
  description: 'Ban a user from the bot',
  usage: '.ban @user/reply/number',
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const { from, sender, isGroup } = extra;
      let target;

      const rawArg = args.join(' ');
      if (rawArg && /\d/.test(rawArg)) {
        target = parseNumber(rawArg);
        if (!target) return extra.reply(`${bold(pick(SLANG.error))} — invalid number`);
      } else {
        const ctx = msg.message?.extendedTextMessage?.contextInfo;
        const mentioned = ctx?.mentionedJid || [];
        if (mentioned.length > 0) {
          target = mentioned[0];
        } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
          target = ctx.participant;
        } else {
          return extra.reply(`${bold(pick(SLANG.error))} — tag, reply, or add a number\n\n_Example: .ban 27833882383_`);
        }
      }

      const targetNum = target.split('@')[0].replace(/:/g, '');
      const ownerNums = (config.ownerNumber || []).map(n => n.replace(/\D/g, ''));
      if (ownerNums.includes(targetNum)) {
        return extra.reply(`${bold(pick(SLANG.error))} — can't ban the owner`);
      }
      if (target === sender) {
        return extra.reply(`${bold(pick(SLANG.error))} — can't ban yourself`);
      }

      // Send ban message first (before block so it delivers)
      await sock.sendMessage(from, {
        text: `🚫 *YOU HAVE BEEN BANNED FROM USING THIS BOT* 🤖\n\n` +
              `📲 *Message me on:* 084 082 0712\n` +
              `⚠️ *Your number will be BLOCKED after this message* ⛔🔒`,
        mentions: [target]
      });

      // WhatsApp-block them
      try {
        await sock.updateBlockStatus(target, 'block');
      } catch (e) {
        console.error('[BAN] block failed:', e.message);
      }

      // Confirm in chat
      await sock.sendMessage(from, {
        text: `${bold('🔨 BANNED')}\n\n@${target.split('@')[0]} _has been banned, ${pick(SLANG.good)}!_`,
        mentions: [target]
      }, { quoted: msg });

    } catch (error) {
      await extra.reply(`_${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};
