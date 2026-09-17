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
    try {
      if (args.length === 0) {
        return extra.reply(`${bold('📌 CURRENT PREFIX')}\n\n${bold('Prefix:')} ${config.prefix}\n\nUsage: .setprefix <new prefix>`);
      }
      
      const newPrefix = args[0];
      
      if (newPrefix.length > 3) {
        return extra.reply(`${bold(pick(SLANG.error))} — prefix must be 1-3 characters`);
      }
      
      // Update config
      config.prefix = newPrefix;
      
      // Update config file
      const configPath = path.join(__dirname, '../../config.js');
      let configContent = fs.readFileSync(configPath, 'utf-8');
      configContent = configContent.replace(/prefix: '.*'/, `prefix: '${newPrefix}'`);
      fs.writeFileSync(configPath, configContent);
      
      await extra.reply(`${bold('✅ PREFIX UPDATED')}\n\n_${pick(SLANG.good)}, prefix is now:_ ${newPrefix}\n\nnew command format: ${newPrefix}command`);
      
    } catch (error) {
      await extra.reply(`_${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};
