/**
 * Approve Command - Shortcut for .dmblocker approve
 */

const database = require('../../database');
const config = require('../../config');
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

  const prefix = config.prefix || '.';
    const number = args.join(' ');
    if (!number || !/\d/.test(number)) {
      return extra.reply(`*Usage:* ${prefix}approve <number>\n\n_Example: ${prefix}approve 27833882383_`);
    }

    const digits = parseNumber(number);
    if (!digits) return extra.reply(`❌ ERROR\n\n_Invalid number_`);
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
        text: `🎉 *WELCOME TO KAMI BOT* 🤖\n\n` +
              `✅ You have been *approved* by KAMI\n` +
              `🔓 You can now message this bot directly\n\n` +
              `Send *${prefix}menu* to see all available commands\n` +
              `Type *${prefix}help* if you need assistance\n\n` +
              `_Lekke, enjoy the bot!_ 💀`
      });
    } catch (e) {}

    // Confirm in chat with details
    let reply = added
      ? `*✅ APPROVED*\n\n_${digits} can now use the bot in DMs._`
      : `*⚠️ ALREADY APPROVED*\n\n_${digits} is already approved._`;

    if (wasBlocked) {
      reply += `\n\n🔓 *UNBLOCKED* — removed from WhatsApp block list`;
    }
    if (wasBanned) {
      reply += `\n\n🔨 *BAN LIFTED* — removed from bot ban list`;
    }

    await sock.sendMessage(extra.from, { text: reply }, { quoted: msg });
  }
};
