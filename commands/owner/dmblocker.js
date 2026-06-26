/**
 * DM Blocker Command - Toggle private mode (blocks unknown numbers in DM)
 */

const database = require('../../database');

module.exports = {
  name: 'dmblocker',
  aliases: ['dmblock', 'private', 'selfmode'],
  category: 'owner',
  description: 'Toggle DM blocker (blocks unknown numbers)',
  usage: '.dmblocker on/off/status',
  ownerOnly: true,
  
  async execute(sock, msg, args) {
    try {
      const action = args[0]?.toLowerCase();
      const chatId = msg.key.remoteJid;
      
      // Get current selfMode from global settings
      const globalSettings = database.getGlobalSettings();
      const currentStatus = globalSettings.selfMode ? 'ON' : 'OFF';
      
      if (!action || action === 'status') {
        return await sock.sendMessage(chatId, {
          text: `🚫 *DM Blocker Configuration*\n\n` +
               `Status: *${currentStatus}*\n\n` +
               `When ON: Only whitelisted numbers can message the bot.\n` +
               `When OFF: Anyone can use the bot.\n\n` +
               `*Usage:*\n` +
               `  .dmblocker on\n` +
               `  .dmblocker off\n` +
               `  .dmblocker status`
        }, { quoted: msg });
      }
      
      if (action === 'on') {
        if (globalSettings.selfMode) {
          return await sock.sendMessage(chatId, {
            text: `⚠️ DM Blocker is already *ON*`
          }, { quoted: msg });
        }
        
        database.updateGlobalSettings({ selfMode: true });
        
        return await sock.sendMessage(chatId, {
          text: `✅ dm blocker turned on\n\n` +
               `Only whitelisted numbers can now use this bot.\n` +
               `Others will be blocked.`
        }, { quoted: msg });
      }
      
      if (action === 'off') {
        if (!globalSettings.selfMode) {
          return await sock.sendMessage(chatId, {
            text: `⚠️ DM Blocker is already *OFF*`
          }, { quoted: msg });
        }
        
        database.updateGlobalSettings({ selfMode: false });
        
        return await sock.sendMessage(chatId, {
          text: `✅ dm blocker turned off\n\n` +
               `Anyone can now use this bot.`
        }, { quoted: msg });
      }
      
      return await sock.sendMessage(chatId, {
        text: `❌ invalid option. Use:\n` +
             `  .dmblocker on\n` +
             `  .dmblocker off\n` +
             `  .dmblocker status`
      }, { quoted: msg });
      
    } catch (error) {
      console.error('DM Blocker Error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `❌ error: ${error.message}`
      }, { quoted: msg });
    }
  }
};