/**
 * Unmute Command - Open group (all members can send)
 */

const { bold, pick, SLANG, mention } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

module.exports = {
    name: 'unmute',
    aliases: ['open', 'opengroup'],
    category: 'admin',
    description: 'Open group (all members can send messages)',
    usage: '.unmute',
    groupOnly: true,
    adminOnly: true,
    botAdminNeeded: true,
    
    async execute(sock, msg, args, extra) {
      try {
        await sock.groupSettingUpdate(extra.from, 'not_announcement');
        await sendButtons(sock, extra.from, {
          text: `🔓 UNMUTED\n\nGroup opened ${pick(SLANG.vibe)}\nEveryone can talk now`,
          footer: 'Unmute Management',
          buttons: [
            { id: 'admin:mute', text: '🔒 Mute' },
          ],
        }, { quoted: msg });
        
      } catch (error) {
        await extra.reply(`❌ ERROR\n\n${error.message}`);
      }
    }
  };

// Button handlers
onButton('admin:mute', async (sock, msg, from, sender, btnId) => {
  try {
    await sock.groupSettingUpdate(from, 'announcement');
    await sock.sendMessage(from, {
      text: `🔒 MUTED\n\nGroup closed — only admins can talk now`,
    });
  } catch (e) {
    await sock.sendMessage(from, { text: `❌ *MUTE FAILED*\n\n_Couldn't close the group_` });
  }
});