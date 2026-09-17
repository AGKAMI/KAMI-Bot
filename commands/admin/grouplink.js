/**
 * Group Link Command - Get group invite link
 */

const { bold, pick, SLANG } = require('../../utils/format');

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
        const code = await sock.groupInviteCode(extra.from);
        const link = `https://chat.whatsapp.com/${code}`;
        
        let text = `🔗 ${bold('GROUP INVITE LINK')}\n\n`;
        text += `📱 ${bold('Group')}: ${extra.groupMetadata.subject}\n`;
        text += `🔗 ${bold('Link')}: ${link}\n\n`;
        text += `⚠️ _Don't share this publicly, ${pick(SLANG.vibe)}!_`;
        
        await extra.reply(text);
        
      } catch (error) {
        await extra.reply(`❌ _${pick(SLANG.error)} — ${error.message}_`);
      }
    }
  };
  