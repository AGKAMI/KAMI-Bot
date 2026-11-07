const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG, voice, mention } = require('../../utils/format');
const { resolveUser } = require('./crewHelpers');
const { getRoleEmoji } = require('../../utils/teamName');
const { isPersonInCrewGroup } = require('../../utils/crewGuard');

module.exports = {
  subName: 'demote',
  name: null,
  aliases: ['down'],
  category: 'crew',
  description: 'Demote member one rank',
  usage: '.crew demote @user|number',
  groupOnly: false,
  adminOnly: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      const resolved = resolveUser(args, mentioned, ctx);

      if (!resolved.jid) {
        return extra.reply(
          `❌ ERROR\n\nTag someone or drop a number\n\nUsage: \`${prefix}crew demote @user|number\``
        );
      }

      const target = resolved.jid;

      // Look up with PN + LID variant handling
      const member = database.getCrewMemberAnyVariant(extra.from, target);
      if (!member) {
        // Stale DB entry possible — verify real-time group presence
        const actuallyInGroup = await isPersonInCrewGroup(sock, extra.from, target);
        if (!actuallyInGroup) {
          try { database.removeCrewMember(extra.from, target); } catch (e) {}
          try { database.flushCrew(); } catch (e) {}
        }
        return extra.reply(`❌ ERROR\n\n${mention(target)} is not in this crew`);
      }

      // Verify they're actually in the WhatsApp group right now — a stale crew
      // DB entry must not block demotion.
      const actuallyInGroup = await isPersonInCrewGroup(sock, extra.from, target);
      if (!actuallyInGroup) {
        console.log(`[CREW DEMOTE] clearing stale crew entry for ${target} in ${extra.from} (not in group)`);
        try { database.removeCrewMember(extra.from, target); } catch (e) {}
        try { database.flushCrew(); } catch (e) {}
        return extra.reply(`❌ ERROR\n\n${mention(target)} is not in this crew`);
      }

      const validRoles = database.getCustomRoles(extra.from);
      const oldRole = member.role;
      const idx = validRoles.indexOf(oldRole);

      if (idx <= 0) {
        return extra.reply(`❌ ERROR\n\n${mention(target)} is already the lowest rank`);
      }

      const newRole = validRoles[idx - 1];
      database.updateCrewMember(extra.from, target, { ...member, role: newRole });
      const ownerVIP = extra.isOwnerMentioned;

      await sock.sendMessage(extra.from, {
        text:
          '✅ SUCCESS\n\n' +
          (ownerVIP
            ? '👑 THE BOSS HAS SPOKEN 👑\n\n'
            : '⬇️ DEMOTED\n\n') +
          mention(target) + '\n\n' +
          (getRoleEmoji(oldRole, validRoles)) + ' ' + oldRole + ' → ' +
          (getRoleEmoji(newRole, validRoles)) + ' ' + bold(newRole) +
          (ownerVIP ? '\n\n_The owner himself has demoted this member._ 👑' : ''),
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew demote error:', error);
      await extra.reply('❌ ERROR\n\n' + voice.openErr() + ' — couldn\'t demote');
    }
  },
};
