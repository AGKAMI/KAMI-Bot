/**
 * Crew Remove Command — Remove member from Slammed Society roster
 * Supports: @mention OR phone number
 * Also kicks the member from the WhatsApp group.
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG, mention, voice } = require('../../utils/format');
const { resolveUser } = require('./crewHelpers');

// Lazy require to avoid circular dependency
function getHandler() {
  return require('../../handler');
}

module.exports = {
  subName: 'remove',
  name: null,
  aliases: ['leave', 'fire'],
  category: 'crew',
  description: 'Remove a member from the crew roster',
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
          `Tag someone or drop a number\n\n` +
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
          `${mention(target)} isn't in this crew, hey`
        );
      }

      // ── Protection — only the owner can remove owner-added members ──
      if (!extra.isOwner) {
        const { buildComparableIds } = require('../../utils/jidHelper');
        const isProtected = [target, ...buildComparableIds(target)]
          .some(v => database.isOwnerProtected(extra.from, v));
        if (isProtected) {
          return extra.reply(
            `🚫 *NAH BRU* 💀\n\n` +
            `${mention(target)} was added by KAMI personally\n\n` +
            `Only KAMI can remove them, boet — that's not a suggestion ${voice.tag('tease')}`
          );
        }
      }

      // Remove from crew DB
      database.removeCrewMember(extra.from, target);

      // Clear protection entries — the owner deliberately removed them,
      // so the bot must not re-add them later
      database.removeOwnerAddedMember(extra.from, target);
      database.removeOwnerPromotedAdmin(extra.from, target);

      // Also kick from WhatsApp group — honest status codes (a 403
      // "not admin / privacy" return used to count as kicked)
      const { groupAction } = require('../../utils/groupActions');
      const { buildComparableIds } = require('../../utils/jidHelper');
      let kickedFromGroup = false;
      let kickError = null;
      try {
        // Mark as bot-initiated so handler.js skips member protection
        const handler = getHandler();
        handler._botKicked.add(target);
        setTimeout(() => handler._botKicked.delete(target), 5000);

        const r = await groupAction(sock, extra.from, [target, ...buildComparableIds(target)], 'remove');
        kickedFromGroup = r.ok;
        if (!r.ok) kickError = r.error;
      } catch (kickErr) {
        console.error('[CREW REMOVE] WhatsApp kick failed:', kickErr.message);
        kickError = kickErr.message;
      }

      const ownerVIP = extra.isOwnerMentioned;

      await sock.sendMessage(extra.from, {
        text:
          `${kickedFromGroup ? '✅ SUCCESS' : '⚠️ PARTIAL'}\n\n` +
          (ownerVIP
            ? `👑 THE BOSS HAS SPOKEN 👑\n\n`
            : `👤 MEMBER REMOVED\n\n`) +
          `${mention(target)} has been removed\n\n` +
          `🏷️ Was: ${member.role}\n` +
          (kickedFromGroup
            ? `✅ Kicked out of the WhatsApp group`
            : `⚠️ Off the crew DB, but couldn't kick them from the group${kickError ? ` (${kickError})` : ''}`) +
          (ownerVIP ? `\n\n_The owner personally removed this one. It's done._ 👑` : ''),
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew remove error:', error);
      await extra.reply(`❌ ERROR\n\n${voice.openErr()} — couldn't get them out, shame`);
    }
  },
};
