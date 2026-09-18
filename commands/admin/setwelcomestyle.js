/**
 * SetWelcomeStyle - Customize text overlay on welcome image
 */

const db = require('../../database');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'setwelcomestyle',
  aliases: ['welcomestyle'],
  category: 'admin',
  description: 'Customize text overlay on welcome image',
  usage: '.setwelcomestyle <option> <value>',
  groupOnly: true,
  ownerOnly: true, adminOnly: false,

  async execute(sock, msg, args, extra) {
    try {
      const groupId = msg.key.remoteJid;
      const groupSettings = db.getGroupSettings(groupId);
      const style = groupSettings.welcomeStyle || {};

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
          `*WELCOME TEXT STYLE*\n\n` +
          `*Current settings:*\n` +
          `• Position: ${current.position}\n` +
          `• Text color: ${current.textColor}\n` +
          `• BG color: ${current.bgColor}\n` +
          `• Font size: ${current.fontSize}\n` +
          `• Sub font size: ${current.subFontSize}\n\n` +
          `*Options:*\n` +
          `• .setwelcomestyle position <top/center/bottom>\n` +
          `• .setwelcomestyle textcolor <hex>\n` +
          `• .setwelcomestyle bgcolor <rgba/hex>\n` +
          `• .setwelcomestyle fontsize <number>\n` +
          `• .setwelcomestyle subfontsize <number>\n` +
          `• .setwelcomestyle reset`
        );
      }

      if (option === 'reset') {
        db.updateGroupSettings(groupId, { welcomeStyle: {} });
        return extra.reply(`✅ _${pick(SLANG.good)}, welcome style reset to defaults_`);
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

      const updates = {};
      if (option === 'position') updates['welcomeStyle.position'] = value;
      else if (option === 'textcolor') updates['welcomeStyle.textColor'] = value;
      else if (option === 'bgcolor') updates['welcomeStyle.bgColor'] = value;
      else if (option === 'fontsize') updates['welcomeStyle.fontSize'] = parseInt(value);
      else if (option === 'subfontsize') updates['welcomeStyle.subFontSize'] = parseInt(value);
      else {
        return extra.reply(`❌ _unknown option: ${option}_`);
      }

      // Get current style and merge
      const currentStyle = groupSettings.welcomeStyle || {};
      const newStyle = { ...currentStyle };
      if (option === 'position') newStyle.position = value;
      if (option === 'textcolor') newStyle.textColor = value;
      if (option === 'bgcolor') newStyle.bgColor = value;
      if (option === 'fontsize') newStyle.fontSize = parseInt(value);
      if (option === 'subfontsize') newStyle.subFontSize = parseInt(value);

      db.updateGroupSettings(groupId, { welcomeStyle: newStyle });

      await extra.reply(`✅ _${pick(SLANG.good)}, welcome style updated_\n\n_${option} → ${value}_`);
    } catch (error) {
      console.error('SetWelcomeStyle error:', error);
      await extra.reply(`❌ _${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};
