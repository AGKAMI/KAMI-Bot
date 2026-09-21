/**
 * AntiTag Command
 * Enable/disable anti-tag and set action (delete/kick)
 */

const database = require('../../database');
const config = require('../../config');
const { bold, italic, pick, SLANG } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

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
    const prefix = config.prefix || '.';
    try {
      if (!args[0]) {
        const settings = database.getGroupSettings(extra.from);
        const statusText = buildStatus(settings);
        const isOn = settings.antitag;
        return sendButtons(sock, extra.from, {
          text: statusText,
          footer: 'Antitag Settings',
          buttons: isOn
            ? [{ id: 'admin:antitag:off', text: '🚫 Disable Antitag' }]
            : [{ id: 'admin:antitag:set:delete', text: '🗑️ Enable + Delete' }, { id: 'admin:antitag:set:kick', text: '👢 Enable + Kick' }],
        }, { quoted: msg });
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
          return extra.reply(`❌ ERROR\n\nSpecify an action: ${prefix}antitag set delete | kick`);
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
      
      return extra.reply(`❌ ERROR\n\nUse ${prefix}antitag for usage`);
      
    } catch (error) {
      await extra.reply(`❌ ERROR\n\n${error.message}`);
    }
  }
};

function buildStatus(settings) {
  const status = settings.antitag ? 'ON' : 'OFF';
  const action = settings.antitagAction || 'delete';

  return (
    `📛 *ANTITAG STATUS*\n\n` +
    `⚡ *Status:* ${status}\n` +
    `🔨 *Action:* ${action} (delete/kick)\n`
  );
}

// Button handlers
onButton('admin:antitag:on', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { antitag: true });
  await sock.sendMessage(from, {
    text: `✅ *ANTITAG ON*\n\n_Anti-tag protection activated_`,
  });
});

onButton('admin:antitag:off', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { antitag: false });
  await sock.sendMessage(from, {
    text: `✅ *ANTITAG OFF*\n\n_Anti-tag protection disabled_`,
  });
});

onButton('admin:antitag:set:delete', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { antitagAction: 'delete', antitag: true });
  await sock.sendMessage(from, {
    text: `✅ *ANTITAG ACTION*\n\n_Action set to delete_`,
  });
});

onButton('admin:antitag:set:kick', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { antitagAction: 'kick', antitag: true });
  await sock.sendMessage(from, {
    text: `✅ *ANTITAG ACTION*\n\n_Action set to kick_`,
  });
});
