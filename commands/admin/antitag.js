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
          `📛 ANTITAG STATUS\n\n` +
          `*Status*: ${status}\n` +
          `*Action*: ${action}\n\n` +
          `📱 *Usage*:\n` +
          `• .antitag on\n` +
          `• .antitag off\n` +
          `• .antitag set delete | kick\n` +
          `• .antitag get`
        );
      }
      
      const opt = args[0].toLowerCase();
      
      if (opt === 'on') {
        if (database.getGroupSettings(extra.from).antitag) {
          return extra.reply(`✅ SUCCESS\n\nAntitag is already on ${pick(SLANG.vibe)}`);
        }
        database.updateGroupSettings(extra.from, { antitag: true });
        return extra.reply(`✅ SUCCESS\n\nAntitag turned ON ${pick(SLANG.good)}`);
      }
      
      if (opt === 'off') {
        database.updateGroupSettings(extra.from, { antitag: false });
        return extra.reply('✅ SUCCESS\n\nAntitag turned OFF');
      }
      
      if (opt === 'set') {
        if (args.length < 2) {
          return extra.reply(`❌ ERROR\n\nSpecify an action: .antitag set delete | kick`);
        }
        
        const setAction = args[1].toLowerCase();
        if (!['delete', 'kick'].includes(setAction)) {
          return extra.reply(`❌ ERROR\n\nInvalid action — choose delete or kick`);
        }
        
        database.updateGroupSettings(extra.from, { 
          antitagAction: setAction,
          antitag: true // Auto-enable when setting action
        });
        return extra.reply(`✅ SUCCESS\n\nAntitag action set to ${setAction} ${pick(SLANG.good)}`);
      }
      
      if (opt === 'get') {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antitag ? 'ON' : 'OFF';
        const action = settings.antitagAction || 'delete';
        return extra.reply(`📛 ANTITAG CONFIG\n\n*Status*: ${status}\n*Action*: ${action}`);
      }
      
      return extra.reply(`❌ ERROR\n\nUse .antitag for usage`);
      
    } catch (error) {
      await extra.reply(`❌ ERROR\n\n${error.message}`);
    }
  }
};
