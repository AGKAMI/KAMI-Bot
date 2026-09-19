/**
 * Crew Add Command — Add member to Slammed Society roster + WhatsApp group
 * Supports: @mention OR phone number
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');
const { resolveUser } = require('./crewHelpers');

const ROLE_EMOJIS = {
  'leader': '👑',
  'co-leader': '⭐',
  'officer': '🎖️',
  'member': '👤',
};

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
  subName: 'add',
  name: null,
  aliases: ['join'],
  category: 'crew',
  description: 'Add member to crew roster + WhatsApp group',
  usage: '.crew add @user|number [role]',
  groupOnly: false,
  ownerOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      let target = null;

      // Method 1: Reply to someone's message
      if (ctx?.participant) {
        target = ctx.participant;
      }
      // Method 2: @mention
      else if (mentioned.length > 0) {
        target = mentioned[0];
      }
      // Method 3: phone number (may be split across multiple args like +27 64 841 5504)
      else if (args.length > 0 && /^[\d+\s()-]+$/.test(args[0])) {
        // Collect all phone-like args (digits, +, spaces, dashes, brackets)
        let phoneParts = [];
        let roleIdx = 0;
        for (let i = 0; i < args.length; i++) {
          if (/^[\d+\s()-]+$/.test(args[i])) {
            phoneParts.push(args[i]);
            roleIdx = i + 1;
          } else {
            break;
          }
        }
        const fullPhone = phoneParts.join(' ');
        target = phoneToJid(fullPhone);
        if (!target) {
          return extra.reply(`❌ ERROR\n\nInvalid phone number: ${fullPhone}`);
        }
        args = args.slice(roleIdx);
      }

      if (!target) {
        return extra.reply(
          `❌ ERROR\n\nTag or add a number\n\n` +
          `Usage:\n` +
          `• .crew add @user <role>\n` +
          `• .crew add 0833882383 <role>`
        );
      }

      const targetNum = target.split('@')[0];

      // Check if already in crew DB
      const existing = database.getCrewMember(extra.from, target);
      if (existing) {
        return extra.reply(
          `❌ ERROR\n\n@${targetNum} is already in the crew\n` +
          `Role: ${ROLE_EMOJIS[existing.role] || '👤'} ${existing.role}`
        );
      }

      // Get custom roles for this group
      const validRoles = database.getCustomRoles(extra.from);

      // Parse role — find a valid role word from remaining args
      let role = validRoles[0]; // default to first (lowest) role
      for (const arg of args) {
        const lower = arg.toLowerCase();
        if (validRoles.includes(lower)) {
          role = lower;
          break;
        }
      }

      // Add to WhatsApp group first
      try {
        await sock.groupParticipantsUpdate(extra.from, [target], 'add');
      } catch (e) {
        // If add fails (e.g. privacy settings), still add to DB
        console.error('[CREW ADD] WhatsApp add failed:', e.message);
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
          `${roleEmoji} @${targetNum}\n\n` +
          `🏷️ Role: ${bold(role)}\n` +
          `📅 Joined: ${new Date().toLocaleDateString('en-ZA')}\n\n` +
          `_Added to group + crew roster_`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew add error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't add member`);
    }
  },
};
