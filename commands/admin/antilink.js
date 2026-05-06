/**
 * Antilink Command - Toggle antilink protection with delete/kick/warn options
 */

const database = require('../../database');
const config = require('../../config');

module.exports = {
  name: 'antilink',
  aliases: [],
  category: 'admin',
  description: 'Configure antilink protection (delete/kick/warn)',
  usage: '.antilink <on/off/get/set warn/delete/kick>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,
  
  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antilink ? 'ON' : 'OFF';
        const action = settings.antilinkAction || 'warn';
        const warnings = settings.antilinkAction === 'warn' ? database.getWarnings(extra.from, msg.key.participant) : null;
        
        let text = `🔗 *Antilink Configuration*\n\n`;
        text += `Status: *${status}*\n`;
        text += `Action: *${action}*\n`;
        
        if (action === 'warn') {
          text += `\n⚠️ Max Warnings: ${config.maxWarnings}\n`;
          text += `🔨 User will be kicked after ${config.maxWarnings} warnings`;
        }
        
        text += `\n\n*Usage:*\n`;
        text += `  .antilink on/off\n`;
        text += `  .antilink set warn | delete | kick\n`;
        text += `  .antilink get`;
        
        return extra.reply(text);
      }
      
      const opt = args[0].toLowerCase();
      
      if (opt === 'on') {
        if (database.getGroupSettings(extra.from).antilink) {
          return extra.reply('⚠️ *Antilink is already ON*');
        }
        database.updateGroupSettings(extra.from, { antilink: true });
        return extra.reply('⚠️ *Antilink has been turned ON*\n\nLinks will be deleted/warned.');
      }
      
      if (opt === 'off') {
        database.updateGroupSettings(extra.from, { antilink: false });
        return extra.reply('✅ *Antilink has been turned OFF*');
      }
      
      if (opt === 'set' && args[1]) {
        const setAction = args[1].toLowerCase();
        if (!['delete', 'kick', 'warn'].includes(setAction)) {
          return extra.reply('❌ *Invalid action.*\nChoose: delete, kick, or warn');
        }
        
        database.updateGroupSettings(extra.from, { 
          antilinkAction: setAction,
          antilink: true
        });
        
        const actionText = setAction === 'warn' 
          ? `${setAction} (user will be kicked after ${config.maxWarnings} warnings)`
          : setAction;
        return extra.reply(`⚠️ *Antilink action set to ${actionText}*`);
      }
      
      if (opt === 'get') {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antilink ? 'ON' : 'OFF';
        const action = settings.antilinkAction || 'warn';
        return extra.reply(`*Antilink Configuration:*\nStatus: ${status}\nAction: ${action}`);
      }
      
      // Handle direct action: .antilink warn, .antilink delete, .antilink kick
      if (['delete', 'kick', 'warn'].includes(opt)) {
        database.updateGroupSettings(extra.from, { 
          antilinkAction: opt,
          antilink: true
        });
        
        const actionText = opt === 'warn' 
          ? `${opt} (user will be kicked after ${config.maxWarnings} warnings)`
          : opt;
        return extra.reply(`⚠️ *Antilink action set to ${actionText}*`);
      }
      
      return extra.reply('*Use .antilink for usage.*');
      
    } catch (error) {
      await extra.reply(`❌ Error: ${error.message}`);
    }
  }
};
