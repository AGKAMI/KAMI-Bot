/**
 * Crew Remove Command — Remove member from Slammed Society roster
 * Supports: @mention OR phone number
 * Also kicks the member from the WhatsApp group.
 */

const database = require('../../database');
const handler = require('../../handler');
const config = require('../../config');
const { bold, pick, SLANG, mention } = require('../../utils/format');
const { resolveUser } = require('./crewHelpers');

module.exports = {
  subName: 'remove',
  name: null,
  aliases: ['leave', 'fire'],
  category: 'crew',
  description: 'Remove member from crew roster',
  usage: '.crew remove @user|number',
  groupOnly: true,
  ownerOnly: false,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      const resolved = resolveUser(args, mentioned, ctx);

      if (!resolved.jid) {
        return extra.reply(
          `❌ ERROR\n\n` +
          `Tag or add a number\n\n` +
          `Usage:\n` +
          `• ${prefix}crew remove @user\n` +
          `• ${prefix}crew remove 0833882383`
        );
      }

      const target = resolved.jid;

      const member = database.getCrewMember(extra.from, target);
      if (!member) {
        return extra.reply(
          `❌ ERROR\n\n` +
          `${mention(target)} is not in this crew`
        );
      }

      // Remove from crew DB
      database.removeCrewMember(extra.from, target);

      // Also kick from WhatsApp group
      let kickedFromGroup = false;
      try {
        // Mark as bot-initiated so handler.js skips member protection
        handler._botKicked.add(target);
        setTimeout(() => handler._botKicked.delete(target), 5000);

        await sock.groupParticipantsUpdate(extra.from, [target], 'remove');
        kickedFromGroup = true;
      } catch (kickErr) {
        console.error('[CREW REMOVE] WhatsApp kick failed:', kickErr.message);
      }

      const ownerVIP = extra.isOwnerMentioned;

      await sock.sendMessage(extra.from, {
        text:
          `✅ SUCCESS\n\n` +
          (ownerVIP
            ? `👑 THE BOSS HAS SPOKEN 👑\n\n`
            : `👤 MEMBER REMOVED\n\n`) +
          `${mention(target)} has been removed\n\n` +
          `🏷️ Was: ${member.role}\n` +
          (kickedFromGroup
            ? `✅ Removed from the WhatsApp group`
            : `⚠️ Removed from crew DB but couldn't kick from group`) +
          (ownerVIP ? `\n\n_The owner himself has removed this member. It's done._ 👑` : ''),
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew remove error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't remove member`);
    }
  },
};
