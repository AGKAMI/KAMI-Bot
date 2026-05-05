/**
 * Menu Command - Display all available commands
 */

const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');

module.exports = {
  name: 'menu',
  aliases: ['help', 'commands'],
  category: 'general',
  description: 'Show all available commands',
  usage: '.menu',
  
  async execute(sock, msg, args, extra) {
    try {
      const commands = loadCommands();
      const categories = {};
      
      commands.forEach((cmd, name) => {
        if (cmd.name === name) {
          if (!categories[cmd.category]) {
            categories[cmd.category] = [];
          }
          categories[cmd.category].push(cmd);
        }
      });
      
      const ownerNames = Array.isArray(config.ownerName) ? config.ownerName : [config.ownerName];
      const displayOwner = ownerNames[0] || config.ownerName || 'Bot Owner';
      
      // Cool Style Menu
      let menuText = `╔══════════════════════════════════╗\n`;
      menuText += `║     💀 KAMI BOT MENU 💀          ║\n`;
      menuText += `╚══════════════════════════════════╝\n\n`;
      menuText += `👋 Hey @${extra.sender.split('@')[0]}!\n`;
      menuText += `⚡ Prefix: ${config.prefix}\n`;
      menuText += `📦 Total: ${commands.size} commands\n`;
      menuText += `👑 Owner: ${displayOwner}\n\n`;
      menuText += `═══════════════════════════════════\n\n`;
      
      const sectionMap = {
        general: { icon: '⚡', title: 'GENERAL', color: '⬜' },
        ai: { icon: '🤖', title: 'AI', color: '🟣' },
        group: { icon: '👥', title: 'GROUP', color: '🟦' },
        admin: { icon: '🛡️', title: 'ADMIN', color: '🟥' },
        owner: { icon: '👑', title: 'OWNER', color: '🟨' },
        media: { icon: '🎬', title: 'MEDIA', color: '🟧' },
        fun: { icon: '🎮', title: 'FUN', color: '🟩' },
        utility: { icon: '🔧', title: 'UTILITY', color: '⬛' },
        anime: { icon: '👾', title: 'ANIME', color: '🟪' },
        textmaker: { icon: '🖋️', title: 'TEXTMAKER', color: '🩷' }
      };
      
      Object.keys(categories).forEach(cat => {
        const info = sectionMap[cat] || { icon: '📁', title: cat.toUpperCase(), color: '⚪' };
        menuText += `${info.color} ━━━ ${info.icon} ${info.title} ━━━${info.color}\n`;
        
        categories[cat].forEach(cmd => {
          menuText += `   ${config.prefix}${cmd.name}\n`;
        });
        menuText += `\n`;
      });
      
      menuText += `═══════════════════════════════════\n\n`;
      menuText += `💡 Type: ${config.prefix}help <command>\n`;
      menuText += `💀 KAMI Bot v1.0.0`;
      
      // Send menu with image
      const fs = require('fs');
      const path = require('path');
      const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
      
      // Update newsletter JID
      const newsletterJid = '120363399255608558@newsletter';
      
      if (fs.existsSync(imagePath)) {
        const imageBuffer = fs.readFileSync(imagePath);
        await sock.sendMessage(extra.from, {
          image: imageBuffer,
          caption: menuText,
          mentions: [extra.sender],
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: newsletterJid,
              newsletterName: 'KAMI Bot',
              serverMessageId: -1
            }
          }
        }, { quoted: msg });
      } else {
        await sock.sendMessage(extra.from, {
          text: menuText,
          mentions: [extra.sender]
        }, { quoted: msg });
      }
      
    } catch (error) {
      await extra.reply(`❌ Error: ${error.message}`);
    }
  }
};