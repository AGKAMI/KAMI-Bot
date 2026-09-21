/**
 * Set Prefix Command - Change bot command prefix
 */

const config = require('../../config');
const fs = require('fs');
const path = require('path');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'setprefix',
  aliases: ['prefix'],
  category: 'owner',
  description: 'Change bot command prefix',
  usage: '.setprefix <new prefix>',
  ownerOnly: true,
  
  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      if (args.length === 0) {
        return extra.reply(`*📌 CURRENT PREFIX*\n\n📋 *Prefix:* *${config.prefix}*\n\n💡 Usage: ${prefix}setprefix <new prefix>`);
      }
      
      const newPrefix = args[0];
      
      if (newPrefix.length > 3) {
        return extra.reply(`*❌ ERROR* — prefix must be 1-3 characters`);
      }
      
      // Update config
      config.prefix = newPrefix;
      
      // Update config file
      const configPath = path.join(__dirname, '../../config.js');
      let configContent = fs.readFileSync(configPath, 'utf-8');
      configContent = configContent.replace(/prefix: '.*'/, `prefix: '${newPrefix}'`);
      fs.writeFileSync(configPath, configContent);
      
      await extra.reply(`*✅ PREFIX UPDATED*\n\n✅ ${pick(SLANG.good)}, prefix is now: *${newPrefix}*\n\n🔄 New command format: ${newPrefix}command`);
      
    } catch (error) {
      await extra.reply(`*❌ ERROR* — ${error.message}`);
    }
  }
};
