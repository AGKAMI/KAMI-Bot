/**
 * Crew Viewroles Command — Show custom role hierarchy for a group
 * Usage: .crew viewroles
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'viewroles',
  reactions: { received: '📜', done: '👑' },
  aliases: ['rolemenu', 'rolelist'],
  category: 'crew',
  description: 'Show role hierarchy',
  usage: '.crew viewroles',
  groupOnly: false,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const roles = database.getCustomRoles(extra.from);

      const roleList = roles.map((r, i) => {
        const rank = i === roles.length - 1 ? '👑 TOP' : `#${i + 1}`;
        return `${rank} — ${bold(r)}`;
      }).join('\n');

      await sock.sendMessage(extra.from, {
        text:
          `🏷️ *ROLE HIERARCHY*\n` +
          `----------\n` +
          roleList + `\n` +
          `----------\n\n` +
          `_Lowest → Highest (bottom = highest)_\n` +
          `_Use ${prefix}crew setroles to change_`,
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew viewroles error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't fetch roles`);
    }
  },
};
