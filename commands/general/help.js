const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'help',
  aliases: ['cmd', 'command'],
  category: 'general',
  description: 'Get detailed info about a command',
  usage: '.help <command>',

  async execute(sock, msg, args, extra) {
    try {
      const commands = loadCommands();
      const prefix = config.prefix || '.';

      if (!args[0]) {
        return extra.reply(
          `*Command Help*\n\n` +
          `Usage: ${prefix}help <command>\n` +
          `Example: ${prefix}help song\n\n` +
          `Type ${prefix}menu to see all commands.`
        );
      }

      const cmdName = args[0].toLowerCase().replace(prefix, '');
      const cmd = commands.get(cmdName);

      if (!cmd) {
        return extra.reply(`Command "${cmdName}" not found.\nType ${prefix}menu to see all commands.`);
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
        `*${prefix}${cmd.name}*`,
        `----------`,
        ``,
        `📝 *Description:* ${cmd.description || 'No description'}`,
        `📂 *Category:* ${categoryMeta[cmd.category] || cmd.category}`,
        `🔗 *Aliases:* ${aliases}`,
        `📖 *Usage:* ${cmd.usage || `${prefix}${cmd.name}`}`,
        ``,
        `💡 _Tip: Use ${prefix}menu to browse all commands._`
      ].join('\n');

      await extra.reply(text);
    } catch (error) {
      console.error('[HELP] Error:', error);
      await extra.reply(`❌ _${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};
