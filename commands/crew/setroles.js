/**
 * Crew Setroles Command — Configure custom role hierarchy per group
 * Usage: .crew setroles <role1> <role2> <role3> ...
 * Order = hierarchy (last = highest rank)
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'setroles',
  aliases: ['roleset'],
  category: 'crew',
  description: 'Set custom role hierarchy',
  usage: '.crew setroles <role1> <role2> ... <topRole>',
  groupOnly: false,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      if (args.length < 2) {
        return extra.reply(
          `❌ ERROR\n\nProvide at least 2 roles\n\n` +
          `Usage: ${prefix}crew setroles soldier officer general\n\n` +
          `_Last role = highest rank (for promote/demote)_`
        );
      }

      const roles = args.map(r => r.toLowerCase());
      const unique = [...new Set(roles)];

      if (unique.length !== roles.length) {
        return extra.reply(`❌ ERROR\n\nNo duplicate roles allowed`);
      }

      database.setCustomRoles(extra.from, unique);

      const roleList = roles.map((r, i) => {
        const rank = i === roles.length - 1 ? '👑 HIGHEST' : `#${i + 1}`;
        return `${rank} — ${bold(r)}`;
      }).join('\n');

      await sock.sendMessage(extra.from, {
        text:
          `✅ SUCCESS\n\n` +
          `🏷️ CUSTOM ROLES SET\n\n` +
          `Hierarchy (lowest → highest):\n` +
          roleList + `\n\n` +
          `_Use ${prefix}crew add @user <role> to assign_`,
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew setroles error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't set roles`);
    }
  },
};
