/**
 * Demote Command - Remove admin privileges
 */

const { findParticipant } = require('../../utils/jidHelper');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'demote',
  aliases: ['removeadmin'],
  category: 'admin',
  description: 'Remove admin privileges from member',
  usage: '.demote @user',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,
  
  async execute(sock, msg, args, extra) {
    try {
      let target;
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      
      if (mentioned && mentioned.length > 0) {
        target = mentioned[0];
      } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
        target = ctx.participant;
      } else {
        return extra.reply('❌ _moegoe, tag or reply to the person you wanna demote_\n\nexample: .demote @user');
      }
      
      // Fetch FRESH group metadata to avoid stale cache
      const freshMetadata = await sock.groupMetadata(extra.from);
      
      // Use findParticipant for LID-aware matching with fresh metadata
      const foundParticipant = findParticipant(freshMetadata.participants, target);
      
      if (!foundParticipant) {
        return extra.reply('❌ _moegoe, couldn\'t find this oke in the group_');
      }
      
      // Check if user is admin using fresh data
      if (foundParticipant.admin !== 'admin' && foundParticipant.admin !== 'superadmin') {
        return extra.reply("❌ _moegoe, this oke isn't an admin_");
      }
      
      await sock.groupParticipantsUpdate(extra.from, [target], 'demote');
      
      await sock.sendMessage(extra.from, {
        text: `✅ @${target.split('@')[0]} _is no longer an admin, lekke_!`,
        mentions: [target]
      }, { quoted: msg });
      
    } catch (error) {
      await extra.reply(`❌ _moegoe, ${error.message}_`);
    }
  }
};
