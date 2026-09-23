/**
 * Set Welcome - Customize welcome message
 */

const db = require('../../database');
const config = require('../../config');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'setwelcome',
  aliases: ['welcometext'],
  category: 'admin',
  description: 'Set custom welcome message',
  usage: 'setwelcome <message> (use @user for member mention)',
  groupOnly: true,
  ownerOnly: false, adminOnly: true,
  botAdminNeeded: true,
  execute: async (sock, msg, args) => {

  const prefix = config.prefix || '.';
    try {
      const groupId = msg.key.remoteJid;
      
      if (!args.length) {
        const groupSettings = db.getGroupSettings(groupId);
        return await sock.sendMessage(groupId, {
          text: `📝 *CURRENT WELCOME MESSAGE*\n\n${groupSettings.welcomeMessage}\n\n*Usage:* ${prefix}setwelcome <message>\n\n*Tip:* Use @user to mention the new member`
        }, { quoted: msg });
      }
      
      const welcomeMessage = args.join(' ');
      
      if (welcomeMessage.length > 500) {
        return await sock.sendMessage(groupId, {
          text: `❌ _${pick(SLANG.error)}, welcome message is too long, max 500 characters_`
        }, { quoted: msg });
      }
      
      db.updateGroupSettings(groupId, { welcomeMessage });
      
      const senderJid = msg.key.participant || msg.key.remoteJid || 'unknown';
      await sock.sendMessage(groupId, {
        text: `✅ _${pick(SLANG.vibe)}, welcome message updated!_\n\n*preview:*\n${welcomeMessage.replace('@user', '@' + senderJid.split('@')[0])}`,
        mentions: [senderJid]
      }, { quoted: msg });
      
    } catch (error) {
      console.error('Set Welcome Error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `❌ _${pick(SLANG.error)} — ${error.message}_`
      }, { quoted: msg });
    }
  }
};
