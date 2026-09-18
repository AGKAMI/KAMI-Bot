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
          `🛡️ ANTIGROUPMENTION STATUS\n\n` +
          `*Status*: ${status}\n` +
          `*Action*: ${action}\n\n` +
          `📱 *Usage*:\n` +
          `• .antigroupmention on\n` +
          `• .antigroupmention off\n` +
          `• .antigroupmention set delete | kick | warn\n` +
          `• .antigroupmention get\n\n` +
          `💡 Warn = warn 3 times then auto-kick ${pick(SLANG.vibe)}`
        );
      }
      
      const opt = args[0].toLowerCase();
      
      if (opt === 'on') {
        if (database.getGroupSettings(extra.from).antigroupmention) {
          return extra.reply(`✅ SUCCESS\n\nAntigroupmention is already on ${pick(SLANG.vibe)}`);
        }
        database.updateGroupSettings(extra.from, { antigroupmention: true });
        return extra.reply(`✅ SUCCESS\n\nAntigroupmention turned ON ${pick(SLANG.good)}`);
      }
      
      if (opt === 'off') {
        database.updateGroupSettings(extra.from, { antigroupmention: false });
        return extra.reply('✅ SUCCESS\n\nAntigroupmention turned OFF');
      }
      
      if (opt === 'set') {
        if (args.length < 2) {
          return extra.reply(`❌ ERROR\n\nSpecify an action: .antigroupmention set delete | kick | warn`);
        }
        
        const setAction = args[1].toLowerCase();
        if (!['delete', 'kick', 'warn'].includes(setAction)) {
          return extra.reply(`❌ ERROR\n\nInvalid action — choose delete, kick, or warn`);
        }
        
        database.updateGroupSettings(extra.from, { 
          antigroupmentionAction: setAction,
          antigroupmention: true // Auto-enable when setting action
        });
        return extra.reply(`✅ SUCCESS\n\nAntigroupmention action set to ${setAction} ${pick(SLANG.good)}`);
      }
      
      if (opt === 'get') {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antigroupmention ? 'ON' : 'OFF';
        const action = settings.antigroupmentionAction || 'delete';
        return extra.reply(`🛡️ ANTIGROUPMENTION CONFIG\n\n*Status*: ${status}\n*Action*: ${action}`);
      }
      
      return extra.reply(`❌ ERROR\n\nUse .antigroupmention for usage`);
      
    } catch (error) {
      await extra.reply(`❌ ERROR\n\n${error.message}`);
    }
  }
};