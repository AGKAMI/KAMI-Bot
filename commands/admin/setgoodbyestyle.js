/**
 * SetGoodbyeStyle - Customize text overlay on goodbye image
 */

const db = require('../../database');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'setgoodbyestyle',
  aliases: ['goodbyestyle'],
  category: 'admin',
  description: 'Customize text overlay on goodbye image',
  usage: '.setgoodbyestyle <option> <value>',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
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
          `${bold('GOODBYE TEXT STYLE')}\n\n` +
          `${bold('Current settings:')}\n` +
          `• Position: ${current.position}\n` +
          `• Text color: ${current.textColor}\n` +
          `• BG color: ${current.bgColor}\n` +
          `• Font size: ${current.fontSize}\n` +
          `• Sub font size: ${current.subFontSize}\n\n` +
          `${bold('Options:')}\n` +
          `• .setgoodbyestyle position <top/center/bottom>\n` +
          `• .setgoodbyestyle textcolor <hex>\n` +
          `• .setgoodbyestyle bgcolor <rgba/hex>\n` +
          `• .setgoodbyestyle fontsize <number>\n` +
          `• .setgoodbyestyle subfontsize <number>\n` +
          `• .setgoodbyestyle reset`
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
