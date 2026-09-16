const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const { getChannelInfo } = require('../../utils/channelInfo');

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

      let text = `╭━━━≪ *KAMI BOT* ≫━━━╮\n\n`;
      text += `👋 Hey ${extra.pushName || 'User'}!\n`;
      text += `📌 *${total} commands* available\n`;
      text += `⚡ Prefix: *${prefix}*\n\n`;

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

      text += `╭━━━━━━━━━━━━━━━╮\n`;
      text += `│ Use ${prefix}help <cmd>\n`;
      text += `│ for command info\n`;
      text += `╰━━━━━━━━━━━━━━━╯`;

      const channelInfo = getChannelInfo();

      await sock.sendMessage(extra.from, {
        text,
        mentions: [extra.sender],
        ...channelInfo
      }, { quoted: msg });

    } catch (error) {
      console.error('[MENU] Error:', error);
      await extra.reply('Error: ' + error.message);
    }
  }
};
