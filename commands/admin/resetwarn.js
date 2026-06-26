/**
 * ResetWarn Command - Reset warnings for a user
 */

const database = require('../../database');

module.exports = {
  name: 'resetwarn',
  aliases: ['resetwarning', 'clearwarn', 'unwarn', 'delwarn'],
  category: 'admin',
  description: 'Reset all warnings for a user',
  usage: '.resetwarn @user',
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
        return extra.reply('❌ tag or reply to the person you wanna reset warnings\n\nexample: .resetwarn @user');
      }
      
      // Get current warnings before clearing
      const currentWarnings = database.getWarnings(extra.from, target);
      
      if (currentWarnings.count === 0) {
        return extra.reply(`✅ @${target.split('@')[0]} has no warnings to reset.`, { mentions: [target] });
      }
      
      // Clear all warnings
      database.clearWarnings(extra.from, target);
      
      await sock.sendMessage(extra.from, {
        text: `✅ *warnings reset*\\n\\n👤 @${target.split('@')[0]}\\n⚠️ previous warnings: ${currentWarnings.count}\\n\\nall warnings cleared, you're good`,
        mentions: [target]
      }, { quoted: msg });
      
    } catch (error) {
      console.error('ResetWarn command error:', error);
      await extra.reply(`❌ error: ${error.message}`);
    }
  }
};

