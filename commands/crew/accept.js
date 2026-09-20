/**
 * Crew Accept Command — accept an applicant by application UID.
 * Flow: .crew accept <appUid> → DM the applicant the team's hired message
 * + group invite link, add them to the team group, remove the app.
 */

const database = require('../../database');
const config = require('../../config');
const { pick, SLANG } = require('../../utils/format');
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
  description: 'Accept applicant by application ID',
  usage: '.crew accept <appUid>',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const uidRaw = (args[0] || '').trim();
      const uid = uidRaw.toUpperCase();

      if (!uidRaw) {
        return extra.reply(
          `❌ ERROR\n\nProvide the application ID ${pick(SLANG.vibe)}\n\n` +
          `Usage: .crew accept <appUid>\n` +
          `Example: .crew accept SS-4FK2X\n\n` +
          `Get app IDs from: .crew applicants`
        );
      }

      const app = database.getApplicantByUid(uid);
      if (!app) {
        return extra.reply(`❌ ERROR\n\nNo application found with ID *${uid}* ${pick(SLANG.error)}`);
      }

      const teamKey = app.team;
      if (!TEAMS[teamKey]) {
        return extra.reply(`❌ ERROR\n\nApplication ${uid} is for an unknown team ${pick(SLANG.error)}`);
      }

      const applicantJid = app.jid;
      const applicantNum = applicantJid.split('@')[0];
      const teamGroupJid = app.groupJid || config.crewTeams[teamKey]?.jid;

      // Add them to the crew roster first (role = first valid role or member)
      const validRoles = teamGroupJid ? database.getCustomRoles(teamGroupJid) : [];
      const role = validRoles[0] || 'member';

      if (teamGroupJid) {
        database.addCrewMember(teamGroupJid, applicantJid, {
          role,
          joined: Date.now(),
          addedBy: extra.sender || applicantJid,
        });
      }

      // Optionally add them to the WhatsApp group if the bot can
      let groupAdded = false;
      if (teamGroupJid) {
        try {
          await sock.groupParticipantsUpdate(teamGroupJid, [applicantJid], 'add');
          groupAdded = true;
        } catch (e) {
          console.error('[CREW ACCEPT] group add failed:', e.message);
          groupAdded = false;
        }
      }

      // Build the group invite link
      let inviteLink = config.crewTeams[teamKey]?.invite
        ? `https://chat.whatsapp.com/${config.crewTeams[teamKey].invite}`
        : null;
      if (!inviteLink && teamGroupJid) {
        try {
          const code = await sock.groupInviteCode(teamGroupJid);
          if (code) inviteLink = `https://chat.whatsapp.com/${code}`;
        } catch (e) {}
      }

      // DM the applicant the hired message
      let dmSent = false;
      try {
        await sock.sendMessage(applicantJid, { text: buildHiredMessage(teamKey, inviteLink) });
        dmSent = true;
      } catch (e) {
        console.error('[CREW ACCEPT] DM failed:', e.message);
      }

      // Remove the application
      if (teamGroupJid) {
        database.removeApplicant(teamGroupJid, uid);
      }

      // Confirm to the admin
      const roleEmoji = ROLE_EMOJIS[role] || '👤';
      let confirm = `✅ *SUCCESS*\n\n🎉 *APPLICANT ACCEPTED*\n\n` +
        `🆔 App ID: ${uid}\n` +
        `👤 @${applicantNum}\n` +
        `🏢 Team: *${teamKey}* — ${TEAMS[teamKey].label}\n` +
        `🏷️ Role: ${roleEmoji} ${role}\n`;

      if (groupAdded) confirm += `\n➕ *Added to the group* ✅`;
      else if (teamGroupJid) confirm += `\n⚠️ _Couldn't auto-add to the group — add ${applicantNum} manually_`;
      if (dmSent) confirm += `\n📩 _Hired message sent to the applicant (with invite link)_`;
      else confirm += `\n⚠️ _Couldn't DM the hired message to the applicant_`;

      confirm += `\n\n_${pick(SLANG.good)}, sorted!_`;

      return sock.sendMessage(extra.from, {
        text: confirm,
        mentions: [applicantJid]
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew accept error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't accept the applicant`);
    }
  },
};