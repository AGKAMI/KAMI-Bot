/**
 * List Command
 * Show all commands with descriptions
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const { sendButtons } = require('../../utils/buttonHelper');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'list',
  reactions: { received: '📃', done: '📚' },
  aliases: [],
  description: 'List all commands with descriptions',
  usage: '.list',
  category: 'general',
  
  async execute(sock, msg, args, extra) {
    try {
      const prefix = config.prefix;
      const commands = loadCommands();
      const categories = {};
      
      // Group commands by category
      commands.forEach((cmd, name) => {
        if (cmd.name === name) { // Only count main command names, not aliases
          const category = (cmd.category || 'other').toLowerCase();
          if (!categories[category]) {
            categories[category] = [];
          }
          categories[category].push({
            label: cmd.description || '',
            names: [cmd.name].concat(cmd.aliases || []),
          });
        }
      });
      
      let menu = `*${config.botName} - Commands List*\n`;
      menu += `Prefix: *${prefix}*\n\n`;
      
      const orderedCats = Object.keys(categories).sort();
      
      for (const cat of orderedCats) {
        menu += `*📂 ${cat.toUpperCase()}*\n`;
        for (const entry of categories[cat]) {
          const cmdList = entry.names.map((n) => `${prefix}${n}`).join(', ');
          const label = entry.label || '';
          menu += label ? `• \`${cmdList}\` - ${label}\n` : `• ${cmdList}\n`;
        }
        menu += '\n';
      }
      
      menu = menu.trimEnd();
      
      
      // Send message with buttons
      await sendButtons(sock, extra.from, {
        text: menu,
        footer: `> *Powered by ${config.botName}*`,
        buttons: [
          { text: 'Youtube', url: config.social?.youtube || 'http://youtube.com/@ag_kami' },
          { text: 'Visit Bot Repo', url: config.social?.github || 'https://github.com/AGKAMI' },
          { text: 'Join Channel', url: 'https://whatsapp.com/channel/0029VbAHHdPElah0PDVXGq3n' },
        ]
      }, msg);
      
    } catch (err) {
      console.error('list.js error:', err);
      await extra.reply(`❌ _${pick(SLANG.error)}, couldn't load the commands list_`);
    }
  }
};

