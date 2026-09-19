/**
 * Crew Demote Command — Demote member role in Slammed Society
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
  name: 'demote',
  aliases: ['rankdown'],
  category: 'crew',
  description: 'Demote member to lower role',
  usage: '.crew demote @user',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      if (mentioned.length === 0) {
        return extra.reply(
          `❌ ERROR\n\nTag or reply to the person you wanna demote ${pick(SLANG.friend)}\n\n` +
          `Usage: .crew demote @user`
        );
      }

      const target = mentioned[0];
      const targetNum = target.split('@')[0];

      const member = database.getCrewMember(target);
      if (!member) {
        return extra.reply(
          `❌ ERROR\n\n@${targetNum} is not in the crew ${pick(SLANG.vibe)}`
        );
      }

      const oldRole = member.role;
      const currentIndex = ROLE_HIERARCHY.indexOf(oldRole);

      if (currentIndex <= 0) {
        return extra.reply(
          `❌ ERROR\n\n@${targetNum} is already the lowest rank ${pick(SLANG.vibe)}\n` +
          `Can't demote further`
        );
      }

      const newRole = ROLE_HIERARCHY[currentIndex - 1];

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
          `${newEmoji} @${targetNum} has been demoted\n\n` +
          `➡️ ${oldEmoji} ${bold(oldRole)} → ${newEmoji} ${bold(newRole)}`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew demote error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't demote member`);
    }
  },
};
