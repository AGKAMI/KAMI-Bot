/**
 * Unmute Command - Open group (all members can send)
 */

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
        const { bold, pick, SLANG } = require('../../utils/format');
        await sock.groupSettingUpdate(extra.from, 'not_announcement');
        await extra.reply(`🔓 _lekke, group opened hey_\n\neveryone can talk now`);
        
      } catch (error) {
        await extra.reply(`❌ _moegoe, ${error.message}_`);
      }
    }
  };
  