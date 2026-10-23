/**
 * Anti-Group Mention Command - Toggle antigroupmention protection with delete/kick options
 */

const database = require('../../database');
const config = require('../../config');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

module.exports = {
  name: 'antigroupmention',
  reactions: { received: '📣', done: '🤐' },
  aliases: ['agm'],
  category: 'admin',
  description: 'Configure antigroupmention protection (delete/kick/warn)',
  usage: '.antigroupmention <on/off/set delete|kick|warn/get>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,
  
  async execute(sock, msg, args, extra) {
    const prefix = config.prefix || '.';
    try {
      if (!args[0]) {
        const settings = database.getGroupSettings(extra.from);
        const statusText = buildStatus(settings);
        const isOn = settings.antigroupmention;
        return sendButtons(sock, extra.from, {
          text: statusText,
          footer: 'Antigroupmention Settings',
          buttons: [
            { id: 'admin:antigroupmention:on', text: '✅ Enable' },
            { id: 'admin:antigroupmention:off', text: '🚫 Disable' },
            { id: 'admin:antigroupmention:set:warn', text: '🛡️ Action: Warn' },
            { id: 'admin:antigroupmention:set:delete', text: '🗑️ Action: Delete' },
            { id: 'admin:antigroupmention:set:kick', text: '👢 Action: Kick' },
          ],
        }, { quoted: msg });
      }
      
      const opt = args[0].toLowerCase();
      
      if (opt === 'on') {
        if (database.getGroupSettings(extra.from).antigroupmention) {
          return extra.reply(`✅ SUCCESS\n\nAntigroupmention was already on`);
        }
        database.updateGroupSettings(extra.from, { antigroupmention: true });
        return extra.reply(`✅ SUCCESS\n\nAntigroupmention turned ON`);
      }
      
      if (opt === 'off') {
        database.updateGroupSettings(extra.from, { antigroupmention: false });
        return extra.reply('✅ SUCCESS\n\nAntigroupmention turned OFF');
      }
      
      if (opt === 'set') {
        if (args.length < 2) {
          extra.fail();
          return extra.reply(`❌ ERROR\n\nGive an action: ${prefix}antigroupmention set delete | kick | warn`);
        }
        
        const setAction = args[1].toLowerCase();
        if (!['delete', 'kick', 'warn'].includes(setAction)) {
          extra.fail();
          return extra.reply(`❌ ERROR\n\nNo good: action — choose delete, kick, or warn`);
        }
        
        database.updateGroupSettings(extra.from, { 
          antigroupmentionAction: setAction,
          antigroupmention: true // Auto-enable when setting action
        });
        return extra.reply(`✅ SUCCESS\n\nAntigroupmention action set to ${setAction}`);
      }
      
      if (opt === 'get') {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antigroupmention ? 'ON' : 'OFF';
        const action = settings.antigroupmentionAction || 'delete';
        return extra.reply(`🛡️ ANTIGROUPMENTION CONFIG\n\n*Status*: ${status}\n*Action*: ${action}`);
      }
      
      extra.fail();
      return extra.reply(`❌ ERROR\n\nUse ${prefix}antigroupmention to see how it works`);
      
    } catch (error) {
      extra.fail();
      await extra.reply(`❌ ERROR\n\n${error.message}`);
    }
  }
};

function buildStatus(settings) {
  const status = settings.antigroupmention ? 'ON' : 'OFF';
  const action = settings.antigroupmentionAction || 'delete';

  return (
    `🛡️ *ANTIGROUPMENTION STATUS*\n\n` +
    `⚡ *Status:* ${status}\n` +
    `🔨 *Action:* ${action} (warn/delete/kick)\n\n` +
    `💡 _Warn = warn 3 times then auto-kick_`
  );
}

// Button handlers
onButton('admin:antigroupmention:on', async (sock, msg, from) => {
  if (!from.endsWith('@g.us')) return;
  const database = require('../../database');
  database.updateGroupSettings(from, { antigroupmention: true });
  await sock.sendMessage(from, {
    text: `✅ *ANTIGROUPMENTION ON*\n\n_Anti-group mention protection activated_`,
  }, { quoted: msg });
});

onButton('admin:antigroupmention:off', async (sock, msg, from) => {
  if (!from.endsWith('@g.us')) return;
  const database = require('../../database');
  database.updateGroupSettings(from, { antigroupmention: false });
  await sock.sendMessage(from, {
    text: `✅ *ANTIGROUPMENTION OFF*\n\n_Anti-group mention protection disabled_`,
  }, { quoted: msg });
});

onButton('admin:antigroupmention:set:warn', async (sock, msg, from) => {
  if (!from.endsWith('@g.us')) return;
  const database = require('../../database');
  database.updateGroupSettings(from, { antigroupmentionAction: 'warn', antigroupmention: true });
  await sock.sendMessage(from, {
    text: `✅ *ANTIGROUPMENTION ACTION*\n\n_Action set to warn_`,
  }, { quoted: msg });
});

onButton('admin:antigroupmention:set:delete', async (sock, msg, from) => {
  if (!from.endsWith('@g.us')) return;
  const database = require('../../database');
  database.updateGroupSettings(from, { antigroupmentionAction: 'delete', antigroupmention: true });
  await sock.sendMessage(from, {
    text: `✅ *ANTIGROUPMENTION ACTION*\n\n_Action set to delete_`,
  }, { quoted: msg });
});

onButton('admin:antigroupmention:set:kick', async (sock, msg, from) => {
  if (!from.endsWith('@g.us')) return;
  const database = require('../../database');
  database.updateGroupSettings(from, { antigroupmentionAction: 'kick', antigroupmention: true });
  await sock.sendMessage(from, {
    text: `✅ *ANTIGROUPMENTION ACTION*\n\n_Action set to kick_`,
  }, { quoted: msg });
});