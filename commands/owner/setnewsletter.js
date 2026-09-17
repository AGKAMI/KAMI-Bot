/**
 * SetNewsletter Command - Owner only
 * Set or change the newsletter JID for menu forwarding
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'setnewsletter',
  aliases: ['setnl', 'setchannel'],
  category: 'owner',
  description: 'Set or change the newsletter JID for menu forwarding (owner only)',
  usage: '.setnewsletter <newsletter JID>',
  ownerOnly: true,
  adminOnly: false,
  groupOnly: false,
  botAdminOnly: false,
  
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      let newsletterJid = '';
      
      // Check if we're currently in a newsletter chat
      if (msg.key.remoteJid && msg.key.remoteJid.endsWith('@newsletter')) {
        newsletterJid = msg.key.remoteJid;
      }
      // Check if replying to a message
      else if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const contextInfo = msg.message.extendedTextMessage.contextInfo;
        
        // Recursive function to search for newsletter JID in any field
        const findNewsletterJid = (obj, depth = 0) => {
          if (depth > 5 || !obj || typeof obj !== 'object') return null;
          
          for (const key in obj) {
            const value = obj[key];
            if (typeof value === 'string' && value.endsWith('@newsletter')) {
              return value;
            }
            if (typeof value === 'object' && value !== null) {
              const found = findNewsletterJid(value, depth + 1);
              if (found) return found;
            }
          }
          return null;
        };
        
        // Search entire contextInfo object for any @newsletter JID
        newsletterJid = findNewsletterJid(contextInfo);
        
        // If we still don't have a newsletter JID, show error
        if (!newsletterJid) {
          return extra.reply(`_${pick(SLANG.error)} — that's not a newsletter message_\n\nreply to a newsletter message or provide a newsletter jid`);
        }
      } else if (args[0]) {
        // Get JID from command arguments
        newsletterJid = args[0].trim();
      } else {
        // Show current status
        const currentJid = config.newsletterJid || 'Not set';
        return extra.reply(
          `${bold('📰 NEWSLETTER CONFIG')}\n\n` +
          `${bold('Current JID:')} \`${currentJid}\`\n` +
          `${bold('Name:')} ${config.botName}\n\n` +
          `${bold('Usage:')}\n` +
          `  .setnewsletter <newsletter JID>\n` +
          `  Or reply to a newsletter message with .setnewsletter\n\n` +
          `Example: .setnewsletter 120363161513685998@newsletter`
        );
      }
      
      // Validate JID format (should end with @newsletter)
      if (!newsletterJid.endsWith('@newsletter')) {
        return extra.reply(`${bold(pick(SLANG.error))} — invalid newsletter jid format\n\nnewsletter jid must end with @newsletter\nexample: 120363161513685998@newsletter`);
      }
      
      // Update config.js
      const configPath = path.join(__dirname, '../../config.js');
      let configContent = fs.readFileSync(configPath, 'utf8');
      
      // Check if newsletterJid already exists in config
      if (configContent.includes('newsletterJid:')) {
        // Update existing newsletterJid
        configContent = configContent.replace(
          /newsletterJid:\s*['"]([^'"]+)['"]/,
          `newsletterJid: '${newsletterJid}'`
        );
      } else {
        // Add newsletterJid after sessionName
        configContent = configContent.replace(
          /(sessionName:\s*['"][^'"]+['"],)/,
          `$1\n    newsletterJid: '${newsletterJid}', // Newsletter JID for menu forwarding`
        );
      }
      
      // Write updated config
      fs.writeFileSync(configPath, configContent, 'utf8');
      
      // Update in-memory config
      config.newsletterJid = newsletterJid;
      
      await extra.reply(
        `${bold('✅ NEWSLETTER UPDATED')}\n\n` +
        `_${pick(SLANG.good)}, jid has been updated!_\n\n` +
        `${bold('JID:')} \`${newsletterJid}\`\n` +
        `${bold('Name:')} ${config.botName}\n\n` +
        `The menu will now forward from this newsletter.`
      );
      
    } catch (error) {
      console.error('SetNewsletter command error:', error);
      await extra.reply(`_${pick(SLANG.error)} — couldn't set newsletter jid: ${error.message}_`);
    }
  }
};

