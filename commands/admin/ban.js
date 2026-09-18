/**
 * Ban Command - Ban a user from using bot commands in this group
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'ban',
  aliases: [],
  category: 'admin',
  description: 'Ban a user from using bot commands',
  usage: '.ban @user/reply or .ban 27833882383',
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const { from, sender } = extra;
      let target;

      const rawArg = args.join(' ');
      if (rawArg && /\d/.test(rawArg)) {
        let digits = rawArg.replace(/\D/g, '');
        if (!digits || digits.length < 8) {
          return extra.reply(`${bold(pick(SLANG.error))} — invalid number`);
        }
        if (digits.startsWith('0')) digits = '27' + digits.slice(1);
        target = digits + '@s.whatsapp.net';
      } else {
        const ctx = msg.message?.extendedTextMessage?.contextInfo;
        const mentioned = ctx?.mentionedJid || [];

        if (mentioned && mentioned.length > 0) {
          target = mentioned[0];
        } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
          target = ctx.participant;
        } else {
          return extra.reply(`${bold(pick(SLANG.error))} — tag, reply, or add a number\n\n_Example: .ban 27833882383_`);
        }
      }

      // Can't ban owners
      const targetNum = target.split('@')[0].replace(/:/g, '');
      const ownerNums = (config.ownerNumber || []).map(n => n.replace(/\D/g, ''));
      if (ownerNums.includes(targetNum)) {
        return extra.reply(`${bold(pick(SLANG.error))} — can't ban the owner, ${pick(SLANG.friend)}`);
      }

      // Can't ban yourself
      if (target === sender) {
        return extra.reply(`${bold(pick(SLANG.error))} — can't ban yourself`);
      }

      database.updateUser(target, { banned: true, bannedIn: from });

      await sock.sendMessage(from, {
        text: `${bold('✅ BANNED')}\n\n@${target.split('@')[0]} _can no longer use bot commands in this group, ${pick(SLANG.good)}!_`,
        mentions: [target]
      }, { quoted: msg });

    } catch (error) {
      await extra.reply(`_${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};
