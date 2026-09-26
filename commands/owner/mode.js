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
  reactions: { received: '🔘', done: '🎛️' },
  aliases: ['botmode', 'privatemode', 'publicmode'],
  description: 'Toggle bot between private and public mode',
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
          `  ${prefix}mode private — Only owner can use\n` +
          `  ${prefix}mode public — Everyone can use`
        );
      }
      
      const mode = args[0].toLowerCase();
      
      if (mode === 'private' || mode === 'priv') {
        if (config.selfMode) {
          return extra.reply(`*🔒 PRIVATE MODE*\n\n⚠️ Bot already private, ${pick(SLANG.vibe)}`);
        }
        
        updateConfig('selfMode', true);
        config.selfMode = true;
        return extra.reply(`*🔒 PRIVATE MODE*\n\n✅ ${pick(SLANG.good)}, bot is now private — only owner can use commands`);
      }
      
      if (mode === 'public' || mode === 'pub') {
        if (!config.selfMode) {
          return extra.reply(`*🌐 PUBLIC MODE*\n\n⚠️ Bot already public, ${pick(SLANG.vibe)}`);
        }
        
        updateConfig('selfMode', false);
        config.selfMode = false;
        return extra.reply(`*🌐 PUBLIC MODE*\n\n✅ ${pick(SLANG.good)}, bot is now public — everyone can use commands`);
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
