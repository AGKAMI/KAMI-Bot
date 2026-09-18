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
    let digits = number.replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '27' + digits.slice(1);
    const targetJid = digits + '@s.whatsapp.net';
    try { await sock.updateBlockStatus(targetJid, 'unblock'); } catch (e) {}

    // DM them the approval message
    try {
      await sock.sendMessage(targetJid, {
        text: `✅ *YOU HAVE BEEN APPROVED BY KAMI* 🤖\n\n` +
              `You can now use the bot. Send *.menu* to see all commands.\n\n` +
              `_Enjoy, ${pick(SLANG.good)}!_`
      });
    } catch (e) {}

    await sock.sendMessage(extra.from, {
      text: added
        ? `${bold('✅ APPROVED')}\n\n_${number} can now use the bot in DMs._`
        : `${bold('⚠️ ALREADY APPROVED')}\n\n_${number} is already approved._`
    }, { quoted: msg });
  }
};
