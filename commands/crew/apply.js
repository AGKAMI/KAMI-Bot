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
const { resolveUser } = require('./crewHelpers');
const { buildComparableIds } = require('../../utils/jidHelper');
const { sendButtons, onButton } = require('../../utils/buttonHelper');
const { startWizard } = require('./applyInteractive');

module.exports = {
  subName: 'apply',
  name: null,
  aliases: ['tryout'],
  category: 'crew',
  description: 'Start a crew application (bot DMs you or the applicant the form)',
  usage: '.crew apply <team> [@mention|number]',
  groupOnly: false,
  ownerOnly: false,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      if (!args || args.length === 0) {
        return extra.reply(
          `❌ ERROR\n\nProvide a team\n\n` +
          `Usage:\n` +
          `• \`${prefix}crew apply <team>\` — apply for yourself\n` +
          `• \`${prefix}crew apply <team> @user\` — apply for someone\n` +
          `• \`${prefix}crew apply <team> 0833882383\` — apply for someone by number\n\n` +
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

      // Resolve applicant — could be the sender or someone they're applying for
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      const resolved = resolveUser(args.slice(1), mentioned, ctx);

      let applicantJid;
      let applyingForSomeone = false;

      if (resolved.jid) {
        // Applying for someone else
        applicantJid = resolved.jid;
        applyingForSomeone = true;
      } else {
        // Applying for yourself
        const sender = msg.key.participant || msg.key.remoteJid;
        applicantJid = sender.includes('@g.us') ? (msg.key.participant || extra.sender) : sender;
      }

      const applicantNum = applicantJid.split('@')[0];
      const teamGroupJid = config.crewTeams[teamKey].jid;

      // --- Already in the crew DB for this team? ---
      if (database.getCrewMember(teamGroupJid, applicantJid)) {
        return extra.reply(
          applyingForSomeone
            ? `❌ ERROR\n\n@${applicantNum} is already part of ${TEAMS[teamKey].label} ${pick(SLANG.vibe)}`
            : `❌ ERROR\n\nYou're already part of ${TEAMS[teamKey].label} ${pick(SLANG.vibe)}`
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
              applyingForSomeone
                ? `❌ ERROR\n\n@${applicantNum} is already in the ${teamKey} group 🤨\nWhy apply for a group they're already in?`
                : `❌ ERROR\n\nYou're already in the ${teamKey} group 🤨\nWhy apply for a group you're already in?`
            );
          }
        }
      } catch (e) {}

      // --- Duplicate pending application? ---
      const existingApps = database.getApplicants(teamGroupJid);
      const applicantVariants = buildComparableIds(applicantJid);
      const dup = Object.values(existingApps).find(a =>
        a.status === 'pending' && buildComparableIds(a.jid).some(v => applicantVariants.includes(v))
      );
      if (dup) {
        // If the existing app has no answers (DM failure / never got the form),
        // allow them to re-apply — remove the broken one first
        if (!dup.answers) {
          database.removeApplicant(teamGroupJid, dup.appUid);
          console.log(`[CREW APPLY] Replacing broken pending app ${dup.appUid} for ${applicantNum}`);
        } else {
          return extra.reply(
            applyingForSomeone
              ? `❌ ERROR\n\n@${applicantNum} already has a pending ${teamKey} application ${pick(SLANG.vibe)}\nApp ID: *${dup.appUid}*\n\nWait for review or hit an admin`
              : `❌ ERROR\n\nYou already have a pending ${teamKey} application ${pick(SLANG.vibe)}\nApp ID: *${dup.appUid}*\n\nWait for review or hit an admin`
          );
        }
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

      // DM the applicant: App ID + choice of Typing vs Buttons
      try {
        await sock.sendMessage(applicantJid, {
          text:
            `━━━━━━━━━━━━━━━━\n` +
            `*${TEAMS[teamKey].label.toUpperCase()} APPLICATION*\n` +
            `${TEAMS[teamKey].emoji} ${TEAMS[teamKey].role.toUpperCase()} ${TEAMS[teamKey].emoji}\n` +
            `━━━━━━━━━━━━━━━━\n\n` +
            `🆔 *YOUR APPLICATION ID:* ${app.appUid}\n\n` +
            `How would you like to answer the questions?`,
        });
        // Send the choice buttons
        await sendButtons(sock, applicantJid, {
          text: `Pick how you want to apply:`,
          footer: `${teamKey} Application`,
          buttons: [
            { id: `cwiz:choice:btn:${teamKey}:${app.appUid}`, text: '🔘 Use Buttons' },
            { id: `cwiz:choice:txt:${teamKey}:${app.appUid}`, text: '✍️ Type Answers' },
          ],
        });
      } catch (dmErr) {
        console.error('[CREW APPLY] form DM failed:', dmErr.message);
        // Remove the app so applicant isn't stuck in a dead state
        database.removeApplicant(teamGroupJid, app.appUid);
        return extra.reply(
          applyingForSomeone
            ? `❌ ERROR\n\nCouldn't DM @${applicantNum} the application form ${pick(SLANG.error)}\nCheck if they have DMs open from this bot\n\n_The application was not created — they need to open their DMs first._`
            : `❌ ERROR\n\nCouldn't DM you the application form ${pick(SLANG.error)}\nCheck if you have DMs open from this bot\n\n_The application was not created — open your DMs and try again._`
        );
      }

      // Confirm where they applied from
      const confirmText =
        `✅ *APPLICATION STARTED*\n\n` +
        `🏢 Team: *${teamKey}* — ${TEAMS[teamKey].label}\n` +
        `🆔 *App ID:* ${app.appUid}\n\n` +
        (applyingForSomeone
          ? `📲 I've DM'd @${applicantNum} the application form.\n\n`
          : `📲 I've DM'd you the application form.\n\n`) +
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

// ── Choice Button Handler ────────────────────────────────────
// When applicant taps "Use Buttons" or "Type Answers" in the DM
onButton('cwiz:choice:', async (sock, msg, from, sender, btnId) => {
  const parts = btnId.replace('cwiz:choice:', '').split(':');
  const choice = parts[0]; // 'btn' or 'txt'
  const teamKey = parts[1];
  const appUid = parts[2];

  if (choice === 'btn') {
    // Start the interactive wizard
    await sock.sendMessage(from, {
      text: `🔘 *BUTTON MODE*\n\nAnswer each question by tapping a button. Let's go!`,
    });
    await startWizard(sock, from, teamKey, appUid, from, false, from);
  } else {
    // Send the text form
    const { buildFormMessage } = require('./crewForms');
    const prefix = config.prefix || '.';
    const formText = buildFormMessage(teamKey);
    await sock.sendMessage(from, {
      text:
        `━━━━━━━━━━━━━━━━\n` +
        `*TYPE MODE*\n` +
        `━━━━━━━━━━━━━━━━\n\n` +
        formText,
    });
    await sock.sendMessage(from, {
      text: `✍️ *HOW TO SUBMIT:*\n\nGo to any SS group and send:\n\`${prefix}crew applied ${teamKey} <your answers>\`\n\nPut each answer on its own line.`,
    });
  }
});