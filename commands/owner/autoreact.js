/**
 * Auto-React Command - Configure automatic reactions
 */

const { load, save } = require('../../utils/autoReact');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'autoreact',
  aliases: ['ar'],
  category: 'owner',
  description: 'Configure automatic reactions to messages',
  usage: '.autoreact <on/off/set bot/set all>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        return extra.reply(`${bold('auto-react options')}\n\n• on - Enable auto-react\n• off - Disable auto-react\n• set bot - React only to bot commands\n• set all - React to all messages`);
      }

      const db = load();
      const opt = args.join(' ').toLowerCase();

      if (opt === 'on') {
        db.enabled = true;
        save(db);
        return extra.reply('✅ _lekke, auto-react enabled_');
      }

      if (opt === 'off') {
        db.enabled = false;
        save(db);
        return extra.reply('❌ _auto-react disabled_');
      }

      if (opt === 'set bot') {
        db.mode = 'bot';
        save(db);
        return extra.reply('🤖 _auto-react mode: bot commands only_');
      }

      if (opt === 'set all') {
        db.mode = 'all';
        save(db);
        return extra.reply('🌟 _Auto-react mode: All messages (random emojis)_');
      }

      extra.reply('❌ _moegoe, invalid option — use: on | off | set bot | set all_');
    } catch (err) {
      console.error('[autoreact cmd] error:', err);
      extra.reply("❌ _moegoe, couldn't configure auto-react_");
    }
  }
};
