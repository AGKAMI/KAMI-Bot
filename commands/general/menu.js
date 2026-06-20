/**
 * Menu Command - Display all available commands
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

      let menuText = '┏━━━━━━━━━━━━━━━━━━━━━━━━━ KAMI BOT ━━━━━━━━━━━━━━━━━━━━┓\n';
      menuText += '┃                                                      ┃\n';
      menuText += '┃  👋  hey, @' + extra.sender.split('@')[0] + '\n';
      menuText += '┃  ⚡  prefix: ' + config.prefix + '\n';
      menuText += '┃  📦  commands: ' + commands.size + '\n';
      menuText += '┃  👑  owner: ' + displayOwner + '\n';
      menuText += '┃                                                      ┃\n';
      menuText += '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n';

      const order = ['general', 'ai', 'group', 'admin', 'owner', 'media', 'fun', 'games', 'utility', 'anime', 'textmaker'];
      const injected = [];

      order.forEach((cat, index) => {
        const list = categories[cat];
        if (!list || list.length === 0) return;

        const head =
          cat === 'general'  ? '👤  general' :
          cat === 'ai'       ? '🤖  ai' :
          cat === 'group'    ? '👥  group' :
          cat === 'admin'    ? '🛡️  admin' :
          cat === 'owner'    ? '👑  owner' :
          cat === 'media'    ? '🎬  media' :
          cat === 'fun'      ? '🎮  fun' :
          cat === 'games'    ? '🎲  games' :
          cat === 'utility'  ? '🔧  utility' :
          cat === 'anime'    ? '👾  anime' :
          cat === 'textmaker'? '🖋️  textmaker' :
          '📁 ' + cat;

        menuText += head + '\n';

        const rows = list
          .filter(item => item.name)
          .sort((a, b) => a.name.localeCompare(b.name));

        rows.forEach(item => {
          menuText += '  ' + config.prefix + item.name + '\n';
        });

        menuText += '\n';
      });

      menuText += '✦ powered by kami bot\n\n';

      await sock.sendMessage(extra.from, {
        text: menuText,
        mentions: [extra.sender]
      }, { quoted: msg });
    } catch (error) {
      await extra.reply('❌ error: ' + error.message);
    }
  }
};
