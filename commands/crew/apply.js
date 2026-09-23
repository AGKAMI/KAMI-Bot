/**
 * Crew Apply Command — start a crew application.
 * Flow: .crew apply <team> (any SS group or DM)
 * → bot DMs the applicant the application form + assigns a UID.
 * → auto-starts the interactive button wizard.
 * Works from any Slammed Society group or a DM.
 */

const database = require('../../database');
const config = require('../../config');
const { pick, SLANG, mention } = require('../../utils/format');
const { TEAMS } = require('./crewForms');
const { resolveUser } = require('./crewHelpers');
const { sendButtons, onButton } = require('../../utils/buttonHelper');
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

// ── Button Handlers ──────────────────────────────────────────
// Migrated from applied.js — accept/deny/cancel/pending for admin review

onButton('crew:accept', async (sock, msg, from, sender, btnId) => {
  const uid = btnId.replace('crew:accept:', '');
  if (!uid) return;
  const acceptCmd = require('./accept');
  const senderIsOwner = (config.ownerNumber || []).some(n => sender.includes(n));
  await acceptCmd.execute(sock, msg, [uid], {
    from, sender,
    isGroup: false,
    isOwner: senderIsOwner,
    reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
  });
});

onButton('crew:deny', async (sock, msg, from, sender, btnId) => {
  const uid = btnId.replace('crew:deny:', '');
  if (!uid) return;
  const p = config.prefix || '.';
  const { getApplicantByUid, getProcessedApp } = require('../../database');
  const app = getApplicantByUid(uid);
  const processed = getProcessedApp(uid);
  if (!app && processed) {
    const action = processed.action === 'accepted' ? '✅ accepted' : '❌ denied';
    await sock.sendMessage(from, {
      text: `⚠️ Application *${uid}* was already ${action} by an admin.\n\nNothing to do.`,
    });
    return;
  }
  await sock.sendMessage(from, {
    text: `❌ *Deny Application*\n\nType a reason to deny *${uid}*:\n\`${p}crew deny ${uid} <reason>\``,
  });
});

onButton('crew:cancel', async (sock, msg, from, sender, btnId) => {
  const parts = btnId.replace('crew:cancel:', '').split(':');
  const teamKey = parts[0];
  const uid = parts[1];
  if (!uid) return;
  const withdrawCmd = require('./withdraw');
  await withdrawCmd.execute(sock, msg, [uid], {
    from, sender,
    isGroup: false,
    isOwner: false,
    reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
  });
});

onButton('crew:pending', async (sock, msg, from, sender, btnId) => {
  const team = btnId.replace('crew:pending:', '');
  if (!team) return;
  const applicantsCmd = require('./applicants');
  await applicantsCmd.execute(sock, msg, [team], {
    from, sender,
    isGroup: from.endsWith('@g.us'),
    isOwner: false,
    reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
  });
});