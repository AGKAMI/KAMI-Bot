const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const { bold, italic, pick, SLANG } = require('../../utils/format');
const fs = require('fs');
const path = require('path');

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
        media:     { emoji: '🎬', label: 'Media' },
        fun:       { emoji: '🎉', label: 'Fun' },
        games:     { emoji: '🎮', label: 'Games' },
        utility:   { emoji: '🔧', label: 'Utility' },
        anime:     { emoji: '⛩️', label: 'Anime' },
        textmaker: { emoji: '✨', label: 'Text Maker' },
        admin:     { emoji: '🛡️', label: 'Admin' },
        owner:     { emoji: '👑', label: 'Owner' },
      };

      const order = ['general', 'ai', 'media', 'fun', 'games', 'utility', 'anime', 'textmaker', 'admin', 'owner'];

      const line = () => '----------';

      let text = '';
      text += `*KAMI BOT*\n`;
      text += `${line(20)}\n\n`;
      text += `*HOWZIT* ${extra.pushName || 'User'}! 👋\n`;
      text += `${total} *commands* available\n`;
      text += `Prefix: ${bold(prefix)}\n\n`;

      for (const cat of order) {
        const list = categories[cat];
        if (!list || list.length === 0) continue;

        const meta = categoryMeta[cat];
        const sorted = list
          .filter(item => item.name)
          .sort((a, b) => a.name.localeCompare(b.name));

        text += `${meta.emoji} *${meta.label.toUpperCase()}*\n`;
        text += `${line(15)}\n`;

        for (const cmd of sorted) {
          const desc = cmd.description ? ` — \`${cmd.description}\`` : '';
          text += `${prefix}${cmd.name}${desc}\n`;
        }

        text += '\n';
      }

      text += `${line(20)}\n`;
      text += `_Use ${prefix}help <cmd> for info_`;

      // Check for custom menu image
      const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
      if (fs.existsSync(imagePath)) {
        const imageBuffer = fs.readFileSync(imagePath);
        await sock.sendMessage(extra.from, {
          image: imageBuffer,
          caption: text
        }, { quoted: msg });
      } else {
        await sock.sendMessage(extra.from, { text: text }, { quoted: msg });
      }

    } catch (error) {
      console.error('[MENU] Error:', error);
      await extra.reply(`❌ _${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};
