/**
 * Anti-Call Command - Turn the anti-call system on or off
 */

const config = require('../../config');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');

module.exports = {
  name: 'anticall',
  reactions: { received: '📵', done: '🛡️' },
  category: 'owner',
  ownerOnly: true,
  description: 'Turn the anti-call system on or off',
  usage: '.anticall on/off',

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    if (!args[0]) {
      return extra.reply(`*📞 ANTICALL*\n\n💡 Usage: ${prefix}anticall on/off`);
    }

    const option = args[0].toLowerCase();

    if (!['on', 'off'].includes(option)) {
      return extra.reply(`*❌ ERROR* — invalid option\n💡 Usage: ${prefix}anticall on/off`);
    }

    const enabled = option === 'on';

    // Update the default setting in config
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(__dirname, '../../config.js');
    
    try {
      // Read the current config file
      const before = fs.readFileSync(configPath, 'utf8');

      // Flip only the anticall boolean literal — never a whole line, and only
      // after proving the line exists. A no-op replace used to still answer
      // "ANTICALL ON" while config.js never changed.
      const probe = enabled ? /anticall:\s*false/ : /anticall:\s*true/;
      if (!probe.test(before)) {
        extra.fail();
        return extra.reply(
          `*❌ ERROR* — no \`anticall:\` ${enabled ? 'false' : 'true'} line in config.js to flip`
        );
      }
      const configFile = before.replace(
        enabled ? /anticall:\s*false/g : /anticall:\s*true/g,
        m => m.replace(/false|true/, enabled ? 'true' : 'false')
      );

      // Write the updated config file
      fs.writeFileSync(configPath, configFile);
      
      // Clear the config cache so the next require gets the updated version
      delete require.cache[require.resolve('../../config')];
      
      await extra.reply(
        enabled
          ? `*✅ ANTICALL ON*\n\n✅ ${voice.lead('affirm')}, calls get auto-rejected & blocked`
          : `*❌ ANTICALL OFF*\n\n❌ ${voice.openErr()}, anti-call is off now`
      );
    } catch (err) {
      console.error('[anticall cmd] error:', err);
      extra.reply(`*❌ ERROR* — couldn't update anti-call setting`);
    }
  }
};
