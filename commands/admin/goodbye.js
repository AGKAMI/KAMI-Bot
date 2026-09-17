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
  ownerOnly: true, adminOnly: false,
  botAdminNeeded: true,
  execute: async (sock, msg, args) => {
    try {
      const groupId = msg.key.remoteJid;
      const action = args[0]?.toLowerCase();
      
      if (!action || !['on', 'off'].includes(action)) {
        const groupSettings = db.getGroupSettings(groupId);
        const status = groupSettings.goodbye ? '✅ _Enabled_' : '❌ _Disabled_';
        return await sock.sendMessage(groupId, {
          text: `👋 ${bold('GOODBYE MESSAGES')}\n\n${bold('Status')}: ${status}\n${bold('Message')}: ${groupSettings.goodbyeMessage}\n\nUsage: .goodbye on/off\n\nTo customize: .setgoodbye <message>`
        }, { quoted: msg });
      }
      
      const enable = action === 'on';
      db.updateGroupSettings(groupId, { goodbye: enable });
      
      await sock.sendMessage(groupId, {
        text: `✅ _${pick(SLANG.vibe)}, goodbye messages ${enable ? 'enabled' : 'disabled'}${enable ? '\\n\\nleaving members will get a goodbye now' : ''}_`
      }, { quoted: msg });
      
    } catch (error) {
      console.error('Goodbye Error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `❌ _${pick(SLANG.error)} — ${error.message}_`
      }, { quoted: msg });
    }
  }
};
