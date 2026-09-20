/**
 * Crew Apply Command — start a crew application.
 * Flow: .crew apply <team> (any SS group or DM)
 * → bot DMs the applicant the application form + assigns a UID.
 * Applicant then posts answers via .crew applied <team> <answers>.
 * Works from any Slammed Society group or a DM.
 */

const database = require('../../database');
const config = require('../../config');
const { pick, SLANG } = require('../../utils/format');
const { TEAMS, buildFormMessage } = require('./crewForms');

module.exports = {
  subName: 'apply',
  name: null,
  aliases: ['tryout'],
  category: 'crew',
  description: 'Start a crew application (bot DMs you the form)',
  usage: '.crew apply <team>',
  groupOnly: false,
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    try {
      if (!args || args.length === 0) {
        return extra.reply(
          `❌ ERROR\n\nProvide a team ${pick(SLANG.friend)}\n\n` +
          `Usage: .crew apply <team>\n` +
          `Teams: ${Object.keys(TEAMS).join(', ')}`
        );
      }

      const teamKey = args[0].toUpperCase();
      if (!TEAMS[teamKey] || !config.crewTeams[teamKey]) {
        return extra.reply(
          `❌ ERROR\n\nInvalid team ${pick(SLANG.error)}\n\n` +
          `Teams: ${Object.keys(TEAMS).join(', ')}`
        );
      }

      const sender = msg.key.participant || msg.key.remoteJid;
      const applicantJid = sender.includes('@g.us') ? (msg.key.participant || extra.sender) : sender;
      const teamGroupJid = config.crewTeams[teamKey].jid;

      // --- Already in the crew DB for this team? ---
      if (database.getCrewMember(teamGroupJid, applicantJid)) {
        return extra.reply(
          `❌ ERROR\n\nYou're already part of ${TEAMS[teamKey].label} ${pick(SLANG.vibe)}`
        );
      }

      // --- Already a participant in the team's WhatsApp group? ---
      try {
        const meta = await sock.groupMetadata(teamGroupJid).catch(() => null);
        if (meta && meta.participants) {
          const alreadyIn = meta.participants.some(p =>
            p.id === applicantJid ||
            p.id?.split('@')[0] === applicantJid.split('@')[0]
          );
          if (alreadyIn) {
            return extra.reply(
              `❌ ERROR\n\nYou're already in the ${teamKey} group 🤨\n` +
              `Why apply for a group you're already in?`
            );
          }
        }
      } catch (e) {}

      // --- Duplicate pending application? ---
      const existingApps = database.getApplicants(teamGroupJid);
      const dup = Object.values(existingApps).find(a => a.jid === applicantJid && a.status === 'pending');
      if (dup) {
        return extra.reply(
          `❌ ERROR\n\nYou already have a pending ${teamKey} application ${pick(SLANG.vibe)}\n` +
          `App ID: ${dup.appUid}\n\nWait for review or hit an admin`
        );
      }

      // Create the application (DB generates a short UID)
      const app = database.addApplicant(teamGroupJid, applicantJid, {
        team: teamKey,
        answers: null,
      });

      if (!app) {
        return extra.reply(`❌ ERROR\n\nCouldn't create application ${pick(SLANG.error)}`);
      }

      // Make sure the bot isn't blocking the applicant, so the form DM lands
      try {
        await sock.updateBlockStatus(applicantJid, 'unblock');
      } catch (e) {}

      // DM the applicant the form + their App ID
      const formText = buildFormMessage(teamKey);

      try {
        await sock.sendMessage(applicantJid, {
          text:
            `━━━━━━━━━━━━━━━━\n` +
            `🆔 *YOUR APPLICATION ID:* ${app.appUid}\n` +
            `━━━━━━━━━━━━━━━━\n\n` +
            formText,
        });
      } catch (dmErr) {
        console.error('[CREW APPLY] form DM failed:', dmErr.message);
        return extra.reply(
          `❌ ERROR\n\nCouldn't DM you the application form ${pick(SLANG.error)}\n` +
          `Check if you have DMs open from this bot`
        );
      }

      // Confirm where they applied from
      const confirmText =
        `✅ *APPLICATION STARTED*\n\n` +
        `🏢 Team: *${teamKey}* — ${TEAMS[teamKey].label}\n` +
        `🆔 *App ID:* ${app.appUid}\n\n` +
        `📲 I've DM'd you the application form.\n\n` +
        `✍️ Answer all questions and post them here with:\n` +
        `\`.crew applied ${teamKey} <your answers>\`\n\n` +
        `_${pick(SLANG.greeting)}, good luck!_`;

      await sock.sendMessage(extra.from, {
        text: confirmText,
        mentions: [applicantJid],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew apply error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't start the application`);
    }
  },
};