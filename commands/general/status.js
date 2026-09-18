/**
 * Status - Show bot status and statistics
 */

const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const { bold, italic, pick, SLANG } = require('../../utils/format');
const os = require('os');

module.exports = {
  name: 'status',
  aliases: ['botstats', 'stats'],
  category: 'general',
  description: 'Show bot status and statistics',
  usage: '.status',

  async execute(sock, msg, args, extra) {
    try {
      const commands = loadCommands();
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);

      const memUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
      const memTotal = (os.totalmem() / 1024 / 1024).toFixed(0);

      const text = [
        `✅ *KAMI BOT STATUS*`,
        ``,
        `⏱️ *Uptime:* ${hours}h ${minutes}m ${seconds}s`,
        `💾 *Memory:* ${memUsed}MB / ${memTotal}MB`,
        `📦 *Commands:* ${commands.size}`,
        `🤖 *Node:* ${process.version}`,
        `🌐 *Platform:* ${os.platform()} ${os.arch()}`,
        ``,
        `👑 *Owner:* ${config.ownerName || 'AG KAMI'}`,
        `⚡ *Prefix:* ${config.prefix || '.'}`,
        ``,
        `💡 _${config.prefix || '.'}menu for all commands_`
      ].join('\n');

      await extra.reply(text);
    } catch (error) {
      console.error('[STATUS] Error:', error);
      await extra.reply(`❌ *ERROR*\n💡 ${pick(SLANG.error)} — ${error.message}`);
    }
  }
};
