/**
 * Crew Accept Command — accept an applicant by their Application ID (UID).
 * Usage: .crew accept <UID> [role]
 * Only the team's group admins (or the owner) can accept.
 * On accept: adds to crew + DMs the applicant the "hired" message + group invite.
 */

const database = require('../../database');
const config = require('../../config');
const axios = require('axios');
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

      // Permission: owner, a team admin (DM-approved), or a group admin of the team's group
      let isTeamAdmin = database.isTeamAdmin(extra.sender);
      let isGroupAdmin = false;
      if (!extra.isOwner && !isTeamAdmin) {
        try {
          const meta = await sock.groupMetadata(teamGroupJid).catch(() => null);
          if (meta && meta.participants) {
            isGroupAdmin = meta.participants.some(p =>
              p.id === extra.sender && (p.admin === 'admin' || p.admin === 'superadmin')
            );
          }
        } catch (e) {}
      }
      if (!extra.isOwner && !isTeamAdmin && !isGroupAdmin) {
        return extra.reply(
          '❌ ERROR\n\nOnly ' + teamKey + ' admins can accept applications'
        );
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

        // Track owner-added members for protection
        if (extra.isOwner) {
          database.addOwnerAddedMember(teamGroupJid, applicantJid, extra.sender);
        }
      }

      // Remove the pending application
      database.removeApplicant(teamGroupJid, app.appUid);

      // Re-block auto-unblocked team admins if no pending apps remain for their teams
      try {
        const autoUnblocked = database.getAutoUnblockedTeamAdmins();
        for (const adminNum of autoUnblocked) {
          const adminJid = adminNum + '@s.whatsapp.net';
          if (!database.hasPendingApplicationsForAnyTeam(adminJid)) {
            try {
              await sock.updateBlockStatus(adminJid, 'block');
              database.removeAutoUnblockedTeamAdmin(adminJid);
              console.log(`[CREW ACCEPT] Re-blocked admin ${adminNum} — no pending applications remaining`);
            } catch (e) {
              console.error(`[CREW ACCEPT] Failed to re-block admin ${adminNum}:`, e.message);
            }
          }
        }
      } catch (e) {
        console.error('[CREW ACCEPT] Admin re-block error:', e.message);
      }

      // Add the applicant to the team's WhatsApp group
      let addedToGroup = false;
      if (teamGroupJid) {
        try {
          await sock.groupParticipantsUpdate(teamGroupJid, [applicantJid], 'add');
          addedToGroup = true;
        } catch (addErr) {
          console.error('[CREW ACCEPT] group add failed:', addErr.message);
        }
      }

      // Build the hired message with the team's invite link
      const inviteLink = config.crewTeams[teamKey]?.invite
        ? 'https://chat.whatsapp.com/' + config.crewTeams[teamKey].invite
        : null;
      const hiredText = buildHiredMessage(teamKey, inviteLink);

      // DM the applicant the hired message, attaching the team group's profile pic as the caption image
      try {
        let sent = false;
        try {
          const ppUrl = await sock.profilePictureUrl(teamGroupJid, 'image');
          if (ppUrl) {
            const picRes = await axios.get(ppUrl, { responseType: 'arraybuffer' });
            await sock.sendMessage(applicantJid, {
              image: Buffer.from(picRes.data),
              caption: hiredText,
            });
            sent = true;
          }
        } catch (ppErr) {
          console.error('[CREW ACCEPT] pp fetch failed:', ppErr.message);
        }
        if (!sent) {
          await sock.sendMessage(applicantJid, { text: hiredText });
        }
      } catch (dmErr) {
        console.error('[CREW ACCEPT] hired DM failed:', dmErr.message);
      }

      const roleEmoji = ROLE_EMOJIS[role] || '👤';
      const ownerVIP = extra.isOwnerMentioned;

      await sock.sendMessage(extra.from, {
        text:
          '✅ SUCCESS\n\n' +
          (ownerVIP
            ? '👑 THE BOSS HAS SPOKEN 👑\n\n'
            : '🎉 MEMBER ACCEPTED\n\n') +
          '🆔 App ID: ' + bold(uid) + '\n' +
          '👤 @' + applicantNum + '\n' +
          '🏷️ Role: ' + roleEmoji + ' ' + bold(role) + '\n\n' +
          (addedToGroup
            ? '✅ Added to the ' + teamKey + ' group\n'
            : '⚠️ Couldn\'t auto-add them to the group — send the invite manually\n') +
          (ownerVIP
            ? '_The owner himself has accepted this member. Welcome to the squad._ 👑'
            : '_Hired message + group pic + invite sent to them_' + pick(SLANG.vibe)),
        mentions: applicantJid ? [applicantJid] : [],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew accept error:', error);
      await extra.reply('❌ ERROR\n\n' + pick(SLANG.error) + ' — couldn\'t accept applicant');
    }
  },
};