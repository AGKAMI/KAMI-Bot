/**
 * Unban Command - Unban a user from using bot commands in this group
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'unban',
  aliases: [],
  category: 'admin',
  description: 'Unban a user from using bot commands',
  usage: '.unban @user/reply or .unban 27833882383',
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const { from } = extra;
      let target;

      // .unban <phone number>
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
          return extra.reply(`${bold(pick(SLANG.error))} — tag, reply, or add a number\n\n_Example: .unban 27833882383_`);
        }
      }

      database.updateUser(target, { banned: false, bannedIn: null });

      await sock.sendMessage(from, {
        text: `${bold('✅ UNBANNED')}\n\n@${target.split('@')[0]} _can now use bot commands again, ${pick(SLANG.good)}!_`,
        mentions: [target]
      }, { quoted: msg });

    } catch (error) {
      await extra.reply(`_${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};
