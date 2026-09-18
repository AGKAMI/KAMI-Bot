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
          `🔗 ANTILINK STATUS\n\n` +
          `*Status*: ${status}\n` +
          `*Action*: ${action}\n\n` +
          `📱 *Usage*:\n` +
          `• .antilink on\n` +
          `• .antilink off\n` +
          `• .antilink set delete | kick | warn\n` +
          `• .antilink get\n\n` +
          `💡 Warn = warn 3 times then auto-kick ${pick(SLANG.vibe)}`
        );
      }
      
      const opt = args[0].toLowerCase();
      
      if (opt === 'on') {
        if (database.getGroupSettings(extra.from).antilink) {
          return extra.reply(`✅ SUCCESS\n\nAntilink is already on ${pick(SLANG.vibe)}`);
        }
        database.updateGroupSettings(extra.from, { antilink: true });
        return extra.reply(`✅ SUCCESS\n\nAntilink turned ON ${pick(SLANG.good)}`);
      }
      
      if (opt === 'off') {
        database.updateGroupSettings(extra.from, { antilink: false });
        return extra.reply('✅ SUCCESS\n\nAntilink turned OFF');
      }
      
      if (opt === 'set') {
        if (args.length < 2) {
          return extra.reply(`❌ ERROR\n\nSpecify an action: .antilink set delete | kick | warn`);
        }
        
        const setAction = args[1].toLowerCase();
        if (!['delete', 'kick', 'warn'].includes(setAction)) {
          return extra.reply(`❌ ERROR\n\nInvalid action — choose delete, kick, or warn`);
        }
        
        database.updateGroupSettings(extra.from, { 
          antilinkAction: setAction,
          antilink: true // Auto-enable when setting action
        });
        return extra.reply(`✅ SUCCESS\n\nAntilink action set to ${setAction} ${pick(SLANG.good)}`);
      }
      
      if (opt === 'get') {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antilink ? 'ON' : 'OFF';
        const action = settings.antilinkAction || 'delete';
        return extra.reply(`🔗 ANTILINK CONFIG\n\n*Status*: ${status}\n*Action*: ${action}`);
      }
      
      return extra.reply(`❌ ERROR\n\nUse .antilink for usage`);
      
    } catch (error) {
      await extra.reply(`❌ ERROR\n\n${error.message}`);
    }
  }
};
