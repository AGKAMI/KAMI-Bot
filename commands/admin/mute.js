/**
 * Mute Command - Close group (only admins can send)
 */

const { bold, pick, SLANG } = require('../../utils/format');

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
        await sock.groupSettingUpdate(extra.from, 'announcement');
        await extra.reply(`🔒 _${pick(SLANG.vibe)}, group closed hey_\n\nonly admins can talk now`);
        
      } catch (error) {
        await extra.reply(`❌ _${pick(SLANG.error)} — ${error.message}_`);
      }
    }
  };
  