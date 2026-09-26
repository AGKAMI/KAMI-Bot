/**
 * AutoSticker Command - Enable or disable auto-sticker conversion
 */

const database = require('../../database');
const config = require('../../config');
const { bold, italic, pick, SLANG } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

module.exports = {
  name: 'autosticker',
  reactions: { received: '⚡', done: '✅' },
  aliases: ['autos', 'asticker'],
  category: 'admin',
  description: 'Enable or disable auto-sticker conversion (images/videos automatically become stickers)',
  usage: '.autosticker <on/off>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: false,
  
  async execute(sock, msg, args, extra) {
    const prefix = config.prefix || '.';
    try {
      if (!args[0]) {
        const settings = database.getGroupSettings(extra.from);
        const isOn = settings.autosticker;
        const status = isOn ? 'ON' : 'OFF';
        const statusText = `📌 AUTOSTICKER STATUS\n\n` +
          `*Status*: ${status}\n\n` +
          `When enabled, all images and videos go straight to sticker ${pick(SLANG.vibe)}\n\n` +
          `📱 *Usage*:\n` +
          `• ${prefix}autosticker on\n` +
          `• ${prefix}autosticker off`;
        return sendButtons(sock, extra.from, {
          text: statusText,
          footer: 'Autosticker Settings',
          buttons: isOn
            ? [{ id: 'admin:autosticker:off', text: '🚫 Disable Autosticker' }]
            : [{ id: 'admin:autosticker:on', text: '📌 Enable Autosticker' }],
        }, { quoted: msg });
      }
      
      const opt = args[0].toLowerCase();
      
      if (opt === 'on') {
        if (database.getGroupSettings(extra.from).autosticker) {
          return extra.reply(`✅ SUCCESS\n\nAutosticker is already on ${pick(SLANG.vibe)}`);
        }
        database.updateGroupSettings(extra.from, { autosticker: true });
        return extra.reply(`✅ SUCCESS\n\nAutosticker turned ON ${pick(SLANG.good)}\n\nEvery image and video goes straight to sticker now`);
      }
      
      if (opt === 'off') {
        if (!database.getGroupSettings(extra.from).autosticker) {
          return extra.reply(`⚠️ WARNING\n\nAutosticker is off already ${pick(SLANG.vibe)}`);
        }
        database.updateGroupSettings(extra.from, { autosticker: false });
        return extra.reply(`✅ SUCCESS\n\nAutosticker turned OFF`);
      }
      
      return extra.reply(`❌ ERROR\n\nInvalid option\nUsage: ${prefix}autosticker <on/off>`);
    } catch (error) {
      console.error('[AutoSticker Command Error]:', error);
      return extra.reply(`❌ ERROR\n\nCouldn't update autosticker setting`);
    }
  }
};

// Button handlers
onButton('admin:autosticker:on', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { autosticker: true });
  await sock.sendMessage(from, {
    text: `✅ AUTOSTICKER ON\n\n_Autosticker turned ON — every image and video goes straight to sticker_`,
  });
});

onButton('admin:autosticker:off', async (sock, msg, from) => {
  const database = require('../../database');
  database.updateGroupSettings(from, { autosticker: false });
  await sock.sendMessage(from, {
    text: `✅ AUTOSTICKER OFF\n\n_Autosticker turned OFF_`,
  });
});

