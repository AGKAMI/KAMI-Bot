/**
 * Delete Command
 * Delete a replied message
 */

module.exports = {
  name: 'delete',
  aliases: ['del'],
  description: 'Delete a replied message',
  usage: '.delete (reply to a message)',
  category: 'admin',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,
  
  async execute(sock, msg, args, extra) {
    try {
      const { bold, pick, SLANG } = require('../../utils/format');
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      
      if (!ctx?.stanzaId || !ctx?.participant) {
        return extra.reply('🗑️ _reply to the message you wanna delete_');
      }
      
      const deleteKey = { 
        remoteJid: extra.from, 
        id: ctx.stanzaId, 
        participant: ctx.participant 
      };
      
      await sock.sendMessage(extra.from, { delete: deleteKey });
      
    } catch (error) {
      console.error('Delete command error:', error);
      await extra.reply("❌ _moegoe, couldn't delete that message hey_");
    }
  }
};

