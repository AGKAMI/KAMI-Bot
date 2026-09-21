/**
 * Antilink Command - Toggle antilink protection with delete/kick options
 */

const database = require('../../database');
const { bold, italic, pick, SLANG } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

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
        const statusText = buildStatus(settings);
        const isOn = settings.antilink;
        return sendButtons(sock, extra.from, {
          text: statusText,
          footer: 'Antilink Settings',
          buttons: isOn
            ? [{ id: 'admin:antilink:off', text: '🚫 Disable Antilink' }]
            : [{ id: 'admin:antilink:set:warn', text: '🛡️ Enable + Warn' }, { id: 'admin:antilink:set:delete', text: '🗑️ Enable + Delete' }, { id: 'admin:antilink:set:kick', text: '👢 Enable + Kick' }],
        }, { quoted: msg });
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

function buildStatus(settings) {
  const status = settings.antilink ? 'ON' : 'OFF';
  const action = settings.antilinkAction || 'delete';

  return (
    `🔗 *ANTILINK STATUS*\n\n` +
    `⚡ *Status:* ${status}\n` +
    `🔨 *Action:* ${action} (warn/delete/kick)\n\n` +
    `💡 _Warn = warn 3 times then auto-kick_`
  );
}

// Button handlers
onButton('admin:antilink:on', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { antilink: true });
  await sock.sendMessage(from, {
    text: `✅ *ANTILINK ON*\n\n_Antilink protection activated_`,
  });
});

onButton('admin:antilink:off', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { antilink: false });
  await sock.sendMessage(from, {
    text: `✅ *ANTILINK OFF*\n\n_Antilink protection disabled_`,
  });
});

onButton('admin:antilink:set:warn', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { antilinkAction: 'warn', antilink: true });
  await sock.sendMessage(from, {
    text: `✅ *ANTILINK ACTION*\n\n_Action set to warn_`,
  });
});

onButton('admin:antilink:set:delete', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { antilinkAction: 'delete', antilink: true });
  await sock.sendMessage(from, {
    text: `✅ *ANTILINK ACTION*\n\n_Action set to delete_`,
  });
});

onButton('admin:antilink:set:kick', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { antilinkAction: 'kick', antilink: true });
  await sock.sendMessage(from, {
    text: `✅ *ANTILINK ACTION*\n\n_Action set to kick_`,
  });
});
