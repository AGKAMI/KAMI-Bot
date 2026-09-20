/**
 * Crew Applied Command — submit a completed application.
 * Flow: .crew applied <team> <answers> (run in any SS group)
 * → generates a short UID, stores the app, notifies the team's group admins.
 */

const database = require('../../database');
const config = require('../../config');
const { pick, SLANG } = require('../../utils/format');
const { TEAMS, buildAdminNotice } = require('./crewForms');

module.exports = {
  subName: 'applied',
  name: null,
  description: 'Submit a completed crew application',
  usage: '.crew applied <team> <answers>',
  groupOnly: true,
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    try {
      if (!args || args.length < 2) {
        return extra.reply(
          `❌ ERROR\n\nUsage: .crew applied <team> <your answers>\n\n` +
          `Example: .crew applied SSRS 1) 3 hours 2) 18 3) yes 4) yes 5) active daily 6) i move the vip to safety\n\n` +
          `Teams: ${Object.keys(TEAMS).join(', ')}`
        );
      }

      const teamKey = args[0].toUpperCase();
      if (!TEAMS[teamKey]) {
        return extra.reply(
          `❌ ERROR\n\nInvalid team ${pick(SLANG.error)}\n\nTeams: ${Object.keys(TEAMS).join(', ')}`
        );
      }

      const answers = args.slice(1).join(' ').trim();
      if (!answers) {
        return extra.reply(`❌ ERROR\n\nNo answers provided ${pick(SLANG.vibe)}\nRe-run with your full answers`);
      }

      const sender = msg.key.participant || msg.key.remoteJid;
      const applicantJid = sender.includes('@g.us') ? (msg.key.participant || extra.sender) : sender;

      // Which team group does this application belong to?
      const crewTeam = config.crewTeams[teamKey];
      const teamGroupJid = crewTeam ? crewTeam.jid : null;

      // Prevent duplicate pending apps for the same applicant+team
      if (teamGroupJid) {
        const applicants = database.getApplicants(teamGroupJid);
        const dup = Object.values(applicants).find(a => a.jid === applicantJid);
        if (dup) {
          return extra.reply(
            `❌ ERROR\n\nYou already have a pending ${teamKey} application ${pick(SLANG.vibe)}\n` +
            `App ID: ${dup.appUid}\n\nWait for review or hit an admin`
          );
        }
      } else {
        // If team group unknown, scan all apps for this applicant
        const crew = require('../../database');
        const all = crew.getAllTeams ? crew.getAllTeams() : {};
        for (const [jid, team] of Object.entries(all)) {
          if (team.applicants) {
            const dup = Object.values(team.applicants).find(a => a.jid === applicantJid && a.team === teamKey);
            if (dup) return extra.reply(`❌ ERROR\n\nYou already have a pending ${teamKey} application (${dup.appUid}) ${pick(SLANG.vibe)}`);
          }
        }
      }

      // If team group is not configured, use the group they submitted from
      const storeGroupJid = teamGroupJid || extra.from;

      // Create the application keyed by UID
      const app = database.addApplicant(storeGroupJid, applicantJid, {
        team: teamKey,
        answers,
        appUid: undefined // database generates a fresh UID
      });

      if (!app) {
        return extra.reply(`❌ ERROR\n\nCouldn't create application ${pick(SLANG.error)}`);
      }

      // Notify the team's group admins (post the app notice there)
      let adminMsg = null;
      if (teamGroupJid) {
        try {
          const notice = buildAdminNotice({
            ...app,
            team: teamKey,
            answers,
            jid: applicantJid
          });
          const members = await sock.groupMetadata(teamGroupJid).catch(() => null);
          const admins = (members && members.participants
            ? members.participants.filter(p => p.admin).map(p => p.id)
            : []);
          await sock.sendMessage(teamGroupJid, {
            text: notice,
            ...(admins.length ? { mentions: admins } : {})
          });
          adminMsg = true;
        } catch (e) {
          console.error('[CREW APPLIED] admin notify failed:', e.message);
          adminMsg = false;
        }
      }

      // Confirm to the applicant
      const confirm = `✅ *APPLICATION SUBMITTED*\n\n` +
        `🏢 Team: *${teamKey}* — ${TEAMS[teamKey].label}\n` +
        `🆔 *Application ID:* ${app.appUid}\n` +
        `👤 Applicant: @${applicantJid.split('@')[0]}\n\n` +
        (adminMsg === false
          ? `⚠️ _Couldn't notify the team group automatically — but your application is stored._\n\n`
          : `_Your application has been sent to the ${teamKey} leadership ${pick(SLANG.good)}_\n\n`) +
        `⏳ Keep this App ID — one of the ${teamKey} admins will use it to accept or reject you.\n\n` +
        `_${pick(SLANG.greeting)}, good luck!_`;

      return sock.sendMessage(extra.from, {
        text: confirm,
        mentions: [applicantJid]
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew applied error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't submit the application`);
    }
  },
};