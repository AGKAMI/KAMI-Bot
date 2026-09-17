/**
 * Promote Command - Make member admin
 */

const { findParticipant } = require('../../utils/jidHelper');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'promote',
  aliases: ['makeadmin'],
  category: 'admin',
  description: 'Promote member to admin',
  usage: '.promote @user',
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
        return extra.reply('❌ _moegoe, tag or reply to the person you wanna promote_\n\nexample: .promote @user');
      }
      
      // Fetch FRESH group metadata to avoid stale cache
      const freshMetadata = await sock.groupMetadata(extra.from);
      
      // Use findParticipant for LID-aware matching with fresh metadata
      const foundParticipant = findParticipant(freshMetadata.participants, target);
      
      if (!foundParticipant) {
        return extra.reply('❌ _moegoe, couldn\'t find this oke in the group_');
      }
      
      // Check if already admin using fresh data
      if (foundParticipant.admin === 'admin' || foundParticipant.admin === 'superadmin') {
        return extra.reply('❌ _sho, this oke is already an admin_');
      }
      
      await sock.groupParticipantsUpdate(extra.from, [target], 'promote');
      
      await sock.sendMessage(extra.from, {
        text: `✅ @${target.split('@')[0]} _is now an admin, lekke_!`,
        mentions: [target]
      }, { quoted: msg });
      
    } catch (error) {
      await extra.reply(`❌ _moegoe, ${error.message}_`);
    }
  }
};
