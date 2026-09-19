/**
 * Crew Role Command — Set custom role for member in Slammed Society
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

const ROLE_EMOJIS = {
  'leader': '👑',
  'co-leader': '⭐',
  'officer': '🎖️',
  'member': '👤',
};

module.exports = {
  name: 'role',
  aliases: ['setrole'],
  category: 'crew',
  description: 'Set custom role for crew member',
  usage: '.crew role @user <role>',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      if (mentioned.length === 0) {
        return extra.reply(
          `❌ ERROR\n\nTag or reply to the person you wanna set role for ${pick(SLANG.friend)}\n\n` +
          `Usage: .crew role @user <role>`
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
          `Usage: .crew role @user <role>`
        );
      }

      const newRole = args.slice(1).join(' ');
      if (newRole.length > 30) {
        return extra.reply(
          `❌ ERROR\n\nRole name too long ${pick(SLANG.error)}\n` +
          `Max 30 characters`
        );
      }

      const oldRole = member.role;

      database.addCrewMember(target, {
        ...member,
        role: newRole,
      });

      const newEmoji = ROLE_EMOJIS[newRole] || '🏷️';

      await sock.sendMessage(extra.from, {
        text:
          `✅ SUCCESS\n\n` +
          `🏷️ CUSTOM ROLE SET\n\n` +
          `${newEmoji} @${targetNum}\n\n` +
          `➡️ ${bold(oldRole)} → ${bold(newRole)}`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew role error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't set role`);
    }
  },
};
