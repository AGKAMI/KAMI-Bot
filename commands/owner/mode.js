/**
 * Mode Command
 * Toggle bot between private and public mode
 */

const config = require('../../config');
const fs = require('fs');
const path = require('path');

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
          `🤖 *bot mode*\n\n` +
          `Current Mode: *${currentMode.toUpperCase()}*\n` +
          `Status: ${description}\n\n` +
          `Usage:\n` +
          `  .mode private - Only owner can use\n` +
          `  .mode public - Everyone can use`
        );
      }
      
      const mode = args[0].toLowerCase();
      
      if (mode === 'private' || mode === 'priv') {
        if (config.selfMode) {
          return extra.reply('🔒 bot already in private mode\nonly owner can use commands');
        }
        
        // Update config
        updateConfig('selfMode', true);
        config.selfMode = true; // Update runtime config
        return extra.reply('🔒 bot mode changed to private\n\nonly owner can use commands now');
      }
      
      if (mode === 'public' || mode === 'pub') {
        if (!config.selfMode) {
          return extra.reply('🌐 bot already in *public* mode\nEveryone can use commands.');
        }
        
        // Update config
        updateConfig('selfMode', false);
        config.selfMode = false; // Update runtime config
        return extra.reply('🌐 bot mode changed to *public*\n\nEveryone can use commands now.');
      }
      
      return extra.reply('❌ invalid mode\nusage: .mode <private/public>');
      
    } catch (error) {
      console.error('Mode command error:', error);
      await extra.reply("❌ couldn't change bot mode");
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

