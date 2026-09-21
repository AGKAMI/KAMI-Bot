/**
 * Welcome - Enable/disable welcome messages
 */

const db = require('../../database');
const { bold, italic, pick, SLANG } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

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
        const isOn = groupSettings.welcome;
        const status = isOn ? '✅ Enabled' : '❌ Disabled';
        const statusText = `👋 WELCOME MESSAGES\n\n*Status*: ${status}\n*Message*: ${groupSettings.welcomeMessage}\n\n📱 *Usage*: .welcome on/off\n💡 *Customize*: .setwelcome <message>`;
        return sendButtons(sock, groupId, {
          text: statusText,
          footer: 'Welcome Settings',
          buttons: isOn
            ? [{ id: 'admin:welcome:off', text: '🚫 Disable Welcome' }]
            : [{ id: 'admin:welcome:on', text: '👋 Enable Welcome' }],
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

// Button handlers
onButton('admin:welcome:on', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { welcome: true });
  await sock.sendMessage(from, {
    text: `✅ WELCOME ON\n\n_Welcome messages enabled_`,
  });
});

onButton('admin:welcome:off', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { welcome: false });
  await sock.sendMessage(from, {
    text: `✅ WELCOME OFF\n\n_Welcome messages disabled_`,
  });
});
