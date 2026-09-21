/**
 * Crew Applied Command — submit answers for an existing application.
 * Flow: .crew apply <team> (bot DMs form + App ID)
 *   → .crew applied <team> <answers> (attaches answers, DMs the team's group admins)
 * Also unblocks team admins so they can receive the application notice.
 */

const database = require('../../database');
const config = require('../../config');
const { pick, SLANG } = require('../../utils/format');
const { TEAMS, buildAdminNotice, formatAnswers } = require('./crewForms');
const { buildComparableIds } = require('../../utils/jidHelper');
const { sendButtons } = require('../../utils/buttonHelper');

module.exports = {
  subName: 'applied',
  name: null,
  description: 'Submit your application answers',
  usage: '.crew applied <team> <answers>',
  groupOnly: false,
  ownerOnly: false,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      if (!args || args.length < 2) {
        return extra.reply(
          `❌ ERROR\n\n` +
          `Usage: ${prefix}crew applied <team> <your answers>\n\n` +
          `Teams: ${Object.keys(TEAMS).join(', ')}\n\n` +
          `You can put each answer on its own line — just keep it in ONE message`
        );
      }

      const teamKey = args[0].toUpperCase();
      if (!TEAMS[teamKey]) {
        return extra.reply(
          `❌ ERROR\n\n` +
          `Invalid team ${pick(SLANG.error)}\n\n` +
          `Teams: ${Object.keys(TEAMS).join(', ')}`
        );
      }

      // Extract the raw message text so we can preserve line breaks in the answers
      const rawText = msg.message?.extendedTextMessage?.text ||
                      msg.message?.conversation ||
                      '';
      // Use dynamic prefix instead of hardcoded dot
      const prefixPattern = config.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = rawText.match(new RegExp('^' + prefixPattern + '?\\s*crew\\s+applied\\s+\\S+\\s*([\\s\\S]*)$', 'i'));
      let answers = (match ? match[1] : args.slice(1).join('\n')).trim();

      // Fallback: strip leading command tokens from raw if regex missed (custom prefix)
      if (!answers) {
        answers = args.slice(1).join('\n').trim();
      }

      if (!answers) {
        return extra.reply(
          `❌ ERROR\n\n` +
          `No answers provided ${pick(SLANG.vibe)}\n` +
          `Re-run with your full answers`
        );
      }

      // Normalize answer formatting — handles all numbering styles
      answers = formatAnswers(answers);

      const sender = msg.key.participant || msg.key.remoteJid;
      const applicantJid = sender.includes('@g.us') ? (msg.key.participant || extra.sender) : sender;

      // Use resolveTeamWithConfig to get the team's group JID
      const resolved = database.resolveTeamWithConfig(teamKey);
      const crewTeam = config.crewTeams[teamKey];
      const teamGroupJid = (resolved && resolved.jid) || (crewTeam ? crewTeam.jid : null);
      const storeGroupJid = teamGroupJid || extra.from;

      // Find this applicant's pending app for this team
      let app = null;
      const applicants = database.getApplicants(storeGroupJid);
      const applicantVariants = buildComparableIds(applicantJid);
      const existing = Object.values(applicants).find(a =>
        a.status === 'pending' && buildComparableIds(a.jid).some(v => applicantVariants.includes(v))
      );

      if (existing) {
        // Attach answers to the existing app (created by .crew apply)
        const team = database.getTeam(storeGroupJid);
        team.applicants[existing.appUid].answers = answers;
        database.updateTeam(storeGroupJid, team);
        app = team.applicants[existing.appUid];
      } else {
        // No pending app for this team — figure out exactly why

        // 1. Check if they have a processed app (accepted/denied/expired/cancelled)
        const allTeams = config.crewTeams || {};
        for (const [tk, ti] of Object.entries(allTeams)) {
          const crewData = database.getTeam(ti.jid);
          if (crewData.processedApps) {
            for (const [uid, proc] of Object.entries(crewData.processedApps)) {
              const procVariants = buildComparableIds(proc.applicantJid);
              if (procVariants.some(v => applicantVariants.includes(v)) && proc.team === teamKey) {
                if (proc.action === 'accepted') {
                  return extra.reply(
                    `❌ ERROR\n\nYou were already *accepted* into *${teamKey}* ${pick(SLANG.vibe)}\n` +
                    `You're part of the crew now.`
                  );
                } else if (proc.action === 'denied') {
                  return extra.reply(
                    `❌ ERROR\n\nYour *${teamKey}* application was *denied* ${pick(SLANG.vibe)}\n\n` +
                    `🔄 You can reapply: \`${prefix}crew apply ${teamKey}\``
                  );
                } else if (proc.action === 'expired') {
                  return extra.reply(
                    `❌ ERROR\n\nYour *${teamKey}* application *expired* (no review within 7 days)\n\n` +
                    `🔄 You can reapply: \`${prefix}crew apply ${teamKey}\``
                  );
                } else if (proc.action === 'cancelled') {
                  return extra.reply(
                    `❌ ERROR\n\nYour *${teamKey}* application was *cancelled* by an admin\n\n` +
                    `🔄 You can reapply: \`${prefix}crew apply ${teamKey}\``
                  );
                } else if (proc.action === 'withdrawn') {
                  return extra.reply(
                    `❌ ERROR\n\nYou *withdrew* your *${teamKey}* application\n\n` +
                    `🔄 You can reapply: \`${prefix}crew apply ${teamKey}\``
                  );
                }
              }
            }
          }
        }

        // 2. Check if they have a pending app for a DIFFERENT team
        for (const [tk, ti] of Object.entries(allTeams)) {
          if (tk === teamKey) continue;
          const apps = database.getApplicants(ti.jid);
          for (const [, a] of Object.entries(apps)) {
            if (a.status === 'pending') {
              const appVariants = buildComparableIds(a.jid);
              if (appVariants.some(v => applicantVariants.includes(v))) {
                return extra.reply(
                  `❌ ERROR\n\nYou don't have a pending *${teamKey}* application, but you DO have one for *${tk}* ${pick(SLANG.vibe)}\n\n` +
                  `Submit answers for ${tk}: \`${prefix}crew applied ${tk} <answers>\`\n` +
                  `Or apply for ${teamKey}: \`${prefix}crew apply ${teamKey}\``
                );
              }
            }
          }
        }

        // 3. No app found anywhere — tell them to start one
        return extra.reply(
          `❌ ERROR\n\nYou don't have a pending *${teamKey}* application ${pick(SLANG.vibe)}\n\n` +
          `Start one with: \`${prefix}crew apply ${teamKey}\`\n` +
          `You'll get the application form + your App ID`
        );
      }

      if (!app) {
        return extra.reply(
          `❌ ERROR\n\n` +
          `Couldn't save your application ${pick(SLANG.error)}`
        );
      }

      // DM the application to ALL group admins of the team
      // Note: team admins are already exempt from DM blocker — no unblocking needed
      let adminMsg = null;
      if (teamGroupJid) {
        try {
          const { text: noticeText, buttons: noticeButtons } = buildAdminNotice({
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
                await sendButtons(sock, adminJid, {
                  text: noticeText,
                  footer: `${teamKey} Applications`,
                  buttons: noticeButtons,
                });
                dmed++;
              } catch (e) {
                console.error(`[CREW APPLIED] admin DM failed ${adminJid}:`, e.message);
              }
            }
            adminMsg = dmed > 0;
          } else {
            // No admins resolvable — post in the team group as fallback
            await sendButtons(sock, teamGroupJid, {
              text: noticeText,
              footer: `${teamKey} Applications`,
              buttons: noticeButtons,
            });
            adminMsg = true;
          }
        } catch (e) {
          console.error('[CREW APPLIED] admin notify failed:', e.message);
          adminMsg = false;
        }
      }

      // Confirm to the applicant
      const confirm =
        `✅ APPLICATION SUBMITTED\n\n` +
        `🏢 Team: *${teamKey}* — ${TEAMS[teamKey].label}\n` +
        `🆔 Application ID: *${app.appUid}*\n\n` +
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
      await extra.reply(
        `❌ ERROR\n\n` +
        `${pick(SLANG.error)} — couldn't submit the application`
      );
    }
  },
};

