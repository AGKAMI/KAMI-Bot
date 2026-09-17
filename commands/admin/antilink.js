/**
 * Antilink Command - Toggle antilink protection with delete/kick options
 */

const database = require('../../database');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'antilink',
  aliases: [],
  category: 'admin',
  description: 'Configure antilink protection (delete/kick/warn)',
  usage: '.antilink <on/off/set delete|kick|warn/get>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,
  
  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antilink ? 'ON' : 'OFF';
        const action = settings.antilinkAction || 'delete';
        return extra.reply(
          `🔗 ${bold('Antilink Status')}\n\n` +
          `${bold('Status')}: *${status}*\n` +
          `${bold('Action')}: *${action}*\n\n` +
          `Usage:\n` +
          `  .antilink on\n` +
          `  .antilink off\n` +
          `  .antilink set delete | kick | warn\n` +
          `  .antilink get\n\n` +
          `*Note:* warn = warn 3 times then auto-kick`
        );
      }
      
      const opt = args[0].toLowerCase();
      
      if (opt === 'on') {
        if (database.getGroupSettings(extra.from).antilink) {
          return extra.reply('✅ _sho, antilink is already on_');
        }
        database.updateGroupSettings(extra.from, { antilink: true });
        return extra.reply('✅ _lekke, antilink turned ON_');
      }
      
      if (opt === 'off') {
        database.updateGroupSettings(extra.from, { antilink: false });
        return extra.reply('✅ _antilink turned OFF_');
      }
      
      if (opt === 'set') {
        if (args.length < 2) {
          return extra.reply('❌ _moegoe, specify an action: .antilink set delete | kick | warn_');
        }
        
        const setAction = args[1].toLowerCase();
        if (!['delete', 'kick', 'warn'].includes(setAction)) {
          return extra.reply('❌ _moegoe, invalid action — choose delete, kick, or warn_');
        }
        
        database.updateGroupSettings(extra.from, { 
          antilinkAction: setAction,
          antilink: true // Auto-enable when setting action
        });
        return extra.reply(`✅ _lekke, antilink action set to ${setAction}_`);
      }
      
      if (opt === 'get') {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antilink ? 'ON' : 'OFF';
        const action = settings.antilinkAction || 'delete';
        return extra.reply(`${bold('antilink config:')}\nStatus: ${status}\nAction: ${action}`);
      }
      
      return extra.reply('❌ _moegoe, use .antilink for usage_');
      
    } catch (error) {
      await extra.reply(`❌ _moegoe, ${error.message}_`);
    }
  }
};
