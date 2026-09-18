/**
 * Unmute Command - Open group (all members can send)
 */

const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
    name: 'unmute',
    aliases: ['open', 'opengroup'],
    category: 'admin',
    description: 'Open group (all members can send messages)',
    usage: '.unmute',
    groupOnly: true,
    adminOnly: true,
    botAdminNeeded: true,
    
    async execute(sock, msg, args, extra) {
      try {
        await sock.groupSettingUpdate(extra.from, 'not_announcement');
        await extra.reply(`🔓 UNMUTED\n\nGroup opened ${pick(SLANG.vibe)}\nEveryone can talk now`);
        
      } catch (error) {
        await extra.reply(`❌ ERROR\n\n${error.message}`);
      }
    }
  };
  