/**
 * AntiTag Command
 * Enable/disable anti-tag and set action (delete/kick)
 */

const database = require('../../database');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'antitag',
  aliases: ['antimention', 'at'],
  description: 'Configure anti-tag protection (tagall/hidetag)',
  usage: '.antitag <on/off/set/get>',
  category: 'admin',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,
  
  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antitag ? 'ON' : 'OFF';
        const action = settings.antitagAction || 'delete';
        return extra.reply(
          `📛 ${bold('ANTITAG STATUS')}: *${status}*\n` +
          `${bold('Action')}: *${action}*\n\n` +
          `Usage:\n` +
          `  .antitag on\n` +
          `  .antitag off\n` +
          `  .antitag set delete | kick\n` +
          `  .antitag get`
        );
      }
      
      const opt = args[0].toLowerCase();
      
      if (opt === 'on') {
        if (database.getGroupSettings(extra.from).antitag) {
          return extra.reply(`✅ _${pick(SLANG.vibe)}, antitag is already on_`);
        }
        database.updateGroupSettings(extra.from, { antitag: true });
        return extra.reply(`✅ _${pick(SLANG.good)}, antitag turned ON_`);
      }
      
      if (opt === 'off') {
        database.updateGroupSettings(extra.from, { antitag: false });
        return extra.reply('✅ _antitag turned OFF_');
      }
      
      if (opt === 'set') {
        if (args.length < 2) {
          return extra.reply(`❌ _${pick(SLANG.error)}, specify an action: .antitag set delete | kick_`);
        }
        
        const setAction = args[1].toLowerCase();
        if (!['delete', 'kick'].includes(setAction)) {
          return extra.reply(`❌ _${pick(SLANG.error)}, invalid action — choose delete or kick_`);
        }
        
        database.updateGroupSettings(extra.from, { 
          antitagAction: setAction,
          antitag: true // Auto-enable when setting action
        });
        return extra.reply(`✅ _${pick(SLANG.good)}, antitag action set to ${setAction}_`);
      }
      
      if (opt === 'get') {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antitag ? 'ON' : 'OFF';
        const action = settings.antitagAction || 'delete';
        return extra.reply(`${bold('ANTITAG CONFIG')}\n${bold('Status')}: ${status}\n${bold('Action')}: ${action}`);
      }
      
      return extra.reply(`❌ _${pick(SLANG.error)}, use .antitag for usage_`);
      
    } catch (error) {
      await extra.reply(`❌ _${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};
