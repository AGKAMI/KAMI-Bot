/**
 * Disapprove Command - inverse of .approve: pull a number off the
 * DM-blocker's approved list (they need approval again to use the bot in DMs).
 * Accepts any number format. Owner numbers always stay approved via config —
 * we warn instead of pretending the removal stuck.
 */

const database = require('../../database');
const config = require('../../config');
const { voice } = require('../../utils/format');

const parseNumber = (input) => {
  if (!input) return null;
  let digits = input.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  if (digits.startsWith('0')) digits = (config.defaultCountryCode || '27') + digits.slice(1);
  return digits;
};

const canon = (n) => {
  let digits = String(n == null ? '' : n).replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length >= 8) digits = (config.defaultCountryCode || '27') + digits.slice(1);
  return digits;
};

module.exports = {
  name: 'disapprove',
  reactions: { received: '👎', done: '✅' },
  aliases: ['unapprove'],
  category: 'owner',
  description: 'Remove a number from the approved list (inverse of .approve)',
  usage: '.disapprove <number — any format>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    const number = (args || []).join(' ').trim();
    if (!number || !/\d/.test(number)) {
      extra.fail();
      return extra.reply(
        `*Usage:* ${prefix}disapprove <number>\n\n_Any format:_\n` +
        `• ${prefix}disapprove 083 388 2383\n` +
        `• ${prefix}disapprove +27 83 388 2383\n` +
        `• ${prefix}disapprove 27833882383`
      );
    }

    try {
      const digits = parseNumber(number);
      if (!digits) { extra.fail(); return extra.reply(`❌ ERROR\n\n_Invalid number_`); }

      const removed = database.removeApprovedNumber(digits);

      // config.ownerNumber entries are often local 083… format — compare canonically
      const isOwnerNum = (config.ownerNumber || []).some(n => canon(n) === digits);

      let reply;
      if (removed) {
        reply = `*❌ DISAPPROVED*\n\n_${digits} needs approval before they can use the bot in DMs again._`;
      } else {
        extra.fail();
        reply = `*⚠️ NOT ON THE LIST*\n\n_${digits} wasn't approved._`;
      }

      if (isOwnerNum) {
        reply += `\n\n👑 _That's an owner number — owner numbers stay approved via config, so it'll keep working._`;
      }

      console.log(`[DISAPPROVE] ${digits} removed=${!!removed} ownerNum=${isOwnerNum}`);
      await sock.sendMessage(extra.from, { text: reply }, { quoted: msg });
    } catch (error) {
      extra.fail();
      console.error('[DISAPPROVE] error:', error);
      await extra.reply(`❌ ERROR\n\n${voice.openErr()} — couldn't disapprove that number`);
    }
  },
};
