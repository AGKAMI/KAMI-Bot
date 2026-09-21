/**
 * Set Team Image — owner replies to an image to set it as a team's card image.
 * Usage: !setteamimage <team>  (then reply to an image)
 */

const path = require('path');
const fs = require('fs');
const config = require('../../config');
const { pick, SLANG } = require('../../utils/format');

const TEAM_IMAGES_DIR = path.join(__dirname, '../../utils/team_images');

// In-memory pending state: { ownerJid: { teamKey, chatJid, msgId } }
const pending = new Map();
const PENDING_TTL = 2 * 60 * 1000; // 2 minutes

function getPending(ownerJid) {
  const p = pending.get(ownerJid);
  if (!p) return null;
  if (Date.now() - p.timestamp > PENDING_TTL) {
    pending.delete(ownerJid);
    return null;
  }
  return p;
}

module.exports = {
  name: 'setteamimage',
  aliases: ['setteamimg'],
  category: 'owner',
  description: 'Set a team card image (reply to an image)',
  usage: '.setteamimage <team>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const teamKey = (args[0] || '').toUpperCase();
      if (!teamKey || !config.crewTeams[teamKey]) {
        return extra.reply(
          `❌ ERROR\n\nProvide a valid team\n\n` +
          `Teams: ${Object.keys(config.crewTeams).filter(k => k !== 'SSGENERAL').join(', ')}`
        );
      }

      // Store pending state
      pending.set(extra.sender, {
        teamKey,
        chatJid: extra.from,
        timestamp: Date.now(),
      });

      await extra.reply(
        `📸 Send an image for *${config.crewTeams[teamKey].name}*\n\n` +
        `_Reply to an image within 2 minutes_`
      );

    } catch (error) {
      console.error('[SETTEAMIMAGE] Error:', error);
      await extra.reply(`❌ _${pick(SLANG.error)} — ${error.message}_`);
    }
  },

  // Called from handler when an image message is received from the owner
  async handleImage(sock, msg, from, sender) {
    const p = getPending(sender);
    if (!p) return false;

    pending.delete(sender);

    try {
      // Ensure directory exists
      if (!fs.existsSync(TEAM_IMAGES_DIR)) {
        fs.mkdirSync(TEAM_IMAGES_DIR, { recursive: true });
      }

      // Download the image
      const { downloadMediaMessage } = require('@whiskeysockets/baileys');
      const buffer = await downloadMediaMessage(msg, 'buffer', {});

      if (!buffer || buffer.length === 0) {
        await sock.sendMessage(from, { text: `❌ Failed to download image` });
        return true;
      }

      // Save to disk
      const fileName = `${p.teamKey.toLowerCase()}.jpg`;
      const filePath = path.join(TEAM_IMAGES_DIR, fileName);
      fs.writeFileSync(filePath, buffer);

      // Update config reference
      config.crewTeams[p.teamKey].image = filePath;

      await sock.sendMessage(from, {
        text:
          `✅ *IMAGE SET*\n\n` +
          `🏢 Team: *${p.teamKey}* — ${config.crewTeams[p.teamKey].name}\n` +
          `📁 Saved: ${fileName}`,
      });

      return true;
    } catch (err) {
      console.error('[SETTEAMIMAGE] Save failed:', err.message);
      await sock.sendMessage(from, { text: `❌ Failed to save image: ${err.message}` });
      return true;
    }
  },
};
