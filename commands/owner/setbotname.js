/**
 * Set Bot Name Command - Change bot name in config
 */

const config = require('../../config');
const fs = require('fs');
const path = require('path');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');

module.exports = {
  name: 'setbotname',
  reactions: { received: '📝', done: '🏷️' },
  aliases: ['botname'],
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

      // The name is interpolated straight into a JS string literal in
      // config.js, so a newline/backslash in it would leave config.js
      // unparseable and the bot dead on the next boot. Single-line it.
      const safeBotName = newBotName
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (!safeBotName) {
        extra.fail();
        return extra.reply(`*❌ ERROR* — that name has nothing usable in it`);
      }

      // Update runtime config
      config.botName = safeBotName;

      // Update config file
      const configPath = path.join(__dirname, '../../config.js');
      const configBefore = fs.readFileSync(configPath, 'utf-8');
      const botNameRe = /botName:\s*['"`]([^'"`]*)['"`]/;
      if (!botNameRe.test(configBefore)) {
        extra.fail();
        return extra.reply(`*❌ ERROR* — no \`botName:\` line in config.js to rewrite`);
      }

      // JSON.stringify escapes quotes/newlines/backslashes, so the name can
      // never break out of the config.js string literal
      const configContent = configBefore.replace(
        botNameRe,
        `botName: ${JSON.stringify(safeBotName)}`
      );

      fs.writeFileSync(configPath, configContent, 'utf-8');

      // Reload config module cache
      delete require.cache[require.resolve('../../config')];

      await extra.reply(`*✅ NAME UPDATED*\n\n✅ ${voice.lead('affirm')}, bot name is now: *${safeBotName}*\n\n🔄 New name will show in menus`);
      
    } catch (error) {
      console.error('Setbotname command error:', error);
      await extra.reply(`*❌ ERROR* — try again`);
    }
  }
};
