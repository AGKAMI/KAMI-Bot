/**
 * Crew Withdraw Command — withdraw a pending application.
 * Usage: .crew withdraw <UID>
 * Only the applicant themselves can withdraw.
 */

const database = require('../../database');
const config = require('../../config');
const { pick, SLANG } = require('../../utils/format');
const { buildComparableIds } = require('../../utils/jidHelper');
const { getTeamDisplayName } = require('../../utils/teamName');

module.exports = {
  subName: 'withdraw',
  name: null,
  category: 'crew',
  description: 'Withdraw a pending application',
  usage: '.crew withdraw <UID>',
  groupOnly: false,
  ownerOnly: false,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const uid = (args[0] || '').toUpperCase();
      if (!uid) {
        return extra.reply(
          `❌ ERROR\n\nProvide your App ID\n\nUsage: \`${prefix}crew withdraw SS-XXXXX\``
        );
      }

      const app = database.getApplicantByUid(uid);
      if (!app) {
        // Check if already processed
        const processed = database.getProcessedApp(uid);
        if (processed) {
          if (processed.action === 'accepted') {
            return extra.reply(`❌ ERROR\n\nApplication *${uid}* was already accepted. You're in the crew.`);
          } else if (processed.action === 'denied') {
            return extra.reply(`❌ ERROR\n\nApplication *${uid}* was already denied.`);
          } else {
            return extra.reply(`❌ ERROR\n\nApplication *${uid}* expired and was auto-removed.`);
          }
        }
        return extra.reply(
          `❌ ERROR\n\nNo application found for *${uid}*\nCheck the App ID and try again`
        );
      }

      // Only the applicant themselves can withdraw (or the owner)
      const sender = msg.key.participant || msg.key.remoteJid;
      const applicantJid = sender.includes('@g.us') ? (msg.key.participant || extra.sender) : sender;
      const isSamePerson = buildComparableIds(applicantJid)
        .some(v => buildComparableIds(app.jid).includes(v));

      if (!extra.isOwner && !isSamePerson) {
        return extra.reply(
          `❌ ERROR\n\nOnly the applicant can withdraw their own application`
        );
      }

      const teamKey = app.team;
      const teamGroupJid = app.groupJid || config.crewTeams[teamKey]?.jid;

      // Track as withdrawn
      database.trackProcessedApp(teamGroupJid, app.appUid, {
        action: 'withdrawn',
        admin: applicantJid,
        applicantJid: app.jid,
        team: teamKey,
      });

      // Remove the pending application
      database.removeApplicant(teamGroupJid, app.appUid);

      await extra.reply(
        `✅ APPLICATION WITHDRAWN\n\n` +
        `🆔 App ID: *${uid}*\n` +
        `🏢 Team: *${getTeamDisplayName(teamKey)}*\n\n` +
        `_You can reapply anytime with: \`${prefix}crew apply ${teamKey}\`_`
      );

    } catch (error) {
      console.error('Crew withdraw error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't withdraw application`);
    }
  },
};
