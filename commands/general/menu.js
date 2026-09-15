const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const { getChannelInfo } = require('../../utils/channelInfo');
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
        general:   { emoji: '🏠', label: 'General', desc: 'Bot info & utilities' },
        ai:        { emoji: '🤖', label: 'AI Core', desc: 'AI-powered features' },
        admin:     { emoji: '🛡️', label: 'Admin', desc: 'Group management' },
        owner:     { emoji: '👑', label: 'Owner', desc: 'Bot control panel' },
        media:     { emoji: '🎬', label: 'Media', desc: 'Download & convert' },
        fun:       { emoji: '🎉', label: 'Fun', desc: 'Entertainment' },
        games:     { emoji: '🎮', label: 'Games', desc: 'Play games' },
        utility:   { emoji: '🔧', label: 'Utility', desc: 'Tools & helpers' },
        anime:     { emoji: '⛩️', label: 'Anime', desc: 'Anime content' },
        textmaker: { emoji: '✨', label: 'Text Maker', desc: 'Stylish text' },
      };

      // Build overview text
      let overview = `*KAMI BOT*\n`;
      overview += `━━━━━━━━━━━━━━━━━━\n\n`;
      overview += `👋 Hey ${extra.pushName || 'User'}!\n\n`;
      overview += `📌 *${total} commands* available\n`;
      overview += `⚡ Prefix: *${prefix}*\n\n`;
      overview += `Select a category below to see commands:\n`;

      // Build list sections
      const sections = [];
      const order = ['general', 'ai', 'media', 'fun', 'games', 'utility', 'anime', 'textmaker', 'admin', 'owner'];

      for (const cat of order) {
        const list = categories[cat];
        if (!list || list.length === 0) continue;

        const meta = categoryMeta[cat];
        const rows = list
          .filter(item => item.name)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(cmd => ({
            title: `${prefix}${cmd.name}`,
            description: cmd.description || 'No description',
            rowId: `.help ${cmd.name}`
          }));

        sections.push({
          title: `${meta.emoji} ${meta.label}`,
          rows: rows
        });
      }

      // Send interactive list message
      const listMessage = {
        title: 'KAMI BOT MENU',
        description: overview,
        buttonText: 'Browse Commands',
        sections: sections,
        mentions: [extra.sender]
      };

      const channelInfo = getChannelInfo();

      // Try to send with image
      const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
      if (fs.existsSync(imagePath)) {
        const imageBuffer = fs.readFileSync(imagePath);
        await sock.sendMessage(extra.from, {
          image: imageBuffer,
          caption: overview,
          ...listMessage,
          ...channelInfo
        }, { quoted: msg });
      } else {
        await sock.sendMessage(extra.from, {
          ...listMessage,
          ...channelInfo
        }, { quoted: msg });
      }
    } catch (error) {
      console.error('[MENU] Error:', error);
      await extra.reply('Error: ' + error.message);
    }
  }
};
