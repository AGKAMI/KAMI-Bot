/**
 * Menu Command - Display all available commands
 * Style: Clean KAMI header + categorized sections
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

      // ── KAMI HEADER (Box Drawing) ──
      const header = `╔═╗╔╦╗╔═╗╔═╗╔╦╗
║ ║ ║ ║ ║ ║ ║║║
╚═╝ ╩ ╚═╝╚═╝ ╩ ╩

      KAMI BOT`;

      // ── META ──
      const meta = `\nEDITION: 1.0.0\nSIZE: ${total} COMMANDS\nPUBLISHER: ${displayOwner}\n`;

      // ── SECTION DIVIDER ──
      const divider = '◢◤◢◤◢◤◢◤◢◤◢◤';
      const endDivider = '◣◢◣◢◣◢◣◢◣◢◣◢◣◢◣◢';

      // ── SECTION BUILDER ──
      const section = (title, cmds, cols = 3) => {
        const lines = [];
        for (let i = 0; i < cmds.length; i += cols) {
          const row = [];
          for (let j = i; j < i + cols && j < cmds.length; j++) {
            row.push(prefix + cmds[j]);
          }
          // Pad each command to align columns
          const padded = row.map(c => c.padEnd(14)).join('');
          lines.push('        ' + padded.trimEnd());
        }
        return `\n${divider}\n\n        ${title}\n\n${endDivider}\n\n${lines.join('\n')}\n`;
      };

      // ── SECTION MAP ──
      const categoryMeta = {
        general:   { emoji: '⟡',  label: 'GENERAL' },
        ai:        { emoji: '⟁',  label: 'AI CORE' },
        admin:     { emoji: '✦',  label: 'ADMIN' },
        owner:     { emoji: '♛',  label: 'OWNER' },
        media:     { emoji: '◈',  label: 'MEDIA' },
        fun:       { emoji: '⚙',  label: 'FUN' },
        games:     { emoji: '🎲',  label: 'GAMES' },
        utility:   { emoji: '⚙',  label: 'UTILITY' },
        anime:     { emoji: '⟡',  label: 'ANIME' },
        textmaker: { emoji: '✎',  label: 'TEXT MAKER' },
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

        menuText += section(`${meta.emoji} ${meta.label} ${meta.emoji}`, rows);
      });

      menuText += `\n───────────────\n\n        ⟡ END OF TRANSMISSION ⟡\n`;

      await sock.sendMessage(extra.from, {
        text: menuText,
        mentions: [extra.sender]
      }, { quoted: msg });
    } catch (error) {
      await extra.reply('❌ error: ' + error.message);
    }
  }
};
