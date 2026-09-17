/**
 * Warn Command - Warn a user
 */

const database = require('../../database');
const config = require('../../config');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'warn',
  aliases: ['warning'],
  category: 'admin',
  description: 'Warn a user',
  usage: '.warn @user <reason>',
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
        return extra.reply(`❌ _${pick(SLANG.error)}, tag or reply to the person you wanna warn_\n\nexample: .warn @user breaking rules`);
      }
      
      const reason = args.slice(mentioned.length > 0 ? 1 : 0).join(' ') || 'No reason specified';
      
      // Cannot warn admins
      const foundParticipant = extra.groupMetadata.participants.find(
        p => (p.id === target || p.lid === target) && (p.admin === 'admin' || p.admin === 'superadmin')
      );
      
      if (foundParticipant) {
        return extra.reply(`❌ _${pick(SLANG.error)}, eish no, can't warn an admin hey_`);
      }
      
      const warnings = database.addWarning(extra.from, target, reason);
      
      let text = `⚠️ ${bold('WARNING')}\n\n`;
      text += `👤 @${target.split('@')[0]}\n`;
      text += `📝 ${bold('Reason')}: ${reason}\n`;
      text += `⚠️ ${bold('Warnings')}: ${warnings.count}/${config.maxWarnings}\n\n`;
      
      if (warnings.count >= config.maxWarnings) {
        text += `❌ _${pick(SLANG.error)}, aikona, max warnings hit — this oke is out_`;
        
        await sock.sendMessage(extra.from, {
          text,
          mentions: [target]
        }, { quoted: msg });
        
        if (extra.isBotAdmin) {
          await sock.groupParticipantsUpdate(extra.from, [target], 'remove');
          database.clearWarnings(extra.from, target);
        }
      } else {
        text += `⚠️ _one more and you're gone ${pick(SLANG.friend)}_`;
        
        await sock.sendMessage(extra.from, {
          text,
          mentions: [target]
        }, { quoted: msg });
      }
      
    } catch (error) {
      await extra.reply(`❌ _${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};
