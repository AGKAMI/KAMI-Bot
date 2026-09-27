/**
 * Set Welcome - Customize welcome message
 */

const db = require('../../database');
const config = require('../../config');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');

module.exports = {
  name: 'setwelcome',
  reactions: { received: '🎉', done: '✏️' },
  aliases: ['welcometext'],
  category: 'admin',
  description: 'Set custom welcome message',
  usage: 'setwelcome <message> (use @user for member mention)',
  groupOnly: true,
  ownerOnly: false, adminOnly: true,
  botAdminNeeded: true,
  execute: async (sock, msg, args, extra) => {

  const prefix = config.prefix || '.';
    try {
      const groupId = msg.key.remoteJid;
      
      if (!args.length) {
        const groupSettings = db.getGroupSettings(groupId);
        return await sock.sendMessage(groupId, {
          text: `📝 *CURRENT WELCOME MESSAGE*\n\n${groupSettings.welcomeMessage}\n\n*Usage:* ${prefix}setwelcome <message>\n\n*Tip:* Use @user to tag the new member`
        }, { quoted: msg });
      }
      
      const welcomeMessage = args.join(' ');
      
      if (welcomeMessage.length > 500) {
        extra.fail();
        return await sock.sendMessage(groupId, {
          text: `❌ _${voice.openErr()}, welcome message is too long — 500 max_`
        }, { quoted: msg });
      }
      
      db.updateGroupSettings(groupId, { welcomeMessage });
      
      const senderJid = msg.key.participant || msg.key.remoteJid || 'unknown';
      await sock.sendMessage(groupId, {
        text: `✅ _${voice.lead('affirm')}, welcome message updated!_\n\n*preview:*\n${welcomeMessage.replace('@user', '@' + senderJid.split('@')[0])}`,
        mentions: [senderJid]
      }, { quoted: msg });
      
    } catch (error) {
      console.error('Set Welcome Error:', error);
      extra.fail();
      await sock.sendMessage(msg.key.remoteJid, {
        text: `❌ _${voice.openErr()} — ${error.message}_`
      }, { quoted: msg });
    }
  }
};
