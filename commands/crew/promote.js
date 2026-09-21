/**
 * Crew Promote Command — Promote member
 * Supports: @mention OR phone number
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG, mention } = require('../../utils/format');
const { resolveUser } = require('./crewHelpers');

const getRoleEmoji = (role, roles) => {
  const idx = roles.indexOf(role);
  if (idx === roles.length - 1) return '👑';
  if (idx === roles.length - 2) return '⭐';
  if (idx === 0) return '👤';
  return '🎖️';
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

  const prefix = config.prefix || '.';
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      const resolved = resolveUser(args, mentioned, ctx);

      if (!resolved.jid) {
        return extra.reply(
          `❌ ERROR\n\nTag or add a number\n\nUsage: \`${prefix}crew promote @user|number <role>\``
        );
      }

      const target = resolved.jid;

      const member = database.getCrewMember(extra.from, target);
      if (!member) {
        return extra.reply(`❌ ERROR\n\n${mention(target)} is not in this crew`);
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

      // Prevent promoting to same role
      if (newRole === oldRole) {
        return extra.reply(`❌ ERROR\n\n${mention(target)} is already *${newRole}*`);
      }

      // Prevent promoting to a lower role (that's a demote)
      const oldIdx = validRoles.indexOf(oldRole);
      const newIdx = validRoles.indexOf(newRole);
      if (newIdx < oldIdx) {
        return extra.reply(
          `❌ ERROR\n\n${mention(target)} is already *${oldRole}* — ` +
          `that's higher than *${newRole}*\n\nUse \`${prefix}crew demote\` to move them down`
        );
      }

      // Prevent promoting past the top rank
      if (newIdx === validRoles.length - 1 && oldIdx === validRoles.length - 1) {
        return extra.reply(`❌ ERROR\n\n${mention(target)} is already at the *highest rank*`);
      }

      database.addCrewMember(extra.from, target, { ...member, role: newRole });
      const ownerVIP = extra.isOwnerMentioned;

      await sock.sendMessage(extra.from, {
        text:
          `✅ SUCCESS\n\n` +
          (ownerVIP
            ? `👑 THE BOSS HAS SPOKEN 👑\n\n`
            : `⬆️ PROMOTED\n\n`) +
          `${mention(target)}\n\n` +
          `${getRoleEmoji(oldRole, validRoles)} ${oldRole} → ${getRoleEmoji(newRole, validRoles)} ${bold(newRole)}` +
          (ownerVIP ? `\n\n_The owner himself has promoted this member._ 👑` : ''),
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew promote error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't promote`);
    }
  },
};
