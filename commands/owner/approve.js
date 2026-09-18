/**
 * Approve Command - Shortcut for .dmblocker approve
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'approve',
  aliases: [],
  category: 'owner',
  description: 'Approve a number to bypass DM blocker',
  usage: '.approve <number>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const number = args.join(' ');
    if (!number || !/\d/.test(number)) {
      return extra.reply(`${bold('Usage:')} .approve <number>\n\n_Example: .approve 27833882383_`);
    }

    const added = database.addApprovedNumber(number);

    // Also WhatsApp-unblock them if they were blocked
    try {
      let digits = number.replace(/\D/g, '');
      if (digits.startsWith('0')) digits = '27' + digits.slice(1);
      await sock.updateBlockStatus(digits + '@s.whatsapp.net', 'unblock');
    } catch (e) {}

    await sock.sendMessage(extra.from, {
      text: added
        ? `${bold('✅ APPROVED')}\n\n_${number} can now use the bot in DMs._`
        : `${bold('⚠️ ALREADY APPROVED')}\n\n_${number} is already approved._`
    }, { quoted: msg });
  }
};
