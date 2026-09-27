/**
 * SSWeb - Screenshot Website Command
 */

const APIs = require('../../utils/api');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');

module.exports = {
  name: 'ssweb',
  reactions: { received: '🌐', generating: '📷', done: '🖥️' },
  aliases: ['screenshot', 'ss', 'webss'],
  category: 'general',
  description: 'Take a screenshot of a website',
  usage: '.ssweb <url>',
  
  async execute(sock, msg, args, extra) {
    try {
      if (args.length === 0) {
        return extra.reply(`⚠️ *WARNING*\n💡 Give me a website link hey\n\n📝 *Example:* *.ssweb https://github.com*`);
      }
      
      let url = args.join(' ');
      
      // Auto-prepend https:// if no protocol
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      
      const screenshotBuffer = await APIs.screenshotWebsite(url);
      
      await sock.sendMessage(extra.from, {
        image: screenshotBuffer,
      }, { quoted: msg });
      
    } catch (error) {
      console.error('SSWeb command error:', error);
      extra.fail();
      await extra.reply(`❌ *ERROR*\n💡 ${voice.openErr()} — couldn't screenshot that site: ${error.message}`);
    }
  }
};

