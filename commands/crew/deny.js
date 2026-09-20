/**
 * Crew Deny Command — reject an applicant by application UID.
 * Flow: .crew deny <appUid> [reason] → DM the applicant the team's not-hired
 * message + reason, remove the app.
 */

const database = require('../../database');
const { pick, SLANG } = require('../../utils/format');
const { TEAMS, buildDeniedMessage } = require('./crewForms');

module.exports = {
  subName: 'deny',
  name: null,
  aliases: ['reject'],
  category: 'crew',
  description: 'Deny applicant by application ID',
  usage: '.crew deny <appUid> [reason]',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const uidRaw = (args[0] || '').trim();
      const uid = uidRaw.toUpperCase();

      if (!uidRaw) {
        return extra.reply(
          `❌ ERROR\n\nProvide the application ID ${pick(SLANG.vibe)}\n\n` +
          `Usage: .crew deny <appUid> [reason]\n` +
          `Example: .crew deny SS-4FK2X not active enough`
        );
      }

      const app = database.getApplicantByUid(uid);
      if (!app) {
        return extra.reply(`❌ ERROR\n\nNo application found with ID *${uid}* ${pick(SLANG.error)}`);
      }

      const teamKey = app.team;
      const applicantJid = app.jid;
      const applicantNum = applicantJid.split('@')[0];
      const teamGroupJid = app.groupJid;
      const reason = args.slice(1).join(' ') || 'No reason given';

      // DM the applicant the not-hired message
      let dmSent = false;
      try {
        const message = TEAMS[teamKey]
          ? buildDeniedMessage(teamKey, reason)
          : `❌ APPLICATION DENIED\n\n❌ Your application (${uid}) was not accepted.\n\n💬 Reason: ${reason}`;
        await sock.sendMessage(applicantJid, { text: message });
        dmSent = true;
      } catch (e) {
        console.error('[CREW DENY] DM failed:', e.message);
      }

      // Remove the application
      if (teamGroupJid) {
        database.removeApplicant(teamGroupJid, uid);
      }

      // Confirm to the admin
      let confirm = `✅ *SUCCESS*\n\n❌ *APPLICATION DENIED*\n\n` +
        `🆔 App ID: ${uid}\n` +
        `👤 @${applicantNum}\n` +
        (TEAMS[teamKey] ? `🏢 Team: *${teamKey}* — ${TEAMS[teamKey].label}\n` : '') +
        `💬 Reason: ${reason}\n`;

      confirm += dmSent
        ? `\n📩 _Notification sent to the applicant_`
        : `\n⚠️ _Couldn't DM the applicant — they may have closed DMs_`;

      confirm += `\n\n_${pick(SLANG.good)}, handled!_`;

      return sock.sendMessage(extra.from, {
        text: confirm,
        mentions: [applicantJid]
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew deny error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't deny the applicant`);
    }
  },
};