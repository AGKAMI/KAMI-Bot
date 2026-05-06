/**
 * Anti-Group Mention Command - Toggle antigroupmention protection with delete/kick/warn options
 */

const database = require('../../database');
const config = require('../../config');

module.exports = {
  name: 'antigroupmention',
  aliases: ['agm'],
  category: 'admin',
  description: 'Configure antigroupmention protection (delete/kick/warn)',
  usage: '.antigroupmention <on/off/get/set warn/delete/kick>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,
  
  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antigroupmention ? 'ON' : 'OFF';
        const action = settings.antigroupmentionAction || 'warn';
        
        let text = `📌 *Antigroupmention Configuration*\n\n`;
        text += `Status: *${status}*\n`;
        text += `Action: *${action}*\n`;
        
        if (action === 'warn') {
          text += `\n⚠️ Max Warnings: ${config.maxWarnings}\n`;
          text += `🔨 User will be kicked after ${config.maxWarnings} warnings (status mentions)`;
        }
        
        text += `\n\n*Usage:*\n`;
        text += `  .antigroupmention on/off\n`;
        text += `  .antigroupmention set warn | delete | kick\n`;
        text += `  .antigroupmention get`;
        
        return extra.reply(text);
      }
      
      const opt = args[0].toLowerCase();
      
      if (opt === 'on') {
        if (database.getGroupSettings(extra.from).antigroupmention) {
          return extra.reply('⚠️ *Antigroupmention is already ON*');
        }
        database.updateGroupSettings(extra.from, { antigroupmention: true });
        return extra.reply('⚠️ *Antigroupmention has been turned ON*\n\nStatus mentions will be handled.');
      }
      
      if (opt === 'off') {
        database.updateGroupSettings(extra.from, { antigroupmention: false });
        return extra.reply('✅ *Antigroupmention has been turned OFF*');
      }
      
      if (opt === 'set' && args[1]) {
        const setAction = args[1].toLowerCase();
        if (!['delete', 'kick', 'warn'].includes(setAction)) {
          return extra.reply('❌ *Invalid action.*\nChoose: delete, kick, or warn');
        }
        
        database.updateGroupSettings(extra.from, { 
          antigroupmentionAction: setAction,
          antigroupmention: true
        });
        
        const actionText = setAction === 'warn' 
          ? `${setAction} (user will be kicked after ${config.maxWarnings} warnings)`
          : setAction;
        return extra.reply(`⚠️ *Antigroupmention action set to ${actionText}*`);
      }
      
      if (opt === 'get') {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antigroupmention ? 'ON' : 'OFF';
        const action = settings.antigroupmentionAction || 'warn';
        return extra.reply(`*Antigroupmention Configuration:*\nStatus: ${status}\nAction: ${action}`);
      }
      
      // Handle direct action: .antigroupmention warn, .antigroupmention delete, .antigroupmention kick
      if (['delete', 'kick', 'warn'].includes(opt)) {
        database.updateGroupSettings(extra.from, { 
          antigroupmentionAction: opt,
          antigroupmention: true
        });
        
        const actionText = opt === 'warn' 
          ? `${opt} (user will be kicked after ${config.maxWarnings} warnings)`
          : opt;
        return extra.reply(`⚠️ *Antigroupmention action set to ${actionText}*`);
      }
      
      return extra.reply('*Use .antigroupmention for usage.*');
      
    } catch (error) {
      await extra.reply(`❌ Error: ${error.message}`);
    }
  }
};