/**
 * Approve Command - Shortcut for .dmblocker approve
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

const parseNumber = (input) => {
  if (!input) return null;
  let digits = input.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  if (digits.startsWith('0')) digits = '27' + digits.slice(1);
  return digits;
};

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

    const digits = parseNumber(number);
    if (!digits) return extra.reply(`${bold(pick(SLANG.error))} — invalid number`);
    const targetJid = digits + '@s.whatsapp.net';

    // Add to approved list
    const added = database.addApprovedNumber(number);

    // WhatsApp-unblock if blocked
    let wasBlocked = false;
    try {
      await sock.updateBlockStatus(targetJid, 'unblock');
      wasBlocked = true;
    } catch (e) {}

    // Unban if banned
    let wasBanned = false;
    const user = database.getUser(targetJid);
    if (user.banned) {
      database.updateUser(targetJid, { banned: false, bannedIn: null });
      wasBanned = true;
    }

    // DM them the approval message
    try {
      await sock.sendMessage(targetJid, {
        text: `✅ *YOU HAVE BEEN APPROVED BY KAMI* 🤖\n\n` +
              `You can now use the bot. Send *.menu* to see all commands.\n\n` +
              `_Enjoy, ${pick(SLANG.good)}!_`
      });
    } catch (e) {}

    // Confirm in chat with details
    let reply = added
      ? `${bold('✅ APPROVED')}\n\n_${digits} can now use the bot in DMs._`
      : `${bold('⚠️ ALREADY APPROVED')}\n\n_${digits} is already approved._`;

    if (wasBlocked) {
      reply += `\n\n🔓 *UNBLOCKED* — removed from WhatsApp block list`;
    }
    if (wasBanned) {
      reply += `\n\n🔨 *BAN LIFTED* — removed from bot ban list`;
    }

    await sock.sendMessage(extra.from, { text: reply }, { quoted: msg });
  }
};
