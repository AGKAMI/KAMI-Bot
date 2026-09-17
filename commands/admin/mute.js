/**
 * Mute Command - Close group (only admins can send)
 */

module.exports = {
    name: 'mute',
    aliases: ['close', 'closegroup'],
    category: 'admin',
    description: 'Close group (only admins can send messages)',
    usage: '.mute',
    groupOnly: true,
    adminOnly: true,
    botAdminNeeded: true,
    
    async execute(sock, msg, args, extra) {
      try {
        const { bold, pick, SLANG } = require('../../utils/format');
        await sock.groupSettingUpdate(extra.from, 'announcement');
        await extra.reply(`🔒 _lekke, group closed hey_\n\nonly admins can talk now`);
        
      } catch (error) {
        await extra.reply(`❌ _moegoe, ${error.message}_`);
      }
    }
  };
  