/**
 * SetNewsletter Command - Owner only
 * Set or change the newsletter JID for menu forwarding
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');

module.exports = {
  name: 'setnewsletter',
  reactions: { received: '📰', done: '✏️' },
  aliases: ['setnl', 'setchannel'],
  category: 'owner',
  description: 'Set the newsletter JID the menu forwards from (owner only)',
  usage: '.setnewsletter <newsletter JID>',
  ownerOnly: true,
  adminOnly: false,
  groupOnly: false,
  botAdminOnly: false,
  
  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
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
          return extra.reply(`*❌ ERROR* — that's not a newsletter message, shame\n\n💡 Reply to a newsletter message or give me the newsletter jid`);
        }
      } else if (args[0]) {
        // Get JID from command arguments
        newsletterJid = args[0].trim();
      } else {
        // Show current status
        const currentJid = config.newsletterJid || 'Not set';
        return extra.reply(
          `*📰 NEWSLETTER CONFIG*\n\n` +
          `📋 *Current JID:* \`${currentJid}\`\n` +
          `📝 *Name:* ${config.botName}\n\n` +
          `*Usage:*\n` +
          `  ${prefix}setnewsletter <newsletter JID>\n` +
          `  Or reply to a newsletter message with ${prefix}setnewsletter\n\n` +
          `💡 Example: ${prefix}setnewsletter 120363161513685998@newsletter`
        );
      }
      
      // Validate JID format — the digits are a WhatsApp-issued server id.
      // Anything else (a quote, a newline) is interpolated straight into
      // config.js below, so it has to be locked down here.
      if (!/^\d{5,32}(:\d+)?@newsletter$/.test(newsletterJid)) {
        return extra.reply(`*❌ ERROR* — that newsletter jid is the wrong format\n\n💡 The jid must end with @newsletter\n📝 Example: 120363161513685998@newsletter`);
      }

      // Update config.js
      const configPath = path.join(__dirname, '../../config.js');
      const configBefore = fs.readFileSync(configPath, 'utf8');
      let configContent = configBefore;
      const NEWSLETTER_RE = /newsletterJid:\s*['"][^'"]*['"]/;
      const SESSION_RE = /(sessionName:\s*['"][^'"]+['"],)/;

      // Check if newsletterJid already exists in config
      if (configBefore.includes('newsletterJid:')) {
        // Update existing newsletterJid — `[^'"]*` (not `+`) so an empty
        // `newsletterJid: ''` is rewritten too, instead of silently doing
        // nothing while the reply claimed success
        if (!NEWSLETTER_RE.test(configBefore)) {
          extra.fail();
          return extra.reply(`*❌ ERROR* — found \`newsletterJid:\` in config.js but not in a form I can rewrite`);
        }
        // JSON.stringify keeps the value inside a safe string literal
        configContent = configBefore.replace(
          NEWSLETTER_RE,
          `newsletterJid: ${JSON.stringify(newsletterJid)}`
        );
      } else if (SESSION_RE.test(configBefore)) {
        // Add newsletterJid after sessionName
        configContent = configBefore.replace(
          SESSION_RE,
          `$1\n    newsletterJid: ${JSON.stringify(newsletterJid)}, // Newsletter JID for menu forwarding`
        );
      } else {
        extra.fail();
        return extra.reply(
          `*❌ ERROR* — no \`newsletterJid:\` line and no \`sessionName:\` anchor in config.js\n\n` +
          `Add \`newsletterJid: ''\` to config.js by hand, then run this again`
        );
      }

      // Write updated config
      fs.writeFileSync(configPath, configContent, 'utf8');
      
      // Update in-memory config
      config.newsletterJid = newsletterJid;
      
      await extra.reply(
        `*✅ NEWSLETTER UPDATED*\n\n` +
        `✅ ${voice.lead('affirm')}, jid has been updated!\n\n` +
        `📋 *JID:* \`${newsletterJid}\`\n` +
        `📝 *Name:* ${config.botName}\n\n` +
        `🔄 The menu now forwards from this newsletter.`
      );
      
    } catch (error) {
      console.error('SetNewsletter command error:', error);
      await extra.reply(`*❌ ERROR* — couldn't set the newsletter jid — try again`);
    }
  }
};
