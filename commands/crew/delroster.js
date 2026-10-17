/**
 * Crew Delroster — remove someone from the crew roster (database only).
 * Works in a crew group (target = mention/reply/number) AND as the
 * landing command for the roster picker buttons (memberPicker dispatches
 * the picked jid as args[0]).
 *
 * This does NOT kick them from the WhatsApp group — use !kick for that.
 * It clears the roster entry so activity tracking / kick-engine flags
 * stop targeting them.
 */

const database = require('../../database');
const config = require('../../config');
const { mention, voice } = require('../../utils/format');
const { buildComparableIds, normalizeJidWithLid } = require('../../utils/jidHelper');

module.exports = {
  subName: 'delroster',
  name: 'delroster',
  aliases: ['rosterremove'],
  category: 'crew',
  description: 'Remove someone from the crew roster (database only, no kick)',
  usage: '.crew delroster @user',
  adminOnly: true,
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      // Permission — programmatic executes (picker dispatch) bypass the
      // handler gates, so re-check here: owner or group admin
      const senderNum = String(extra.sender || '').split('@')[0].replace(/\D/g, '');
      const isOwner = (config.ownerNumber || []).some(o => {
        const d = String(o).replace(/\D/g, '');
        return d && (senderNum === d || senderNum.endsWith(d) || d.endsWith(senderNum));
      });
      let isAdmin = isOwner || database.isTeamAdmin(extra.sender);
      if (!isAdmin) {
        try {
          const meta = extra.groupMetadata || await sock.groupMetadata(extra.from);
          isAdmin = (meta?.participants || []).some(p =>
            (p.id === extra.sender || p.lid === extra.sender) && p.admin);
        } catch (e) { /* DM or fetch fail — stays unauthorised */ }
      }
      if (!isAdmin) {
        extra.fail();
        return extra.reply(`❌ ERROR\n\nOnly group admins manage the roster, boet`);
      }

      // Target: the roster picker hands us the member as a synthetic
      // mentionedJid; typed usage resolves mention/reply
      let target = '';
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = (ctx?.mentionedJid || [])[0];
      if (mentioned) target = mentioned;
      else if (ctx?.participant) target = ctx.participant;
      else if (args[0] && args[0].includes('@')) target = args[0];

      if (!target) {
        extra.fail();
        return extra.reply(
          `❌ ERROR\n\nTag or reply to somebody\n\n` +
          `Usage: \`${config.prefix || '.'}crew delroster @user\``
        );
      }

      // Normalize to a canonical form, then find the roster key by variant
      const candidate = normalizeJidWithLid(target) || target;
      const team = database.getTeam(extra.from);
      const members = (team && team.members) || {};
      const variants = buildComparableIds(candidate);
      let rosterKey = null;
      for (const memberJid of Object.keys(members)) {
        if (memberJid === candidate || buildComparableIds(memberJid).some(v => variants.includes(v))) {
          rosterKey = memberJid;
          break;
        }
        // bare-digit fallback (LID mapping files can be missing)
        const a = memberJid.split('@')[0].replace(/\D/g, '');
        const b = candidate.split('@')[0].replace(/\D/g, '');
        if (a && a === b) { rosterKey = memberJid; break; }
      }

      if (!rosterKey) {
        extra.fail();
        return extra.reply(
          `❌ ERROR\n\n${mention(candidate)} isn't on the roster, boet`
        );
      }

      const removed = database.removeCrewMember(extra.from, rosterKey);
      database.flushCrew();

      await extra.reply(
        `✅ SUCCESS\n\n` +
        `➖ Removed ${mention(candidate)} from the roster\n\n` +
        `_Database only — they're still in the group. Use \`${config.prefix || '.'}kick\` for that._`
      );
    } catch (error) {
      extra.fail();
      await extra.reply(`❌ ERROR\n\n${voice.openErr()} — ${error.message}`);
    }
  }
};
