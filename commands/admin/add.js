/**
 * Add Command — add a user (any phone number format) to this WhatsApp group.
 * Usage: .add <number>
 */

const config = require('../../config');
const { pick, SLANG, mention } = require('../../utils/format');

function phoneToJid(phone) {
  if (!phone) return null;
  if (phone.includes('@s.whatsapp.net')) return phone;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length >= 10) {
    digits = '27' + digits.slice(1);
  }
  if (digits.length < 10) return null;
  return digits + '@s.whatsapp.net';
}

module.exports = {
  name: 'add',
  category: 'admin',
  description: 'Add a number to this group',
  usage: '.add <number>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      if (!args || args.length === 0) {
        return extra.reply(
          `❌ ERROR\n\nProvide a number\n\nUsage: ${prefix}add <number>\n\n` +
          `Examples:\n` +
          `• ${prefix}add 0833882383\n` +
          `• ${prefix}add +27 83 388 2383\n` +
          `• ${prefix}add 27833882383`
        );
      }

      // Collect all phone-like args (handles split formats like +27 83 388 2383)
      const phoneParts = [];
      for (const arg of args) {
        if (/^[\d+\s()-]+$/.test(arg)) {
          phoneParts.push(arg);
        } else {
          break;
        }
      }
      const fullPhone = phoneParts.join(' ');
      const target = phoneToJid(fullPhone);

      if (!target) {
        return extra.reply(`❌ ERROR\n\nInvalid phone number: ${fullPhone}`);
      }

      await sock.groupParticipantsUpdate(extra.from, [target], 'add');

      await sock.sendMessage(extra.from, {
        text: `✅ SUCCESS\n\n➕ ADDED\n\n${mention(target)} has been added to the group`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Add error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't add them`);
    }
  },
};