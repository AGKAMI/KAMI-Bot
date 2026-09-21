/**
 * Crew Cancel Command — owner cancels ANY pending application.
 * Usage: .crew cancel <UID> [reason]
 * Owner-only. Notifies the applicant.
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG, mention } = require('../../utils/format');

module.exports = {
  subName: 'cancel',
  name: null,
  category: 'crew',
  description: 'Cancel any pending application (owner only)',
  usage: '.crew cancel <UID> [reason]',
  groupOnly: false,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const uid = (args[0] || '').toUpperCase();
      if (!uid) {
        return extra.reply(
          `❌ ERROR\n\nProvide the App ID\n\nUsage: \`${prefix}crew cancel SS-XXXXX [reason]\``
        );
      }

      const app = database.getApplicantByUid(uid);
      if (!app) {
        const processed = database.getProcessedApp(uid);
        if (processed) {
          return extra.reply(
            `❌ ERROR\n\nApplication *${uid}* was already *${processed.action}*` +
            (processed.admin ? ` by ${processed.admin === 'system' ? 'system (expired)' : mention(processed.admin)}` : '')
          );
        }
        return extra.reply(
          `❌ ERROR\n\nNo application found for *${uid}*`
        );
      }

      const teamKey = app.team;
      const teamGroupJid = app.groupJid || config.crewTeams[teamKey]?.jid;
      const applicantJid = app.jid;
      const reason = args.slice(1).join(' ').trim();

      // Track as cancelled
      database.trackProcessedApp(teamGroupJid, app.appUid, {
        action: 'cancelled',
        admin: extra.sender,
        reason: reason || null,
        applicantJid,
        team: teamKey,
      });

      // Log admin action for audit trail
      database.logAdminAction({
        action: 'cancelled',
        appUid: uid,
        team: teamKey,
        admin: extra.sender,
        applicant: applicantJid,
        reason: reason || null,
      });

      // Remove the pending application
      database.removeApplicant(teamGroupJid, app.appUid);

      // DM the applicant
      try {
        await sock.sendMessage(applicantJid, {
          text: `🚫 *APPLICATION CANCELLED*\n\n` +
                `Your *${teamKey}* application (ID: *${uid}*) has been cancelled by the owner.` +
                (reason ? `\n\n💬 *Reason:* ${reason}` : '') +
                `\n\n🔄 You can reapply anytime: \`${prefix}crew apply ${teamKey}\``
        });
      } catch (dmErr) {
        console.error('[CREW CANCEL] DM failed:', dmErr.message);
      }

      await extra.reply(
        `✅ CANCELLED\n\n` +
        `🆔 App ID: *${uid}*\n` +
        `👤 ${mention(applicantJid)}\n` +
        `🏢 Team: *${teamKey}*\n` +
        (reason ? `📝 Reason: ${reason}\n` : '') +
        `\n_Applicant has been notified._`
      );

    } catch (error) {
      console.error('Crew cancel error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't cancel application`);
    }
  },
};
