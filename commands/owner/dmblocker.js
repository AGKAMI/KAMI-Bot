/**
 * DM Blocker Command - Toggle private mode (blocks unknown numbers in DM)
 */

const database = require('../../database');
const { bold, italic, pick, SLANG } = require('../../utils/format');

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
          text: `🚫 ${bold('DM Blocker Configuration')}\n\n` +
               `${bold('Status')}: *${currentStatus}*\n\n` +
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
            text: `⚠️ _sho, DM Blocker is already *ON*_`
          }, { quoted: msg });
        }
        
        database.updateGlobalSettings({ selfMode: true });
        
        return await sock.sendMessage(chatId, {
          text: `✅ _lekke, dm blocker turned on_\n\n` +
               `Only whitelisted numbers can now use this bot.\n` +
               `Others will be blocked.`
        }, { quoted: msg });
      }
      
      if (action === 'off') {
        if (!globalSettings.selfMode) {
          return await sock.sendMessage(chatId, {
            text: `⚠️ _sho, DM Blocker is already *OFF*_`
          }, { quoted: msg });
        }
        
        database.updateGlobalSettings({ selfMode: false });
        
        return await sock.sendMessage(chatId, {
          text: `✅ _lekke, dm blocker turned off_\n\n` +
               `Anyone can now use this bot.`
        }, { quoted: msg });
      }
      
      return await sock.sendMessage(chatId, {
        text: `❌ _moegoe, invalid option. Use:\n` +
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