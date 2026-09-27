/**
 * Mode Command
 * Flip the bot between private and public
 */

const config = require('../../config');
const fs = require('fs');
const path = require('path');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');

module.exports = {
  name: 'mode',
  reactions: { received: '🔘', done: '🎛️' },
  aliases: ['botmode', 'privatemode', 'publicmode'],
  description: 'Flip the bot between private and public',
  usage: '.mode <private/public>',
  category: 'owner',
  ownerOnly: true,
  
  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      if (!args[0]) {
        const currentMode = config.selfMode ? 'private' : 'public';
        const description = config.selfMode 
          ? 'Only owner and sudo users can use commands'
          : 'Everyone can use commands';
        
        return extra.reply(
          `*🤖 BOT MODE*\n\n` +
          `📋 *Current Mode:* *${currentMode.toUpperCase()}*\n` +
          `📝 *Status:* ${description}\n\n` +
          `*Usage:*\n` +
          `  ${prefix}mode private — owner only\n` +
          `  ${prefix}mode public — anyone can use`
        );
      }
      
      const mode = args[0].toLowerCase();
      
      if (mode === 'private' || mode === 'priv') {
        if (config.selfMode) {
          return extra.reply(`*🔒 PRIVATE MODE*\n\n⚠️ Bot is already private`);
        }
        
        updateConfig('selfMode', true);
        config.selfMode = true;
        return extra.reply(`*🔒 PRIVATE MODE*\n\n✅ ${voice.lead('affirm')}, bot is private now — owner only`);
      }
      
      if (mode === 'public' || mode === 'pub') {
        if (!config.selfMode) {
          return extra.reply(`*🌐 PUBLIC MODE*\n\n⚠️ Bot is already public`);
        }
        
        updateConfig('selfMode', false);
        config.selfMode = false;
        return extra.reply(`*🌐 PUBLIC MODE*\n\n✅ ${voice.lead('affirm')}, bot is public now — everyone is in`);
      }
      
      return extra.reply(`*❌ ERROR* — invalid mode\n💡 Usage: ${prefix}mode <private/public>`);
      
    } catch (error) {
      console.error('Mode command error:', error);
      await extra.reply(`*❌ ERROR* — couldn't change bot mode`);
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
