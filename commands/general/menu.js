/**
 * Menu Command - Display all available commands
 * Style: Big KAMI header + ASCII-safe sections for mobile
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

      // ── BIG KAMI HEADER (as user liked) ──
      const header = `
██╗  ██╗ █████╗ ███╗   ███╗██╗
██║ ██╔╝██╔══██╗████╗ ████║██║
█████╔╝ ███████║██╔████╔██║██║
██╔═██╗ ██╔══██║██║╚██╔╝██║██║
██║  ██╗██║  ██║██║ ╚═╝ ██║██║
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝

           KAMI BOT`;

      // ── META ──
      const meta = `\nEDITION: 1.0.0\nSIZE: ${total} COMMANDS\nPUBLISHER: ${displayOwner}\n`;

      // ── HELPERS ──
      const pad = (text, len = 16) => {
        const clean = String(text);
        return clean.length >= len ? clean : clean + ' '.repeat(len - clean.length);
      };

      const section = (title, cmds, cols = 3) => {
        const lines = [];
        for (let i = 0; i < cmds.length; i += cols) {
          const row = [];
          for (let j = i; j < i + cols && j < cmds.length; j++) {
            row.push(pad(prefix + cmds[j].name, 16));
          }
          lines.push('  ' + row.join('').trimEnd());
        }
        return `\n${title}\n${'-'.repeat(28)}\n${lines.join('\n')}\n`;
      };

      // ── SECTION MAP ──
      const categoryMeta = {
        general:   { emoji: '🎙️',  label: 'GENERAL NEWS' },
        ai:        { emoji: '🤖',  label: 'AI INTELLIGENCE' },
        admin:     { emoji: '🛡️',  label: 'ADMIN COMMAND CENTER' },
        owner:     { emoji: '👑',  label: 'OWNER EDITION' },
        media:     { emoji: '🎬',  label: 'MEDIA WIRE' },
        fun:       { emoji: '🎮',  label: 'FUN & GAMES' },
        games:     { emoji: '🎲',  label: 'GAMES DESK' },
        utility:   { emoji: '🔧',  label: 'UTILITY TOOLS' },
        anime:     { emoji: '👾',  label: 'ANIME WAVE' },
        textmaker: { emoji: '🖋️',  label: 'TEXT FACTORY' },
      };

      const order = Object.keys(categoryMeta);

      // ── BUILD MENU ──
      let menuText = header + meta;

      order.forEach((cat) => {
        const list = categories[cat];
        if (!list || list.length === 0) return;

        const meta = categoryMeta[cat];
        const rows = list
          .filter((item) => item.name)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((item) => item.name);

        menuText += section(`${meta.emoji} ${meta.label}`, rows);
      });

      menuText += `\n─── END OF TRANSMISSION ───\n`;

      await sock.sendMessage(extra.from, {
        text: menuText,
        mentions: [extra.sender]
      }, { quoted: msg });
    } catch (error) {
      await extra.reply('❌ error: ' + error.message);
    }
  }
};
