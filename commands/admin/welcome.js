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
  ownerOnly: false, adminOnly: true,
  botAdminNeeded: true,
  execute: async (sock, msg, args) => {
    try {
      const groupId = msg.key.remoteJid;
      const action = args[0]?.toLowerCase();
      
      if (!action || !['on', 'off'].includes(action)) {
        const groupSettings = db.getGroupSettings(groupId);
        const status = groupSettings.welcome ? '✅ Enabled' : '❌ Disabled';
        return await sock.sendMessage(groupId, {
          text: `👋 WELCOME MESSAGES\n\n*Status*: ${status}\n*Message*: ${groupSettings.welcomeMessage}\n\n📱 *Usage*: .welcome on/off\n💡 *Customize*: .setwelcome <message>`
        }, { quoted: msg });
      }
      
      const enable = action === 'on';
      db.updateGroupSettings(groupId, { welcome: enable });
      
      await sock.sendMessage(groupId, {
        text: `✅ SUCCESS\n\nWelcome messages ${enable ? 'enabled' : 'disabled'} ${pick(SLANG.vibe)}${enable ? '\n\nNew members will get a welcome now' : ''}`
      }, { quoted: msg });
      
    } catch (error) {
      console.error('Welcome Error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `❌ ERROR\n\n${error.message}`
      }, { quoted: msg });
    }
  }
};
