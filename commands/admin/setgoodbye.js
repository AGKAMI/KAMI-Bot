/**
 * Set Goodbye - Customize goodbye message
 */

const db = require('../../database');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'setgoodbye',
  aliases: ['goodbyetext'],
  category: 'admin',
  description: 'Set custom goodbye message',
  usage: 'setgoodbye <message> (use @user for member mention)',
  groupOnly: true,
  ownerOnly: true, adminOnly: false,
  botAdminNeeded: true,
  execute: async (sock, msg, args) => {
    try {
      const groupId = msg.key.remoteJid;
      
      if (!args.length) {
        const groupSettings = db.getGroupSettings(groupId);
        return await sock.sendMessage(groupId, {
          text: `📝 ${bold('CURRENT GOODBYE MESSAGE')}\n\n${groupSettings.goodbyeMessage}\n\n*Usage:* .setgoodbye <message>\n\n*Tip:* Use @user to mention the member who left`
        }, { quoted: msg });
      }
      
      const goodbyeMessage = args.join(' ');
      
      if (goodbyeMessage.length > 500) {
        return await sock.sendMessage(groupId, {
          text: `❌ _${pick(SLANG.error)}, goodbye message is too long, max 500 characters_`
        }, { quoted: msg });
      }
      
      db.updateGroupSettings(groupId, { goodbyeMessage });
      
      await sock.sendMessage(groupId, {
        text: `✅ _${pick(SLANG.vibe)}, goodbye message updated!_\n\n*preview:*\n${goodbyeMessage.replace('@user', '@' + msg.key.participant.split('@')[0])}`,
        mentions: [msg.key.participant]
      }, { quoted: msg });
      
    } catch (error) {
      console.error('Set Goodbye Error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `❌ _${pick(SLANG.error)} — ${error.message}_`
      }, { quoted: msg });
    }
  }
};
