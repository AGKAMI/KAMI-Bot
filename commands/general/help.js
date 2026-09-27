const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');

let cachedCommands = null;
function getCommands() {
  if (!cachedCommands) cachedCommands = loadCommands();
  return cachedCommands;
}

module.exports = {
  name: 'help',
  reactions: { received: '❓', done: '📖' },
  aliases: ['cmd', 'command'],
  category: 'general',
  description: 'Get the full story on any command',
  usage: '.help <command>',

  async execute(sock, msg, args, extra) {
    try {
      const commands = getCommands();
      const prefix = config.prefix || '.';

      if (!args[0]) {
        return extra.reply(
          `📖 *COMMAND HELP*\n\n` +
          `💡 *Usage:* ${prefix}help <command>\n` +
          `📝 *Example:* ${prefix}help song\n\n` +
          ` Check ${prefix}menu for the full list.`
        );
      }

      const cmdName = args[0].toLowerCase().startsWith(prefix) ? args[0].toLowerCase().slice(prefix.length) : args[0].toLowerCase();
      const cmd = commands.get(cmdName);

      if (!cmd) {
        extra.fail();
        return extra.reply(`âŒ *NOT FOUND*\n No command called "${cmdName}"\n💡 Try ${prefix}menu for the whole list.`);
      }

      const aliases = cmd.aliases && cmd.aliases.length > 0
        ? cmd.aliases.map(a => `${prefix}${a}`).join(', ')
        : 'None';

      const categoryMeta = {
        general: '🏠 General',
        ai: '🤖 AI Core',
        admin: '🛡️ Admin',
        owner: '👑 Owner',
        media: '🎬 Media',
        fun: '🎉 Fun',
        games: '🎮 Games',
        utility: '🔧 Utility',
        anime: '⛩️ Anime',
        textmaker: '✨ Text Maker',
      };

      const text = [
        `📋 *${prefix}${cmd.name}*`,
        ``,
        `📝 *Description:* ${cmd.description || 'No description'}`,
        `📂 *Category:* ${categoryMeta[cmd.category] || cmd.category}`,
        `🔗 *Aliases:* ${aliases}`,
        `📖 *Usage:* ${(cmd.usage || `${prefix}${cmd.name}`).replace(/^\./, prefix)}`,
        ``,
        `💡 _Tip: ${prefix}menu has everything, check it shame._`
      ].join('\n');

      await extra.reply(text);
    } catch (error) {
      console.error('[HELP] Error:', error);
      extra.fail();
      await extra.reply(`❌ *ERROR*\n💡 ${voice.openErr()} — ${error.message}`);
    }
  }
};
