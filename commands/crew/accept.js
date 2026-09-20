/**
 * Crew Accept Command — accept an applicant by their Application ID (UID).
 * Usage: .crew accept <UID> [role]
 * Only the team's group admins (or the owner) can accept.
 * On accept: adds to crew + DMs the applicant the "hired" message + group invite.
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG } = require('../../utils/format');
const { TEAMS, buildHiredMessage } = require('./crewForms');

const ROLE_EMOJIS = {
  'leader': '👑',
  'co-leader': '⭐',
  'officer': '🎖️',
  'member': '👤',
};

module.exports = {
  subName: 'accept',
  name: null,
  aliases: ['hire'],
  category: 'crew',
  description: 'Accept an applicant by App ID',
  usage: '.crew accept <UID> [role]',
  groupOnly: false,
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    try {
      const uid = (args[0] || '').toUpperCase();
      if (!uid) {
        return extra.reply(
          '❌ ERROR\n\nProvide the applicant\'s App ID\n\nUsage: .crew accept SS-XXXXX [role]'
        );
      }

      const app = database.getApplicantByUid(uid);
      if (!app) {
        return extra.reply(
          '❌ ERROR\n\nNo application found for ' + uid + '\nCheck the App ID and try again'
        );
      }

      const teamKey = app.team;
      const teamGroupJid = app.groupJid || config.crewTeams[teamKey]?.jid;
      const applicantJid = app.jid;
      const applicantNum = applicantJid ? applicantJid.split('@')[0] : 'unknown';

      // Permission: owner or an admin of the team's group
      let isTeamAdmin = false;
      if (!extra.isOwner) {
        try {
          const meta = await sock.groupMetadata(teamGroupJid).catch(() => null);
          if (meta && meta.participants) {
            isTeamAdmin = meta.participants.some(p =>
              p.id === extra.sender && (p.admin === 'admin' || p.admin === 'superadmin')
            );
          }
        } catch (e) {}
        if (!isTeamAdmin) {
          return extra.reply(
            '❌ ERROR\n\nOnly ' + teamKey + ' admins can accept applications, ' + pick(SLANG.friend)
          );
        }
      }

      // Role (default: lowest custom role)
      const validRoles = teamGroupJid ? database.getCustomRoles(teamGroupJid) : ['member'];
      let role = validRoles[0];
      for (const arg of args.slice(1)) {
        const lower = arg.toLowerCase();
        if (validRoles.includes(lower)) { role = lower; break; }
      }

      // Add to crew
      if (teamGroupJid) {
        database.addCrewMember(teamGroupJid, applicantJid, {
          role,
          joined: Date.now(),
          addedBy: extra.sender,
        });
      }

      // Remove the pending application
      database.removeApplicant(teamGroupJid, app.appUid);

      // DM the applicant the hired message + invite link
      const inviteLink = config.crewTeams[teamKey]?.invite
        ? 'https://chat.whatsapp.com/' + config.crewTeams[teamKey].invite
        : null;
      try {
        await sock.sendMessage(applicantJid, {
          text: buildHiredMessage(teamKey, inviteLink),
        });
      } catch (dmErr) {
        console.error('[CREW ACCEPT] hired DM failed:', dmErr.message);
      }

      const roleEmoji = ROLE_EMOJIS[role] || '👤';

      await sock.sendMessage(extra.from, {
        text:
          '✅ SUCCESS\n\n🎉 MEMBER ACCEPTED\n\n' +
          '🆔 App ID: ' + bold(uid) + '\n' +
          '👤 @' + applicantNum + '\n' +
          '🏷️ Role: ' + roleEmoji + ' ' + bold(role) + '\n\n' +
          '_Hired message + group invite sent to them_' + pick(SLANG.vibe),
        mentions: applicantJid ? [applicantJid] : [],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew accept error:', error);
      await extra.reply('❌ ERROR\n\n' + pick(SLANG.error) + ' — couldn\'t accept applicant');
    }
  },
};