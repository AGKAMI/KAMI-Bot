/**
 * Group Info Command - Display group information
 */

const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
    name: 'groupinfo',
    aliases: ['info', 'ginfo'],
    category: 'general',
    description: 'Show group information',
    usage: '.groupinfo',
    groupOnly: true,
    
    async execute(sock, msg, args, extra) {
      try {
        const metadata = extra.groupMetadata;
        
        const admins = metadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
        const members = metadata.participants.filter(p => !p.admin);
        
        let text = `----------\n*KAMI BOT*\n----------\n\n📋 *GROUP INFO*\n----------\n`;
                text += `- 🏷️ Name: ${metadata.subject}\n`;
                text += `- 👥 Members: ${metadata.participants.length}\n`;
                text += `- 👑 Admins: ${admins.length}\n`;
                text += `- 💀 Members: ${members.length}\n----------\n\n`;
                text += `📜 *Description*\n${metadata.desc || 'No description'}\n\n`;
                text += `🔒 *Settings*\n`;
                text += `- 🔒 Restrict: ${metadata.restrict ? '✅' : '❌'}\n`;
                text += `- 📢 Announce: ${metadata.announce ? '✅' : '❌'}\n`;
                text += `- 📅 Created: ${new Date(metadata.creation * 1000).toLocaleDateString()}\n\n`;
                text += `👑 *Admins List*\n`;
        
                admins.forEach((admin, index) => {
                  text += `${index + 1}. @${admin.id.split('@')[0]}\n`;
                });
        
                text += `\n----------\n*KAMI Bot*`;
        
        await sock.sendMessage(extra.from, {
          text,
          mentions: admins.map(a => a.id)
        }, { quoted: msg });
        
      } catch (error) {
        await extra.reply(`❌ _${pick(SLANG.error)} — ${error.message}_`);
      }
    }
  };
  