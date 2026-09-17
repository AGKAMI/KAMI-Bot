/**
 * Anti-Group Mention Command - Toggle antigroupmention protection with delete/kick options
 */

const database = require('../../database');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'antigroupmention',
  aliases: ['agm'],
  category: 'admin',
  description: 'Configure antigroupmention protection (delete/kick/warn)',
  usage: '.antigroupmention <on/off/set delete|kick|warn/get>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,
  
  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antigroupmention ? 'ON' : 'OFF';
        const action = settings.antigroupmentionAction || 'delete';
        return extra.reply(
          `${bold('Antigroupmention Status')}\n\n` +
          `${bold('Status')}: *${status}*\n` +
          `${bold('Action')}: *${action}*\n\n` +
          `Usage:\n` +
          `  .antigroupmention on\n` +
          `  .antigroupmention off\n` +
          `  .antigroupmention set delete | kick | warn\n` +
          `  .antigroupmention get\n\n` +
          `*Note:* warn = warn 3 times then auto-kick`
        );
      }
      
      const opt = args[0].toLowerCase();
      
      if (opt === 'on') {
        if (database.getGroupSettings(extra.from).antigroupmention) {
          return extra.reply(`✅ _sho, antigroupmention is already on_`);
        }
        database.updateGroupSettings(extra.from, { antigroupmention: true });
        return extra.reply('✅ _lekke, antigroupmention turned ON_');
      }
      
      if (opt === 'off') {
        database.updateGroupSettings(extra.from, { antigroupmention: false });
        return extra.reply('✅ _antigroupmention turned OFF_');
      }
      
      if (opt === 'set') {
        if (args.length < 2) {
          return extra.reply(`❌ _moegoe, specify an action: .antigroupmention set delete | kick | warn_`);
        }
        
        const setAction = args[1].toLowerCase();
        if (!['delete', 'kick', 'warn'].includes(setAction)) {
          return extra.reply('❌ _moegoe, invalid action — choose delete, kick, or warn_');
        }
        
        database.updateGroupSettings(extra.from, { 
          antigroupmentionAction: setAction,
          antigroupmention: true // Auto-enable when setting action
        });
        return extra.reply(`✅ _lekke, antigroupmention action set to ${setAction}_`);
      }
      
      if (opt === 'get') {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antigroupmention ? 'ON' : 'OFF';
        const action = settings.antigroupmentionAction || 'delete';
        return extra.reply(`${bold('antigroupmention config:')}\nStatus: ${status}\nAction: ${action}`);
      }
      
      return extra.reply('❌ _moegoe, use .antigroupmention for usage_');
      
    } catch (error) {
      await extra.reply(`❌ _moegoe, ${error.message}_`);
    }
  }
};