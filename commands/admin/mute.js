/**
 * Mute Command - Close group (only admins can send)
 */

const { bold, pick, SLANG, mention } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');
const database = require('../../database');

module.exports = {
    name: 'mute',
    aliases: ['close', 'closegroup'],
    category: 'admin',
    description: 'Close group (only admins can send messages)',
    usage: '.mute',
    groupOnly: true,
    adminOnly: true,
    botAdminNeeded: true,
    
    async execute(sock, msg, args, extra) {
      try {
        await sock.groupSettingUpdate(extra.from, 'announcement');

        // Track owner mute — blocks unmute by others
        let muteNote = '';
        if (extra.isOwner) {
          database.setOwnerMuted(extra.from, extra.sender);
          muteNote = '\n\n🔒 Only *you* can unmute this group';
        }

        await sendButtons(sock, extra.from, {
          text: `🔒 MUTED\n\nGroup closed ${pick(SLANG.vibe)}\nOnly admins can talk now${muteNote}`,
          footer: 'Mute Management',
          buttons: [
            { id: 'admin:unmute', text: '🔓 Unmute' },
          ],
        }, { quoted: msg });
        
      } catch (error) {
        await extra.reply(`❌ ERROR\n\n${error.message}`);
      }
    }
  };

// Button handlers
onButton('admin:unmute', async (sock, msg, from, sender, btnId) => {
  try {
    await sock.groupSettingUpdate(from, 'not_announcement');
    await sock.sendMessage(from, {
      text: `🔓 UNMUTED\n\nGroup opened — everyone can talk now`,
    });
  } catch (e) {
    console.error('[UNMUTE BTN] Error:', e.message);
    await sock.sendMessage(from, { text: `❌ *UNMUTE FAILED*\n\n${e.message || "Couldn't open the group"}` });
  }
});