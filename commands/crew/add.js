/**
 * Crew Add Command — Add member to Slammed Society roster
 * Supports: @mention OR phone number (any format)
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

const ROLE_EMOJIS = {
  'leader': '👑',
  'co-leader': '⭐',
  'officer': '🎖️',
  'member': '👤',
};

// Convert phone number to WhatsApp JID
function phoneToJid(phone) {
  if (!phone) return null;
  // Already a JID
  if (phone.includes('@s.whatsapp.net')) return phone;
  // Strip non-digits
  let digits = phone.replace(/\D/g, '');
  // Handle leading 0 → South Africa country code (27)
  if (digits.startsWith('0') && digits.length >= 10) {
    digits = '27' + digits.slice(1);
  }
  // Must be at least 10 digits (SA format: 27xxxxxxxxx)
  if (digits.length < 10) return null;
  return digits + '@s.whatsapp.net';
}

module.exports = {
  name: 'add',
  aliases: ['join'],
  category: 'crew',
  description: 'Add member to crew roster',
  usage: '.crew add @user|number <role>',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      let target = null;

      // Method 1: @mention
      if (mentioned.length > 0) {
        target = mentioned[0];
      }
      // Method 2: phone number in args
      else if (args.length > 0) {
        const firstArg = args[0];
        // Check if it looks like a phone number (digits, +, spaces)
        if (/^[\d+\s()-]+$/.test(firstArg)) {
          target = phoneToJid(firstArg);
          if (!target) {
            return extra.reply(
              `❌ ERROR\n\nInvalid phone number\n\n` +
              `Examples:\n` +
              `• 0833882383\n` +
              `• +27833882383\n` +
              `• 27833882383`
            );
          }
          // Remove phone from args so role parsing works
          args = args.slice(1);
        }
      }

      if (!target) {
        return extra.reply(
          `❌ ERROR\n\nTag or add a number ${pick(SLANG.friend)}\n\n` +
          `Usage:\n` +
          `• .crew add @user <role>\n` +
          `• .crew add 0833882383 <role>\n` +
          `• .crew add +27833882383 <role>\n\n` +
          `Roles: leader, co-leader, officer, member`
        );
      }

      const targetNum = target.split('@')[0];

      // Check if already in crew
      const existing = database.getCrewMember(extra.from, target);
      if (existing) {
        return extra.reply(
          `❌ ERROR\n\n@${targetNum} is already in the crew\n` +
          `Role: ${ROLE_EMOJIS[existing.role] || '👤'} ${existing.role}`
        );
      }

      // Parse role (default: member)
      let role = 'member';
      if (args.length >= 1) {
        role = args[0].toLowerCase();
        const validRoles = ['leader', 'co-leader', 'officer', 'member'];
        if (!validRoles.includes(role)) {
          return extra.reply(
            `❌ ERROR\n\nInvalid role\nValid: ${validRoles.join(', ')}`
          );
        }
      }

      // Save to database
      database.addCrewMember(extra.from, target, {
        role,
        joined: Date.now(),
        addedBy: extra.sender,
      });

      const roleEmoji = ROLE_EMOJIS[role] || '👤';

      await sock.sendMessage(extra.from, {
        text:
          `✅ SUCCESS\n\n` +
          `👤 MEMBER ADDED\n\n` +
          `${roleEmoji} @${targetNum} has been added\n\n` +
          `🏷️ Role: ${bold(role)}\n` +
          `📅 Joined: ${new Date().toLocaleDateString('en-ZA')}`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew add error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't add member`);
    }
  },
};
