/**
 * Crew Reroll Command — owner resets a denied/withdrawn/expired application
 * so the applicant can reapply fresh.
 * Usage: .crew reroll <UID>
 * Owner-only. Removes the processed record and notifies the applicant.
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  subName: 'reroll',
  name: null,
  category: 'crew',
  description: 'Reset a denied app so applicant can reapply (owner only)',
  usage: '.crew reroll <UID>',
  groupOnly: false,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const uid = (args[0] || '').toUpperCase();
      if (!uid) {
        return extra.reply(
          `❌ ERROR\n\nProvide the App ID\n\nUsage: \`${prefix}crew reroll SS-XXXXX\``
        );
      }

      // Check if it's still pending
      const pendingApp = database.getApplicantByUid(uid);
      if (pendingApp) {
        return extra.reply(
          `❌ ERROR\n\nApplication *${uid}* is still *pending* — no need to reroll\n` +
          `Accept it with: \`${prefix}crew accept ${uid}\` or deny with: \`${prefix}crew deny ${uid} <reason>\``
        );
      }

      // Find the processed record
      const processed = database.getProcessedApp(uid);
      if (!processed) {
        return extra.reply(
          `❌ ERROR\n\nNo application found for *${uid}* — pending or processed`
        );
      }

      if (processed.action === 'accepted') {
        return extra.reply(
          `❌ ERROR\n\nApplication *${uid}* was *accepted* — this person is already in the crew\n` +
          `If you want to remove them, use: \`${prefix}crew remove @user\``
        );
      }

      const teamKey = processed.team;
      const applicantJid = processed.applicantJid;
      const applicantNum = applicantJid ? applicantJid.split('@')[0] : 'unknown';
      const teamGroupJid = processed.groupJid || config.crewTeams[teamKey]?.jid;

      // Remove the processed record
      const crew = database.getTeam(teamGroupJid);
      if (crew.processedApps && crew.processedApps[uid]) {
        delete crew.processedApps[uid];
        database.updateTeam(teamGroupJid, crew);
      }

      // Log admin action for audit trail
      database.logAdminAction({
        action: 'rerolled',
        appUid: uid,
        team: teamKey,
        admin: extra.sender,
        applicant: applicantJid,
      });

      // Notify the applicant
      try {
        await sock.sendMessage(applicantJid, {
          text: `🔄 *APPLICATION RESET*\n\n` +
                `Your *${teamKey}* application (ID: *${uid}*) has been reset by the owner.\n\n` +
                `You can reapply fresh: \`${prefix}crew apply ${teamKey}\`\n` +
                `_Your old answers have been cleared._`
        });
      } catch (dmErr) {
        console.error('[CREW REROLL] DM failed:', dmErr.message);
      }

      await extra.reply(
        `✅ REROLLED\n\n` +
        `🆔 App ID: *${uid}*\n` +
        `👤 @${applicantNum}\n` +
        `🏢 Team: *${teamKey}*\n` +
        `📋 Previous action: *${processed.action}*\n\n` +
        `_Processed record cleared. Applicant can reapply._`
      );

    } catch (error) {
      console.error('Crew reroll error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't reroll application`);
    }
  },
};
