/**
 * Mode Command
 * Toggle bot between private and public mode
 */

const config = require('../../config');
const fs = require('fs');
const path = require('path');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'mode',
  aliases: ['botmode', 'privatemode', 'publicmode'],
  description: 'Toggle bot between private and public mode',
  usage: '.mode <private/public>',
  category: 'owner',
  ownerOnly: true,
  
  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        const currentMode = config.selfMode ? 'private' : 'public';
        const description = config.selfMode 
          ? 'Only owner and sudo users can use commands'
          : 'Everyone can use commands';
        
        return extra.reply(
          `${bold('🤖 BOT MODE')}\n\n` +
          `${bold('Current Mode:')} *${currentMode.toUpperCase()}*\n` +
          `${bold('Status:')} ${description}\n\n` +
          `${bold('Usage:')}\n` +
          `  .mode private - Only owner can use\n` +
          `  .mode public - Everyone can use`
        );
      }
      
      const mode = args[0].toLowerCase();
      
      if (mode === 'private' || mode === 'priv') {
        if (config.selfMode) {
          return extra.reply(`${bold('🔒 PRIVATE MODE')}\n\n_bot already private, ${pick(SLANG.vibe)}_`);
        }
        
        updateConfig('selfMode', true);
        config.selfMode = true;
        return extra.reply(`${bold('🔒 PRIVATE MODE')}\n\n_${pick(SLANG.good)}, bot is now private — only owner can use commands_`);
      }
      
      if (mode === 'public' || mode === 'pub') {
        if (!config.selfMode) {
          return extra.reply(`${bold('🌐 PUBLIC MODE')}\n\n_bot already public, ${pick(SLANG.vibe)}_`);
        }
        
        updateConfig('selfMode', false);
        config.selfMode = false;
        return extra.reply(`${bold('🌐 PUBLIC MODE')}\n\n_${pick(SLANG.good)}, bot is now public — everyone can use commands_`);
      }
      
      return extra.reply(`${bold(pick(SLANG.error))} — invalid mode\nusage: .mode <private/public>`);
      
    } catch (error) {
      console.error('Mode command error:', error);
      await extra.reply(`_${pick(SLANG.error)} — couldn't change bot mode_`);
    }
  }
};

function updateConfig(key, value) {
  try {
    const configPath = path.join(__dirname, '..', '..', 'config.js');
    let configContent = fs.readFileSync(configPath, 'utf8');
    
    // Update the value
    const regex = new RegExp(`(${key}:\\s*)(true|false)`, 'g');
    configContent = configContent.replace(regex, `$1${value}`);
    
    fs.writeFileSync(configPath, configContent, 'utf8');
    
    // Reload config
    delete require.cache[require.resolve('../../config')];
  } catch (error) {
    console.error('Error saving config:', error);
  }
}

