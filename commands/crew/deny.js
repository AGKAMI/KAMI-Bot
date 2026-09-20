/**
 * Crew Deny Command — reject an applicant by their Application ID (UID).
 * Usage: .crew deny <UID> <reason>
 * Only the team's group admins (or the owner) can deny.
 * On deny: removes the application + DMs the applicant the "not hired" message.
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG } = require('../../utils/format');
const { buildDeniedMessage } = require('./crewForms');

module.exports = {
  subName: 'deny',
  name: null,
  aliases: ['reject'],
  category: 'crew',
  description: 'Deny an applicant by App ID',
  usage: '.crew deny <UID> <reason>',
  groupOnly: false,
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    try {
      const uid = (args[0] || '').toUpperCase();
      if (!uid) {
        return extra.reply(
          '❌ ERROR\n\nProvide the applicant\'s App ID\n\nUsage: .crew deny SS-XXXXX <reason>'
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
          '❌ ERROR\n\nOnly ' + teamKey + ' admins can deny applications, ' + pick(SLANG.friend)
        );
      }

      const reason = args.slice(1).join(' ').trim() || 'No reason given';

      // Remove the pending application
      database.removeApplicant(teamGroupJid, app.appUid);

      // DM the applicant the denial message
      try {
        await sock.sendMessage(applicantJid, {
          text: buildDeniedMessage(teamKey, reason),
        });
      } catch (dmErr) {
        console.error('[CREW DENY] denial DM failed:', dmErr.message);
      }

      await sock.sendMessage(extra.from, {
        text:
          '✅ SUCCESS\n\n❌ APPLICATION DENIED\n\n' +
          '🆔 App ID: ' + bold(uid) + '\n' +
          '👤 @' + applicantNum + '\n' +
          '📝 Reason: ' + reason + '\n\n' +
          '_Denial sent to them_' + pick(SLANG.vibe),
        mentions: applicantJid ? [applicantJid] : [],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew deny error:', error);
      await extra.reply('❌ ERROR\n\n' + pick(SLANG.error) + ' — couldn\'t deny applicant');
    }
  },
};