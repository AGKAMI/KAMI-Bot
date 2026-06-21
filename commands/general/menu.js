/**
 * Menu Command - Display all available commands
 * Style: Neon terminal / signal core
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

      // ── HEADER ──
      const HEADER = `\
██╗  ██╗ █████╗ ███╗   ███╗██╗
██║ ██╔╝██╔══██╗████╗ ████║██║
█████╔╝ ███████║██╔████╔██║██║
██╔═██╗ ██╔══██║██║╚██╔╝██║██║
██║  ██╗██║  ██║██║ ╚═╝ ██║██║
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝

           KAMI BOT`;

      // ── FOOTER ──
      const FOOTER = `╚════════════════════════════════════════════╝
        KAMI BOT • SIGNAL CORE ACTIVE`;

      // ── HELPERS ──
      const pad = (text, len = 10) => {
        const clean = String(text);
        return clean.length >= len ? clean : clean + ' '.repeat(len - clean.length);
      };

      const sectionBox = (title, cmds, col = 2) => {
        const width = 28;
        const titleLine = `  ${title}  `;
        const targetWidth = width - 6;
        const padLen = targetWidth - titleLine.length;
        const leftPad = ' '.repeat(Math.max(0, Math.floor(padLen / 2)));
        const rightPad = ' '.repeat(Math.max(0, padLen - Math.floor(padLen / 2)));
        const centered = leftPad + titleLine + rightPad;
        const top = `    ╱╲${centered}╱╲\n      ╱${'─'.repeat(width - 2)}╲`;

        const rows = [];
        for (let i = 0; i < cmds.length; i += col) {
          const row = [];
          for (let j = i; j < i + col && j < cmds.length; j++) {
            row.push(pad(cmds[j], 10));
          }
          rows.push('      ' + row.join('').rstrip());
        }

        const bottom = `      ╲${'─'.repeat(width - 2)}╱`;
        return `\n${top}\n${rows.join('\n')}\n${bottom}`;
      };

      const statusBlock = () => {
        const items = [
          ['ONLINE', '●', '🟢'],
          ['STABLE', '●', '🟡'],
          ['ACTIVE', '', '✅'],
          ['COMMANDS LOADED:', total.toString(), '📦'],
        ];
        const lines = items.map(([label, value, emoji]) => {
          return emoji ? `      ${label}  ${emoji} ${value}` : `      ${label}  ${value}`;
        }).join('\n');
        return `\n        ◈ SYSTEM STATUS ◈\n      ╱${'─'.repeat(26)}╲\n${lines}\n      ╲${'─'.repeat(26)}╱`;
      };

      // ── SECTION MAP ──
      const categoryMeta = {
        general:   { emoji: '🎙️',  label: 'GENERAL NODE' },
        ai:        { emoji: '🤖',  label: 'AI CORE' },
        admin:     { emoji: '🛡️',  label: 'ADMIN GRID' },
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
      let menuText = '';
      menuText += HEADER + '\n\n';

      order.forEach((cat) => {
        const list = categories[cat];
        if (!list || list.length === 0) return;

        const meta = categoryMeta[cat] || { emoji: '📁', label: cat.toUpperCase() };
        const rows = list
          .filter((item) => item.name)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((item) => prefix + item.name);

        menuText += sectionBox(meta.label, rows);
      });

      menuText += statusBlock();
      menuText += '\n\n';
      menuText += FOOTER + '\n';

      await sock.sendMessage(extra.from, {
        text: menuText,
        mentions: [extra.sender]
      }, { quoted: msg });
    } catch (error) {
      await extra.reply('❌ error: ' + error.message);
    }
  }
};
