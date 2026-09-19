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

module.exports = {
  subName: 'promote',
  name: null,
  aliases: ['up'],
  category: 'crew',
  description: 'Promote member to higher role',
  usage: '.crew promote @user|number <role>',
  groupOnly: false,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      const resolved = resolveUser(args, mentioned, ctx);

      if (!resolved.jid) {
        return extra.reply(
          `❌ ERROR\n\nTag or add a number\n\n` +
          `Usage: .crew promote @user|number <role>`
        );
      }

      const target = resolved.jid;
      const targetNum = target.split('@')[0];

      const member = database.getCrewMember(extra.from, target);
      if (!member) {
        return extra.reply(`❌ ERROR\n\n@${targetNum} is not in this crew`);
      }

      // Get custom roles for this group
      const validRoles = database.getCustomRoles(extra.from);

      // Find the role from args — look for a valid role word
      let newRole = null;
      for (const arg of resolved.args) {
        const lower = arg.toLowerCase();
        if (validRoles.includes(lower)) {
          newRole = lower;
          break;
        }
      }
      if (!newRole) {
        return extra.reply(
          `❌ ERROR\n\nProvide a valid role\n\n` +
          `Valid roles:\n${validRoles.map(r => `• ${r}`).join('\n')}`
        );
      }

      const oldRole = member.role;
      database.addCrewMember(extra.from, target, { ...member, role: newRole });

      await sock.sendMessage(extra.from, {
        text:
          `✅ SUCCESS\n\n⬆️ PROMOTED\n\n` +
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
