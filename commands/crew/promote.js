/**
 * Crew Promote Command — Promote member
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
  name: 'promote',
  aliases: ['up'],
  category: 'crew',
  description: 'Promote member to higher role',
  usage: '.crew promote @user|number <role>',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      const resolved = resolveUser(args, mentioned);

      if (!resolved.jid) {
        return extra.reply(
          `❌ ERROR\n\nTag or add a number\n\n` +
          `Usage: .crew promote @user|number <role>\n` +
          `Roles: ${ROLE_HIERARCHY.join(', ')}`
        );
      }

      const target = resolved.jid;
      const targetNum = target.split('@')[0];

      const member = database.getCrewMember(extra.from, target);
      if (!member) {
        return extra.reply(`❌ ERROR\n\n@${targetNum} is not in this crew`);
      }

      // Get new role from remaining args
      const newRole = (resolved.args[0] || '').toLowerCase();
      if (!newRole || !ROLE_HIERARCHY.includes(newRole)) {
        return extra.reply(
          `❌ ERROR\n\nProvide a role: ${ROLE_HIERARCHY.join(', ')}`
        );
      }

      const oldRole = member.role;
      database.addCrewMember(extra.from, target, { ...member, role: newRole });

      await sock.sendMessage(extra.from, {
        text:
          `✅ SUCCESS\n\n` +
          `⬆️ PROMOTED\n\n` +
          `@${targetNum}\n\n` +
          `${ROLE_EMOJIS[oldRole] || '👤'} ${oldRole} → ${ROLE_EMOJIS[newRole] || '👤'} ${bold(newRole)}`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew promote error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't promote`);
    }
  },
};
