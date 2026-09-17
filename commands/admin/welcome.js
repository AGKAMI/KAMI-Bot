/**
 * Welcome - Enable/disable welcome messages
 */

const db = require('../../database');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'welcome',
  aliases: ['welcomeon', 'welcomeoff'],
  category: 'admin',
  description: 'Enable/disable welcome messages',
  usage: 'welcome on/off',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,
  execute: async (sock, msg, args) => {
    try {
      const groupId = msg.key.remoteJid;
      const action = args[0]?.toLowerCase();
      
      if (!action || !['on', 'off'].includes(action)) {
        const groupSettings = db.getGroupSettings(groupId);
        const status = groupSettings.welcome ? '✅ _Enabled_' : '❌ _Disabled_';
        return await sock.sendMessage(groupId, {
          text: `👋 ${bold('WELCOME MESSAGES')}\n\n${bold('Status')}: ${status}\n${bold('Message')}: ${groupSettings.welcomeMessage}\n\nUsage: .welcome on/off\n\nTo customize: .setwelcome <message>`
        }, { quoted: msg });
      }
      
      const enable = action === 'on';
      db.updateGroupSettings(groupId, { welcome: enable });
      
      await sock.sendMessage(groupId, {
        text: `✅ _${pick(SLANG.vibe)}, welcome messages ${enable ? 'enabled' : 'disabled'}${enable ? '\\n\\nnew members will get a welcome now' : ''}_`
      }, { quoted: msg });
      
    } catch (error) {
      console.error('Welcome Error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `❌ _${pick(SLANG.error)} — ${error.message}_`
      }, { quoted: msg });
    }
  }
};
