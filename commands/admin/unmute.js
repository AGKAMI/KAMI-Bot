/**
 * Unmute Command - Open group (all members can send)
 */

const { bold, pick, SLANG, mention } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');
const database = require('../../database');
const config = require('../../config');

function isOwner(sender) {
  const num = sender.split(':')[0].split('@')[0].replace(/\D/g, '');
  return (config.ownerNumber || []).some(n => n.replace(/\D/g, '') === num);
}

module.exports = {
    name: 'unmute',
    reactions: { received: '🔊', done: '🔇' },
    aliases: ['open', 'opengroup'],
    category: 'admin',
    description: 'Open group (all members can send messages)',
    usage: '.unmute',
    groupOnly: true,
    adminOnly: true,
    botAdminNeeded: true,
    
    async execute(sock, msg, args, extra) {
      try {
        // Owner-muted check — only owner can unmute
        if (database.isOwnerMuted(extra.from) && !extra.isOwner) {
          return extra.reply(
            `🚫 *UNMUTE BLOCKED*\n\n` +
            `The owner muted this group\n\n` +
            `Only the owner can unmute it`
          );
        }

        await sock.groupSettingUpdate(extra.from, 'not_announcement');
        database.clearOwnerMuted(extra.from);
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
    console.error('[MUTE BTN] Error:', e.message);
    await sock.sendMessage(from, { text: `❌ *MUTE FAILED*\n\n${e.message || "Couldn't close the group"}` });
  }
});

onButton('admin:unmute', async (sock, msg, from, sender, btnId) => {
  try {
    if (database.isOwnerMuted(from) && !isOwner(sender)) {
      return await sock.sendMessage(from, {
        text: `🚫 *UNMUTE BLOCKED*\n\nThe owner muted this group — only they can unmute`,
      });
    }
    await sock.groupSettingUpdate(from, 'not_announcement');
    database.clearOwnerMuted(from);
    await sock.sendMessage(from, {
      text: `🔓 UNMUTED\n\nGroup opened — everyone can talk now`,
    });
  } catch (e) {
    console.error('[UNMUTE BTN] Error:', e.message);
    await sock.sendMessage(from, { text: `❌ *UNMUTE FAILED*\n\n${e.message || "Couldn't open the group"}` });
  }
});