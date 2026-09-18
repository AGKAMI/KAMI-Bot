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
        return extra.reply(`❌ ERROR\n\nTag or reply to the person you wanna promote\n\nExample: .promote @user`);
      }
      
      // Fetch FRESH group metadata to avoid stale cache
      const freshMetadata = await sock.groupMetadata(extra.from);
      
      // Use findParticipant for LID-aware matching with fresh metadata
      const foundParticipant = findParticipant(freshMetadata.participants, target);
      
      if (!foundParticipant) {
        return extra.reply(`❌ ERROR\n\nCouldn't find this oke in the group`);
      }
      
      // Check if already admin using fresh data
      if (foundParticipant.admin === 'admin' || foundParticipant.admin === 'superadmin') {
        return extra.reply(`✅ SUCCESS\n\nThis oke is already an admin ${pick(SLANG.vibe)}`);
      }
      
      await sock.groupParticipantsUpdate(extra.from, [target], 'promote');
      
      await sock.sendMessage(extra.from, {
        text: `👑 PROMOTED\n\n@${target.split('@')[0]} is now an admin ${pick(SLANG.good)}`,
        mentions: [target]
      }, { quoted: msg });
      
    } catch (error) {
      await extra.reply(`❌ ERROR\n\n${error.message}`);
    }
  }
};
