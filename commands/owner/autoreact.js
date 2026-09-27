/**
 * Auto-React Command - Configure automatic reactions
 */

const { load, save } = require('../../utils/autoReact');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');

module.exports = {
  name: 'autoreact',
  reactions: { received: '❤️', done: '😀' },
  aliases: ['ar'],
  category: 'owner',
  description: 'Set up automatic reactions to messages',
  usage: '.autoreact <on/off/set bot/set all>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        return extra.reply(`*🤖 AUTO-REACT OPTIONS*\n\n🔴 on — auto-react on\n⚫ off — auto-react off\n🤖 set bot — react only to bot commands\n🌟 set all — react to everything`);
      }

      const db = load();
      const opt = args.join(' ').toLowerCase();

      if (opt === 'on') {
        db.enabled = true;
        save(db);
        return extra.reply(`*✅ AUTO-REACT ON*\n\n✅ ${voice.lead('affirm')}, auto-react is on now`);
      }

      if (opt === 'off') {
        db.enabled = false;
        save(db);
        return extra.reply(`*❌ AUTO-REACT OFF*\n\n❌ ${voice.openErr()}, auto-react is off now`);
      }

      if (opt === 'set bot') {
        db.mode = 'bot';
        save(db);
        return extra.reply(`*🤖 BOT MODE*\n\n🤖 Auto-react mode: bot commands only, ne, ne`);
      }

      if (opt === 'set all') {
        db.mode = 'all';
        save(db);
        return extra.reply(`*🌟 ALL MODE*\n\n🌟 Auto-react mode: every message (random emojis)`);
      }

      extra.reply(`*❌ ERROR* — bad option\n\n*Usage:*\n  on | off | set bot | set all`);
    } catch (err) {
      console.error('[autoreact cmd] error:', err);
      extra.reply(`*❌ ERROR* — couldn't configure auto-react`);
    }
  }
};
