/**
 * Crew Deny Command — reject an applicant by their Application ID (UID).
 * Usage: .crew deny <UID> <reason>
 * Only the team's group admins (or the owner) can deny.
 * On deny: removes the application + DMs the applicant the "not hired" message.
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG, mention } = require('../../utils/format');
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

  const prefix = config.prefix || '.';
    try {
      const uid = (args[0] || '').toUpperCase();
      if (!uid) {
        return extra.reply(
          `❌ ERROR\n\nProvide the applicant's App ID\n\nUsage: \`${prefix}crew deny SS-XXXXX <reason>\``
        );
      }

      const app = database.getApplicantByUid(uid);
      if (!app) {
        // Check if it was already processed
        const processed = database.getProcessedApp(uid);
        if (processed) {
          const time = new Date(processed.processedAt).toLocaleString('en-ZA');
          if (processed.action === 'accepted') {
            return extra.reply(
              `❌ ERROR\n\nApplication *${uid}* was already *accepted* by ${mention(processed.admin)} on ${time}` +
              (processed.role ? `\n🏷️ Role given: ${processed.role}` : '')
            );
          } else {
            return extra.reply(
              `❌ ERROR\n\nApplication *${uid}* was already *denied* by ${mention(processed.admin)} on ${time}` +
              (processed.reason ? `\n📝 Reason: ${processed.reason}` : '')
            );
          }
        }
        return extra.reply(
          `❌ ERROR\n\nNo application found for *${uid}*\nCheck the App ID and try again`
        );
      }

      const teamKey = app.team;
      const teamGroupJid = app.groupJid || config.crewTeams[teamKey]?.jid;
      const applicantJid = app.jid;

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
          '❌ ERROR\n\nOnly ' + teamKey + ' admins can deny applications'
        );
      }

      const reason = args.slice(1).join(' ').trim() || 'No reason given';

      // Track as processed before removing
      database.trackProcessedApp(teamGroupJid, app.appUid, {
        action: 'denied',
        admin: extra.sender,
        reason,
        applicantJid,
        team: teamKey,
      });

      // Log admin action for audit trail
      database.logAdminAction({
        action: 'denied',
        appUid: app.appUid,
        team: teamKey,
        admin: extra.sender,
        applicant: applicantJid,
        reason: reason,
      });

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

      const ownerVIP = extra.isOwnerMentioned;

      await sock.sendMessage(extra.from, {
        text:
          '✅ SUCCESS\n\n' +
          (ownerVIP
            ? '👑 THE BOSS HAS SPOKEN 👑\n\n'
            : '❌ APPLICATION DENIED\n\n') +
          '🆔 App ID: ' + bold(uid) + '\n' +
          '👤 ' + mention(applicantJid) + '\n' +
          '📝 Reason: ' + reason + '\n\n' +
          (ownerVIP
            ? '_The owner himself has denied this application. The verdict is final._ 👑'
            : '_Denial sent to them_' + pick(SLANG.vibe)),
        mentions: applicantJid ? [applicantJid] : [],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew deny error:', error);
      await extra.reply('❌ ERROR\n\n' + pick(SLANG.error) + ' — couldn\'t deny applicant');
    }
  },
};