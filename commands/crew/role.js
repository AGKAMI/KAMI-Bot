/**
 * Crew Role Command — Set custom role
 * Supports: @mention OR phone number
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG, mention } = require('../../utils/format');
const { resolveUser } = require('./crewHelpers');

module.exports = {
  subName: 'role',
  name: null,
  aliases: ['setrole'],
  category: 'crew',
  description: 'Set custom role for member',
  usage: '.crew role @user|number <role>',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      const resolved = resolveUser(args, mentioned, ctx);

      if (!resolved.jid) {
        return extra.reply(
          `❌ ERROR\n\nTag or add a number\n\nUsage: ${prefix}crew role @user|number <role>`
        );
      }

      const target = resolved.jid;

      const member = database.getCrewMember(extra.from, target);
      if (!member) {
        return extra.reply(`❌ ERROR\n\n${mention(target)} is not in this crew`);
      }

      const newRole = resolved.args.join(' ').trim();
      if (!newRole) {
        return extra.reply(`❌ ERROR\n\nProvide a role name`);
      }

      const oldRole = member.role;
      database.addCrewMember(extra.from, target, { ...member, role: newRole });
      const ownerVIP = extra.isOwnerMentioned;

      await sock.sendMessage(extra.from, {
        text:
          `✅ SUCCESS\n\n` +
          (ownerVIP
            ? `👑 THE BOSS HAS SPOKEN 👑\n\n`
            : `🏷️ ROLE UPDATED\n\n`) +
          `${mention(target)}\n\n` +
          `${oldRole} → ${bold(newRole)}` +
          (ownerVIP ? `\n\n_The owner himself has set this role._ 👑` : ''),
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew role error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't update role`);
    }
  },
};
