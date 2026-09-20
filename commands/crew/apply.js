/**
 * Crew Apply Command — DM the applicant the team application form.
 * Flow: .crew apply <team> → bot DMs the applicant the form
 * Dedicated .crew applied <team> <answers> handler does the submission.
 */

const database = require('../../database');
const config = require('../../config');
const { pick, SLANG } = require('../../utils/format');
const { TEAMS, buildFormMessage } = require('./crewForms');

const VALID_TEAMS = Object.keys(TEAMS);

module.exports = {
  subName: 'apply',
  name: null,
  aliases: ['tryout'],
  category: 'crew',
  description: 'Get the application form for a Slammed Society team',
  usage: '.crew apply <team>',
  groupOnly: true,
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    try {
      if (args.length === 0) {
        return extra.reply(
          `❌ ERROR\n\nProvide a team ${pick(SLANG.friend)}\n\n` +
          `Usage: .crew apply <team>\n` +
          `Teams: ${VALID_TEAMS.join(', ')}`
        );
      }

      const teamInput = args.join(' ').trim().toUpperCase();
      const teamKey = VALID_TEAMS.find(k => k.toUpperCase() === teamInput);

      if (!teamKey) {
        return extra.reply(
          `❌ ERROR\n\nInvalid team ${pick(SLANG.error)}\n\n` +
          `Teams: ${VALID_TEAMS.join(', ')}`
        );
      }

      const sender = msg.key.participant || msg.key.remoteJid;
      const applicantJid = sender.includes('@g.us') ? msg.key.participant || extra.sender : sender;

      // Check they're not already applied or in the crew
      const teamMap = database.getTeamMap();
      const teamGroupJid = config.crewTeams[teamKey]?.jid;

      // Only check for a pending app if we know the team group
      if (teamGroupJid) {
        const applicants = database.getApplicants(teamGroupJid);
        const existing = Object.values(applicants).find(a => a.jid === applicantJid);
        if (existing) {
          return extra.reply(
            `❌ ERROR\n\nYou already have a pending application ${pick(SLANG.vibe)}\n` +
            `Team: ${TEAMS[existing.team] ? TEAMS[existing.team].label : existing.team}\n` +
            `App ID: ${existing.appUid}\n\n` +
            `Wait for leadership to review it first`
          );
        }
      }

      const crewMember = teamGroupJid ? database.getCrewMember(teamGroupJid, applicantJid) : null;
      if (crewMember) {
        return extra.reply(
          `❌ ERROR\n\nYou're already in that crew ${pick(SLANG.vibe)}\n` +
          `Role: ${crewMember.role || 'Unassigned'}`
        );
      }

      // DM the applicant the form
      const formText = buildFormMessage(teamKey);

      const dmSent = await sock.sendMessage(applicantJid, { text: formText }).catch(() => false);

      if (dmSent === false) {
        return extra.reply(
          `❌ ERROR\n\nCouldn't DM you ${pick(SLANG.error)} — open your DMs so the bot can message you.\n\n` +
          `Bot can't reach you on ${applicantJid.split('@')[0]}`
        );
      }

      // Confirm in group
      return extra.reply(
        `✅ *APPLICATION FORM SENT*\n\n` +
        `📩 *Check your DMs* — ${TEAMS[teamKey].label} form is there ${pick(SLANG.good)}\n\n` +
        `✍️ When you've answered, reply in this group:\n` +
        `${'.'}crew applied ${teamKey} <your answers>\n\n` +
        `Make sure all 6 answers are in ONE message`
      );

    } catch (error) {
      console.error('Crew apply error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't send the application form`);
    }
  },
};