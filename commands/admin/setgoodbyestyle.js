/**
 * SetGoodbyeStyle - Customize text overlay on goodbye image
 */

const db = require('../../database');
const config = require('../../config');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'setgoodbyestyle',
  reactions: { received: '🎨', done: '✏️' },
  aliases: ['goodbyestyle'],
  category: 'admin',
  description: 'Customize text overlay on goodbye image',
  usage: '.setgoodbyestyle <option> <value>',
  groupOnly: true,
  ownerOnly: true, adminOnly: false,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const groupId = msg.key.remoteJid;
      const groupSettings = db.getGroupSettings(groupId);
      const style = groupSettings.goodbyeStyle || {};

      const option = args[0]?.toLowerCase();
      const value = args.slice(1).join(' ');

      if (!option) {
        const current = {
          position: style.position || 'center',
          textColor: style.textColor || '#ffffff',
          bgColor: style.bgColor || 'rgba(0,0,0,0.65)',
          fontSize: style.fontSize || 40,
          subFontSize: style.subFontSize || 28,
        };

        return extra.reply(
          `*GOODBYE TEXT STYLE*\n\n` +
          `*Current settings:*\n` +
          `• Position: ${current.position}\n` +
          `• Text color: ${current.textColor}\n` +
          `• BG color: ${current.bgColor}\n` +
          `• Font size: ${current.fontSize}\n` +
          `• Sub font size: ${current.subFontSize}\n\n` +
          `*Options:*\n` +
          `• ${prefix}setgoodbyestyle position <top/center/bottom>\n` +
          `• ${prefix}setgoodbyestyle textcolor <hex>\n` +
          `• ${prefix}setgoodbyestyle bgcolor <rgba/hex>\n` +
          `• ${prefix}setgoodbyestyle fontsize <number>\n` +
          `• ${prefix}setgoodbyestyle subfontsize <number>\n` +
          `• ${prefix}setgoodbyestyle reset`
        );
      }

      if (option === 'reset') {
        db.updateGroupSettings(groupId, { goodbyeStyle: {} });
        return extra.reply(`✅ _${pick(SLANG.good)}, goodbye style reset to defaults_`);
      }

      const validPositions = ['top', 'center', 'bottom'];
      if (option === 'position' && !validPositions.includes(value)) {
        return extra.reply(`❌ _position must be: top, center, or bottom_`);
      }

      if (option === 'fontsize' || option === 'subfontsize') {
        const num = parseInt(value);
        if (isNaN(num) || num < 16 || num > 80) {
          return extra.reply(`❌ _font size must be between 16 and 80_`);
        }
      }

      const currentStyle = groupSettings.goodbyeStyle || {};
      const newStyle = { ...currentStyle };
      if (option === 'position') newStyle.position = value;
      if (option === 'textcolor') newStyle.textColor = value;
      if (option === 'bgcolor') newStyle.bgColor = value;
      if (option === 'fontsize') newStyle.fontSize = parseInt(value);
      if (option === 'subfontsize') newStyle.subFontSize = parseInt(value);

      db.updateGroupSettings(groupId, { goodbyeStyle: newStyle });

      await extra.reply(`✅ _${pick(SLANG.good)}, goodbye style updated_\n\n_${option} → ${value}_`);
    } catch (error) {
      console.error('SetGoodbyeStyle error:', error);
      await extra.reply(`❌ _${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};
