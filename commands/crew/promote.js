/**
 * Crew Promote Command — Promote member role in Slammed Society
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

const ROLE_HIERARCHY = ['member', 'officer', 'co-leader', 'leader'];

const ROLE_EMOJIS = {
  'leader': '👑',
  'co-leader': '⭐',
  'officer': '🎖️',
  'member': '👤',
};

module.exports = {
  name: 'promote',
  aliases: ['rankup'],
  category: 'crew',
  description: 'Promote member to higher role',
  usage: '.crew promote @user <role>',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      if (mentioned.length === 0) {
        return extra.reply(
          `❌ ERROR\n\nTag or reply to the person you wanna promote ${pick(SLANG.friend)}\n\n` +
          `Usage: .crew promote @user <role>\n` +
          `Roles: ${ROLE_HIERARCHY.join(', ')}`
        );
      }

      const target = mentioned[0];
      const targetNum = target.split('@')[0];

      const member = database.getCrewMember(target);
      if (!member) {
        return extra.reply(
          `❌ ERROR\n\n@${targetNum} is not in the crew ${pick(SLANG.vibe)}\n` +
          `Use .crew add first`
        );
      }

      if (args.length < 2) {
        return extra.reply(
          `❌ ERROR\n\nSpecify a role ${pick(SLANG.error)}\n\n` +
          `Usage: .crew promote @user <role>\n` +
          `Roles: ${ROLE_HIERARCHY.join(', ')}`
        );
      }

      const newRole = args[1].toLowerCase();
      if (!ROLE_HIERARCHY.includes(newRole)) {
        return extra.reply(
          `❌ ERROR\n\nInvalid role ${pick(SLANG.error)}\n` +
          `Valid roles: ${ROLE_HIERARCHY.join(', ')}`
        );
      }

      const oldRole = member.role;
      if (oldRole === newRole) {
        return extra.reply(
          `❌ ERROR\n\n@${targetNum} already has the role ${bold(newRole)} ${pick(SLANG.vibe)}`
        );
      }

      database.addCrewMember(target, {
        ...member,
        role: newRole,
      });

      const oldEmoji = ROLE_EMOJIS[oldRole] || '👤';
      const newEmoji = ROLE_EMOJIS[newRole] || '👤';

      await sock.sendMessage(extra.from, {
        text:
          `✅ SUCCESS\n\n` +
          `🎖️ ROLE UPDATED\n\n` +
          `${newEmoji} @${targetNum} has been promoted\n\n` +
          `➡️ ${oldEmoji} ${bold(oldRole)} → ${newEmoji} ${bold(newRole)}`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew promote error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't promote member`);
    }
  },
};
