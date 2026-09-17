/**
 * SSWeb - Screenshot Website Command
 */

const APIs = require('../../utils/api');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'ssweb',
  aliases: ['screenshot', 'ss', 'webss'],
  category: 'general',
  description: 'Take a screenshot of a website',
  usage: '.ssweb <url>',
  
  async execute(sock, msg, args, extra) {
    try {
      if (args.length === 0) {
        return extra.reply(`${italic('give me a website link hey')}\n\nExample: ${bold('.ssweb https://github.com')}`);
      }
      
      const url = args.join(' ');
      
      // Validate URL
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return extra.reply(`${italic('need a valid url starting with http:// or https://')}`);
      }
      
      await sock.sendMessage(extra.from, {
        react: { text: '📥', key: msg.key }
      });
      
      const screenshotBuffer = await APIs.screenshotWebsite(url);
      
      await sock.sendMessage(extra.from, {
        image: screenshotBuffer,
      }, { quoted: msg });
      
    } catch (error) {
      console.error('SSWeb command error:', error);
      await extra.reply(`❌ _${pick(SLANG.error)} — couldn't screenshot that site: ${error.message}_`);
    }
  }
};

