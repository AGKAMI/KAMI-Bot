/**
 * Crew Demote Command — Demote member
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

const ROLE_HIERARCHY = ['member', 'officer', 'co-leader', 'leader'];

module.exports = {
  name: 'demote',
  aliases: ['down'],
  category: 'crew',
  description: 'Demote member one rank',
  usage: '.crew demote @user|number',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      const resolved = resolveUser(args, mentioned);

      if (!resolved.jid) {
        return extra.reply(
          `❌ ERROR\n\nTag or add a number\n\nUsage: .crew demote @user|number`
        );
      }

      const target = resolved.jid;
      const targetNum = target.split('@')[0];

      const member = database.getCrewMember(extra.from, target);
      if (!member) {
        return extra.reply(`❌ ERROR\n\n@${targetNum} is not in this crew`);
      }

      const oldRole = member.role;
      const idx = ROLE_HIERARCHY.indexOf(oldRole);
      if (idx <= 0) {
        return extra.reply(`❌ ERROR\n\n@${targetNum} is already the lowest rank`);
      }

      const newRole = ROLE_HIERARCHY[idx - 1];
      database.addCrewMember(extra.from, target, { ...member, role: newRole });

      await sock.sendMessage(extra.from, {
        text:
          `✅ SUCCESS\n\n⬇️ DEMOTED\n\n` +
          `@${targetNum}\n\n` +
          `${ROLE_EMOJIS[oldRole] || '👤'} ${oldRole} → ${ROLE_EMOJIS[newRole] || '👤'} ${bold(newRole)}`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew demote error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't demote`);
    }
  },
};
