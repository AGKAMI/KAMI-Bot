/**
 * Crew Applied Command — submit answers for an existing application.
 * Flow: .crew apply <team> (bot DMs form + App ID)
 *   → .crew applied <team> <answers> (attaches answers, DMs the team's group admins)
 * Answers can be multi-line — they're extracted from the raw message, preserving line breaks.
 */

const database = require('../../database');
const config = require('../../config');
const { pick, SLANG } = require('../../utils/format');
const { TEAMS, buildAdminNotice } = require('./crewForms');

module.exports = {
  subName: 'applied',
  name: null,
  description: 'Submit your application answers',
  usage: '.crew applied <team> <answers>',
  groupOnly: true,
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    try {
      if (!args || args.length < 2) {
        return extra.reply(
          `❌ ERROR\n\nUsage: .crew applied <team> <your answers>\n\n` +
          `Teams: ${Object.keys(TEAMS).join(', ')}\n\n` +
          `You can put each answer on its own line — just keep it in ONE message`
        );
      }

      const teamKey = args[0].toUpperCase();
      if (!TEAMS[teamKey]) {
        return extra.reply(
          `❌ ERROR\n\nInvalid team ${pick(SLANG.error)}\n\nTeams: ${Object.keys(TEAMS).join(', ')}`
        );
      }

      // Extract the raw message text so we can preserve line breaks in the answers
      const rawText = msg.message?.extendedTextMessage?.text ||
                      msg.message?.conversation ||
                      '';
      const match = rawText.match(/^\.?\s*crew\s+applied\s+\S+\s*([\s\S]*)$/i);
      let answers = (match ? match[1] : args.slice(1).join('\n')).trim();

      // Fallback: strip leading command tokens from raw if regex missed (custom prefix)
      if (!answers) {
        answers = args.slice(1).join('\n').trim();
      }

      if (!answers) {
        return extra.reply(`❌ ERROR\n\nNo answers provided ${pick(SLANG.vibe)}\nRe-run with your full answers`);
      }

      const sender = msg.key.participant || msg.key.remoteJid;
      const applicantJid = sender.includes('@g.us') ? (msg.key.participant || extra.sender) : sender;

      const crewTeam = config.crewTeams[teamKey];
      const teamGroupJid = crewTeam ? crewTeam.jid : null;
      const storeGroupJid = teamGroupJid || extra.from;

      // Find this applicant's pending app for this team
      let app = null;
      const applicants = database.getApplicants(storeGroupJid);
      const existing = Object.values(applicants).find(a =>
        a.jid === applicantJid && a.status === 'pending'
      );

      if (existing) {
        // Attach answers to the existing app (created by .crew apply)
        const team = database.getTeam(storeGroupJid);
        team.applicants[existing.appUid].answers = answers;
        database.updateTeam(storeGroupJid, team);
        app = team.applicants[existing.appUid];
      } else {
        // No prior .crew apply — create the app now with answers
        app = database.addApplicant(storeGroupJid, applicantJid, {
          team: teamKey,
          answers,
        });
      }

      if (!app) {
        return extra.reply(`❌ ERROR\n\nCouldn't save your application ${pick(SLANG.error)}`);
      }

      // DM the application to ALL group admins of the team
      let adminMsg = null;
      if (teamGroupJid) {
        try {
          const notice = buildAdminNotice({
            ...app,
            team: teamKey,
            answers,
            jid: applicantJid,
            appUid: app.appUid,
          });

          const members = await sock.groupMetadata(teamGroupJid).catch(() => null);
          const admins = (members && members.participants
            ? members.participants.filter(p => p.admin).map(p => p.id)
            : []);

          if (admins.length > 0) {
            let dmed = 0;
            for (const adminJid of admins) {
              try {
                await sock.sendMessage(adminJid, { text: notice });
                dmed++;
              } catch (e) {
                console.error(`[CREW APPLIED] admin DM failed ${adminJid}:`, e.message);
              }
            }
            adminMsg = dmed > 0;
          } else {
            // No admins resolvable — post in the team group as fallback
            await sock.sendMessage(teamGroupJid, { text: notice });
            adminMsg = true;
          }
        } catch (e) {
          console.error('[CREW APPLIED] admin notify failed:', e.message);
          adminMsg = false;
        }
      }

      // Confirm to the applicant
      const confirm = `✅ *APPLICATION SUBMITTED*\n\n` +
        `🏢 Team: *${teamKey}* — ${TEAMS[teamKey].label}\n` +
        `🆔 *Application ID:* ${app.appUid}\n\n` +
        (adminMsg === false
          ? `⚠️ _Couldn't notify the team admins automatically — but your application is stored._\n\n`
          : `📲 _Your application has been sent to all ${teamKey} admins ${pick(SLANG.good)}_\n\n`) +
        `⏳ Keep this App ID — an admin will accept or reject you with it.\n\n` +
        `_${pick(SLANG.greeting)}, good luck!_`;

      return sock.sendMessage(extra.from, {
        text: confirm,
        mentions: [applicantJid],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew applied error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't submit the application`);
    }
  },
};