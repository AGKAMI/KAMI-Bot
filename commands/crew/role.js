/**
 * Crew Role Command — Set custom role
 * Supports: @mention OR phone number
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');
const { resolveUser } = require('./crewHelpers');

module.exports = {
  name: 'role',
  aliases: ['setrole'],
  category: 'crew',
  description: 'Set custom role for member',
  usage: '.crew role @user|number <role>',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      const resolved = resolveUser(args, mentioned, ctx);

      if (!resolved.jid) {
        return extra.reply(
          `❌ ERROR\n\nTag or add a number\n\nUsage: .crew role @user|number <role>`
        );
      }

      const target = resolved.jid;
      const targetNum = target.split('@')[0];

      const member = database.getCrewMember(extra.from, target);
      if (!member) {
        return extra.reply(`❌ ERROR\n\n@${targetNum} is not in this crew`);
      }

      const newRole = resolved.args.join(' ');
      if (!newRole) {
        return extra.reply(`❌ ERROR\n\nProvide a role name`);
      }

      const oldRole = member.role;
      database.addCrewMember(extra.from, target, { ...member, role: newRole });

      await sock.sendMessage(extra.from, {
        text:
          `✅ SUCCESS\n\n🏷️ ROLE UPDATED\n\n` +
          `@${targetNum}\n\n` +
          `${oldRole} → ${bold(newRole)}`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew role error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't update role`);
    }
  },
};
