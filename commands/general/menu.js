const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'menu',
  aliases: ['help', 'commands'],
  category: 'general',
  description: 'Show all available commands',
  usage: '.menu',

  async execute(sock, msg, args, extra) {
    try {
      const commands = loadCommands();
      const categories = {};

      commands.forEach((cmd, name) => {
        if (cmd.name === name) {
          if (!categories[cmd.category]) categories[cmd.category] = [];
          categories[cmd.category].push(cmd);
        }
      });

      const prefix = config.prefix || '.';
      const total = commands.size;

      const categoryMeta = {
        general:   { emoji: '🏠', label: 'General' },
        ai:        { emoji: '🤖', label: 'AI' },
        admin:     { emoji: '🛡️', label: 'Admin' },
        owner:     { emoji: '👑', label: 'Owner' },
        media:     { emoji: '🎬', label: 'Media' },
        fun:       { emoji: '🎉', label: 'Fun' },
        games:     { emoji: '🎮', label: 'Games' },
        utility:   { emoji: '🔧', label: 'Utility' },
        anime:     { emoji: '⛩️', label: 'Anime' },
        textmaker: { emoji: '✨', label: 'Text Maker' },
      };

      const order = ['general', 'ai', 'media', 'fun', 'games', 'utility', 'anime', 'textmaker', 'admin', 'owner'];

      let text = `----------\n*KAMI BOT*\n----------\n\n`;
      text += `${bold('HOWZIT')} ${extra.pushName || 'User'}! 👋\n`;
      text += `📌 *${total} commands* available\n`;
      text += `⚡ Prefix: *${prefix}*\n----------\n\n`;

      for (const cat of order) {
        const list = categories[cat];
        if (!list || list.length === 0) continue;

        const meta = categoryMeta[cat];
        const cmds = list
          .filter(item => item.name)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(cmd => `${prefix}${cmd.name}`)
          .join(', ');

        text += `${meta.emoji} *${meta.label}*\n${cmds}\n\n`;
      }

      text += `----------\n- Use ${prefix}help <cmd>\n  for command info\n----------`;

      await sock.sendMessage(extra.from, { text: text }, { quoted: msg });

    } catch (error) {
      console.error('[MENU] Error:', error);
      await extra.reply(`❌ _${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};
