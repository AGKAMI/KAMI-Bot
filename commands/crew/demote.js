const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG } = require('../../utils/format');
const { resolveUser } = require('./crewHelpers');

const getRoleEmoji = (role, roles) => {
  const idx = roles.indexOf(role);
  if (idx === roles.length - 1) return '👑';
  if (idx === roles.length - 2) return '⭐';
  if (idx === 0) return '👤';
  return '🎖️';
};

module.exports = {
  subName: 'demote',
  name: null,
  aliases: ['down'],
  category: 'crew',
  description: 'Demote member one rank',
  usage: '.crew demote @user|number',
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
          `❌ ERROR\n\nTag or add a number\n\nUsage: \`${prefix}crew demote @user|number\``
        );
      }

      const target = resolved.jid;
      const targetNum = target.split(':')[0].split('@')[0];

      const member = database.getCrewMember(extra.from, target);
      if (!member) {
        return extra.reply('❌ ERROR\n\n@' + targetNum + ' is not in this crew');
      }

      const validRoles = database.getCustomRoles(extra.from);
      const oldRole = member.role;
      const idx = validRoles.indexOf(oldRole);

      if (idx <= 0) {
        return extra.reply('❌ ERROR\n\n@' + targetNum + ' is already the lowest rank');
      }

      const newRole = validRoles[idx - 1];
      database.addCrewMember(extra.from, target, { ...member, role: newRole });
      const ownerVIP = extra.isOwnerMentioned;

      await sock.sendMessage(extra.from, {
        text:
          '✅ SUCCESS\n\n' +
          (ownerVIP
            ? '👑 THE BOSS HAS SPOKEN 👑\n\n'
            : '⬇️ DEMOTED\n\n') +
          '@' + targetNum + '\n\n' +
          (getRoleEmoji(oldRole, validRoles)) + ' ' + oldRole + ' → ' +
          (getRoleEmoji(newRole, validRoles)) + ' ' + bold(newRole) +
          (ownerVIP ? '\n\n_The owner himself has demoted this member._ 👑' : ''),
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew demote error:', error);
      await extra.reply('❌ ERROR\n\n' + pick(SLANG.error) + ' — couldn\'t demote');
    }
  },
};
