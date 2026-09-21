/**
 * Set Bot Name Command - Change bot name in config
 */

const config = require('../../config');
const fs = require('fs');
const path = require('path');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'setbotname',
  aliases: ['setname', 'botname'],
  category: 'owner',
  description: 'Change bot name',
  usage: '.setbotname <new name> or reply to a message with .setbotname',
  ownerOnly: true,
  
  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      let newBotName = '';
      
      // Check if message is a reply
      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (quotedMsg) {
        // Get text from quoted message
        const quotedText = quotedMsg.conversation || 
                          quotedMsg.extendedTextMessage?.text || 
                          quotedMsg.imageMessage?.caption ||
                          quotedMsg.videoMessage?.caption ||
                          '';
        newBotName = quotedText.trim();
      } else {
        // Get name from command arguments
        newBotName = args.join(' ').trim();
      }
      
      // Validate
      if (!newBotName) {
        return extra.reply(
          `*📝 SET BOT NAME*\n\n` +
          `📋 *Current name:* *${config.botName}*\n\n` +
          `*Usage:*\n` +
          `  ${prefix}setbotname <new name>\n` +
          `  Or reply to a message with ${prefix}setbotname`
        );
      }
      
      if (newBotName.length > 50) {
        return extra.reply(`*❌ ERROR* — bot name max 50 characters`);
      }
      
      // Update runtime config
      config.botName = newBotName;
      
      // Update config file
      const configPath = path.join(__dirname, '../../config.js');
      let configContent = fs.readFileSync(configPath, 'utf-8');
      
      // Replace botName value (handles both single and double quotes)
      configContent = configContent.replace(
        /botName:\s*['"`]([^'"`]*)['"`]/,
        `botName: '${newBotName.replace(/'/g, "\\'")}'`
      );
      
      fs.writeFileSync(configPath, configContent, 'utf-8');
      
      // Reload config module cache
      delete require.cache[require.resolve('../../config')];
      
      await extra.reply(`*✅ NAME UPDATED*\n\n✅ ${pick(SLANG.good)}, bot name is now: *${newBotName}*\n\n🔄 New name will show in menus`);
      
    } catch (error) {
      console.error('Setbotname command error:', error);
      await extra.reply(`*❌ ERROR* — ${error.message}`);
    }
  }
};
