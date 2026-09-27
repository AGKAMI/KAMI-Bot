/**
 * Group Link Command - Get group invite link
 */

const { bold, pick, SLANG, voice } = require('../../utils/format');

module.exports = {
    name: 'grouplink',
    reactions: { received: '🔗', done: '🔓' },
    aliases: ['link', 'invite'],
    category: 'admin',
    description: 'Get group invite link',
    usage: '.grouplink',
    groupOnly: true,
    adminOnly: true,
    botAdminNeeded: true,
    
    async execute(sock, msg, args, extra) {
      try {
        const code = await sock.groupInviteCode(extra.from);
        const link = `https://chat.whatsapp.com/${code}`;
        
        let text = `🔗 GROUP INVITE LINK\n\n`;
        text += `📱 *Group*: ${extra.groupMetadata.subject}\n`;
        text += `🔗 *Link*: ${link}\n\n`;
        text += `⚠️ Don't share this publicly, ${voice.tag('neutral')}`;
        
        await extra.reply(text);
        
      } catch (error) {
        extra.fail();
        await extra.reply(`❌ ERROR\n\n${error.message}`);
      }
    }
  };
  