// ── Button Handlers ──────────────────────────────────────────
// Registered when this module loads. Handles taps on accept/deny/pending buttons
// sent in the admin application notice.
const { onButton } = require('../../utils/buttonHelper');
const prefix = config.prefix || '.';

onButton('crew:accept', async (sock, msg, from, sender, btnId) => {
  const uid = btnId.replace('crew:accept:', '');
  if (!uid) return;
  await sock.sendMessage(from, {
    text: `✅ *ACCEPT APPLICATION*\n\nApp ID: *${uid}*\n\nType:\n\`${prefix}crew accept ${uid}\`\n\nOr add a role:\n\`${prefix}crew accept ${uid} member\``,
  });
});

onButton('crew:deny', async (sock, msg, from, sender, btnId) => {
  const uid = btnId.replace('crew:deny:', '');
  if (!uid) return;
  await sock.sendMessage(from, {
    text: `❌ *DENY APPLICATION*\n\nApp ID: *${uid}*\n\nType:\n\`${prefix}crew deny ${uid} <reason>\`\n\nExample:\n\`${prefix}crew deny ${uid} Not active enough\``,
  });
});

onButton('crew:pending', async (sock, msg, from, sender, btnId) => {
  const team = btnId.replace('crew:pending:', '');
  if (!team) return;
  await sock.sendMessage(from, {
    text: `📋 *PENDING APPLICATIONS*\n\nType:\n\`${prefix}crew applicants ${team}\``,
  });
});
