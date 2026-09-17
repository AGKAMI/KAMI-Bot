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
        return extra.reply(`${bold('🤖 AUTO-REACT OPTIONS')}\n\n• on - Enable auto-react\n• off - Disable auto-react\n• set bot - React only to bot commands\n• set all - React to all messages`);
      }

      const db = load();
      const opt = args.join(' ').toLowerCase();

      if (opt === 'on') {
        db.enabled = true;
        save(db);
        return extra.reply(`${bold('✅ AUTO-REACT ON')}\n\n_${pick(SLANG.good)}, auto-react is now enabled_`);
      }

      if (opt === 'off') {
        db.enabled = false;
        save(db);
        return extra.reply(`${bold('❌ AUTO-REACT OFF')}\n\n_${pick(SLANG.vibe)}, auto-react is now disabled_`);
      }

      if (opt === 'set bot') {
        db.mode = 'bot';
        save(db);
        return extra.reply(`${bold('🤖 BOT MODE')}\n\n_auto-react mode: bot commands only_`);
      }

      if (opt === 'set all') {
        db.mode = 'all';
        save(db);
        return extra.reply(`${bold('🌟 ALL MODE')}\n\n_auto-react mode: all messages (random emojis)_`);
      }

      extra.reply(`${bold(pick(SLANG.error))} — invalid option\n\n${bold('Usage:')}\n  on | off | set bot | set all`);
    } catch (err) {
      console.error('[autoreact cmd] error:', err);
      extra.reply(`_${pick(SLANG.error)} — couldn't configure auto-react_`);
    }
  }
};
