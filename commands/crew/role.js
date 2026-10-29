/**
 * Crew Role Command — Set custom role
 * Supports: @mention OR phone number
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG, mention, voice } = require('../../utils/format');
const { resolveUser } = require('./crewHelpers');
const { buildComparableIds } = require('../../utils/jidHelper');

module.exports = {
  subName: 'role',
  name: null,
  aliases: ['setrole'],
  category: 'crew',
  description: 'Set a custom role for a member',
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
          `❌ ERROR\n\nTag someone or drop a number\n\nUsage: ${prefix}crew role @user|number <role>`
        );
      }

      const target = resolved.jid;

      // Look up with PN + LID variant handling so a LID-stored
      // member matches a PN-resolved target (and vice versa)
      const targetVariants = buildComparableIds(target);
      const member = database.getCrewMember(extra.from, target)
        || targetVariants.map(v => database.getCrewMember(extra.from, v)).find(Boolean);
      if (!member) {
        return extra.reply(`❌ ERROR\n\n${mention(target)} isn't in this crew, hey`);
      }

      const newRole = resolved.args.join(' ').trim().toLowerCase();
      if (!newRole) {
        return extra.reply(`❌ ERROR\n\nGive me a role name`);
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
          (ownerVIP ? `\n\n_The owner personally set this role._ 👑` : ''),
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew role error:', error);
      await extra.reply(`❌ ERROR\n\n${voice.openErr()} — couldn't set the role`);
    }
  },
};
