/**
 * Anti-Call Command - Enable or disable anti-call system
 */

const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'anticall',
  category: 'owner',
  ownerOnly: true,
  description: 'Enable or disable anti-call system',
  usage: '.anticall on/off',

  async execute(sock, msg, args, extra) {
    if (!args[0]) {
      return extra.reply(`${bold('📞 ANTICALL')}\n\n_usage: .anticall on/off_`);
    }

    const option = args[0].toLowerCase();

    if (!['on', 'off'].includes(option)) {
      return extra.reply(`${bold('Usage:')} .anticall on/off`);
    }

    const enabled = option === 'on';

    // Update the default setting in config
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(__dirname, '../../config.js');
    
    try {
      // Read the current config file
      let configFile = fs.readFileSync(configPath, 'utf8');
      
      // Update the anticall setting
      if (enabled) {
        configFile = configFile.replace(/anticall:\s*false/g, 'anticall: true');
      } else {
        configFile = configFile.replace(/anticall:\s*true/g, 'anticall: false');
      }
      
      // Write the updated config file
      fs.writeFileSync(configPath, configFile);
      
      // Clear the config cache so the next require gets the updated version
      delete require.cache[require.resolve('../../config')];
      
      await extra.reply(
        enabled
          ? `${bold('✅ ANTICALL ON')}\n\n_${pick(SLANG.good)}, calls will be auto-rejected & blocked_`
          : `${bold('❌ ANTICALL OFF')}\n\n_${pick(SLANG.vibe)}, anti-call is now disabled_`
      );
    } catch (err) {
      console.error('[anticall cmd] error:', err);
      extra.reply(`_${pick(SLANG.error)} — couldn't update anti-call setting_`);
    }
  }
};