/**
 * Crew Apply Command — start a crew application.
 * Flow: .crew apply <team> (any SS group or DM)
 * → bot DMs the applicant the application form + assigns a UID.
 * Applicant then posts answers via .crew applied <team> <answers>.
 * Works from any Slammed Society group or a DM.
 */

const database = require('../../database');
const config = require('../../config');
const { pick, SLANG, mention } = require('../../utils/format');
const { TEAMS, buildFormMessage } = require('./crewForms');
const { resolveUser } = require('./crewHelpers');
const { buildComparableIds } = require('../../utils/jidHelper');
const { sendButtons, onButton } = require('../../utils/buttonHelper');
const { startWizard } = require('./applyInteractive');
const { createApplication } = require('./applyHelper');

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

      const teamGroupJid = config.crewTeams[teamKey].jid;

      // Use shared application logic
      const result = await createApplication(sock, applicantJid, teamKey, {
        replyFn: (text) => extra.reply(text),
        from: extra.from,
        applyingForSomeone,
      });

      if (!result.ok) return;

      // Confirm where they applied from
      const confirmText =
        `✅ *APPLICATION STARTED*\n\n` +
        `🏢 Team: *${teamKey}* — ${TEAMS[teamKey].label}\n` +
        `🆔 *App ID:* ${result.app.appUid}\n\n` +
        (applyingForSomeone
          ? `📲 I've DM'd ${mention(applicantJid)} the application form.\n\n`
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
    // Send the text form + submission instructions in one message
    const { buildFormMessage } = require('./crewForms');
    const prefix = config.prefix || '.';
    const formText = buildFormMessage(teamKey);
    await sock.sendMessage(from, {
      text:
        `━━━━━━━━━━━━━━━━\n` +
        `*TYPE MODE*\n` +
        `━━━━━━━━━━━━━━━━\n\n` +
        formText + `\n\n` +
        `━━━━━━━━━━━━━━━━\n\n` +
        `✍️ *HOW TO SUBMIT:*\n\nGo to any SS group and send:\n\`${prefix}crew applied ${teamKey} <your answers>\`\n\nPut each answer on its own line.`,
    });
  }
});