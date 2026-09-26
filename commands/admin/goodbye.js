/**
 * Goodbye - Enable/disable goodbye messages
 */

const db = require('../../database');
const { bold, italic, pick, SLANG } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

module.exports = {
  name: 'goodbye',
  reactions: { received: '👋', done: '✅' },
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
        const isOn = groupSettings.goodbye;
        const status = isOn ? '✅ Enabled' : '❌ Disabled';
        const statusText = `👋 GOODBYE MESSAGES\n\n*Status*: ${status}\n*Message*: ${groupSettings.goodbyeMessage}\n\n📱 *Usage*: .goodbye on/off\n💡 *Customize*: .setgoodbye <message>`;
        return sendButtons(sock, groupId, {
          text: statusText,
          footer: 'Goodbye Settings',
          buttons: isOn
            ? [{ id: 'admin:goodbye:off', text: '🚫 Disable Goodbye' }]
            : [{ id: 'admin:goodbye:on', text: '👋 Enable Goodbye' }],
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

// Button handlers
onButton('admin:goodbye:on', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { goodbye: true });
  await sock.sendMessage(from, {
    text: `✅ GOODBYE ON\n\n_Goodbye messages enabled_`,
  });
});

onButton('admin:goodbye:off', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { goodbye: false });
  await sock.sendMessage(from, {
    text: `✅ GOODBYE OFF\n\n_Goodbye messages disabled_`,
  });
});
