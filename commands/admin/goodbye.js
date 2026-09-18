/**
 * Goodbye - Enable/disable goodbye messages
 */

const db = require('../../database');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'goodbye',
  aliases: ['goodbyeon', 'goodbyeoff'],
  category: 'admin',
  description: 'Enable/disable goodbye messages',
  usage: 'goodbye on/off',
  groupOnly: true,
  ownerOnly: false, adminOnly: true,
  botAdminNeeded: true,
  execute: async (sock, msg, args) => {
    try {
      const groupId = msg.key.remoteJid;
      const action = args[0]?.toLowerCase();
      
      if (!action || !['on', 'off'].includes(action)) {
        const groupSettings = db.getGroupSettings(groupId);
        const status = groupSettings.goodbye ? '✅ Enabled' : '❌ Disabled';
        return await sock.sendMessage(groupId, {
          text: `👋 GOODBYE MESSAGES\n\n*Status*: ${status}\n*Message*: ${groupSettings.goodbyeMessage}\n\n📱 *Usage*: .goodbye on/off\n💡 *Customize*: .setgoodbye <message>`
        }, { quoted: msg });
      }
      
      const enable = action === 'on';
      db.updateGroupSettings(groupId, { goodbye: enable });
      
      await sock.sendMessage(groupId, {
        text: `✅ SUCCESS\n\nGoodbye messages ${enable ? 'enabled' : 'disabled'} ${pick(SLANG.vibe)}${enable ? '\n\nLeaving members will get a goodbye now' : ''}`
      }, { quoted: msg });
      
    } catch (error) {
      console.error('Goodbye Error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `❌ ERROR\n\n${error.message}`
      }, { quoted: msg });
    }
  }
};
