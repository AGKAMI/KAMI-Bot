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

      const channelInfo = getChannelInfo();

      // Send list message (without image - list messages can't have images)
      await sock.sendMessage(extra.from, {
        title: 'KAMI BOT MENU',
        description: `👋 Hey ${extra.pushName || 'User'}!\n\n📌 *${total} commands* available\n⚡ Prefix: *${prefix}*\n\nTap "Browse Commands" to see all commands.`,
        buttonText: 'Browse Commands',
        sections: sections,
        mentions: [extra.sender],
        ...channelInfo
      }, { quoted: msg });

    } catch (error) {
      console.error('[MENU] Error:', error);
      await extra.reply('Error: ' + error.message);
    }
  }
};
