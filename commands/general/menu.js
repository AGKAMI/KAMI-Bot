/**
 * Menu Command - Display all available commands
 * Style: Newspaper headline
 */

const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');

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
          if (!categories[cmd.category]) {
            categories[cmd.category] = [];
          }
          categories[cmd.category].push(cmd);
        }
      });

      const ownerNames = Array.isArray(config.ownerName) ? config.ownerName : [config.ownerName];
      const displayOwner = ownerNames[0] || config.ownerName || 'Bot Owner';

      const prefix = config.prefix || '.';
      const total = commands.size;

      const pad = (text, len = 28) => {
        const clean = String(text);
        return clean.length >= len ? clean : clean + ' '.repeat(len - clean.length);
      };

      const categoryMeta = {
        general:   { emoji: '🎙️', label: 'GENERAL NEWS' },
        ai:        { emoji: '🤖', label: 'AI INTELLIGENCE' },
        group:     { emoji: '👥', label: 'GROUP UPDATES' },
        admin:     { emoji: '🛡️', label: 'ADMIN COMMAND CENTER' },
        owner:     { emoji: '👑', label: 'OWNER EDITION' },
        media:     { emoji: '🎬', label: 'MEDIA WIRE' },
        fun:       { emoji: '🎮', label: 'FUN & GAMES' },
        games:     { emoji: '🎲', label: 'GAMES DESK' },
        utility:   { emoji: '🔧', label: 'UTILITY TOOLS' },
        anime:     { emoji: '👾', label: 'ANIME WAVE' },
        textmaker: { emoji: '🖋️', label: 'TEXT FACTORY' },
      };

      const order = Object.keys(categoryMeta);

      let menuText = '';
      menuText += '╭──────────────────────────╮\n';
      menuText += '│   🗞️  KAMI BOT PRESS  🗞️   │\n';
      menuText += '╰──────────────────────────╯\n\n';
      menuText += `EDITION: ${prefix === '.' ? '1.0.0' : prefix === '!' ? '2.0.0' : '1.0.0'}\n`;
      menuText += `SIZE: ${total} COMMANDS\n`;
      menuText += `PUBLISHER: ${displayOwner}\n\n`;

      order.forEach((cat) => {
        const list = categories[cat];
        if (!list || list.length === 0) return;

        const meta = categoryMeta[cat] || { emoji: '📁', label: cat.toUpperCase() };
        const rows = list
          .filter((item) => item.name)
          .sort((a, b) => a.name.localeCompare(b.name));

        menuText += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        menuText += `${meta.emoji} ${meta.label}\n`;
        menuText += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

        rows.forEach((item) => {
          menuText += `  ${pad(prefix + item.name, 34)}\n`;
        });

        menuText += '\n';
      });

      menuText += '─── END OF TRANSMISSION ───\n';

      await sock.sendMessage(extra.from, {
        text: menuText,
        mentions: [extra.sender]
      }, { quoted: msg });
    } catch (error) {
      await extra.reply('❌ error: ' + error.message);
    }
  }
};
