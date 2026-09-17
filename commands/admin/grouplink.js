/**
 * Group Link Command - Get group invite link
 */

module.exports = {
    name: 'grouplink',
    aliases: ['link', 'invite'],
    category: 'admin',
    description: 'Get group invite link',
    usage: '.grouplink',
    groupOnly: true,
    adminOnly: true,
    botAdminNeeded: true,
    
    async execute(sock, msg, args, extra) {
      try {
        const { bold, pick, SLANG } = require('../../utils/format');
        const code = await sock.groupInviteCode(extra.from);
        const link = `https://chat.whatsapp.com/${code}`;
        
        let text = `🔗 ${bold('group invite link')}\n\n`;
        text += `📱 ${bold('Group')}: ${extra.groupMetadata.subject}\n`;
        text += `🔗 ${bold('Link')}: ${link}\n\n`;
        text += `⚠️ Don't share this link publicly!`;
        
        await extra.reply(text);
        
      } catch (error) {
        await extra.reply(`❌ _moegoe, ${error.message}_`);
      }
    }
  };
  