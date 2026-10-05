/**
 * Crew Apply Command — start a crew application.
 * Owner shortcut: .apply <reply|@mention|number> (no team) — DMs that person
 * the team selection, exactly like .start → "Apply for Security Team".
 * Normal flow: .apply <team> [reply|@mention|number] (any SS group or DM)
 * → bot DMs the applicant the application form + assigns a UID.
 * → auto-starts the interactive button wizard.
 * Works from any Slammed Society group or a DM.
 */

const database = require('../../database');
const config = require('../../config');
const { pick, SLANG, mention, voice } = require('../../utils/format');
const { TEAMS } = require('./crewForms');
const { resolveUser } = require('./crewHelpers');
const { sendButtons, onButton } = require('../../utils/buttonHelper');
const { createApplication } = require('./applyHelper');
const { getTeamDisplayName } = require('../../utils/teamName');

module.exports = {
  subName: 'apply',
  name: 'apply',
  aliases: ['tryout'],
  category: 'crew',
  description: "Start a crew application — or (owner) DM someone the team selection",
  usage: '.apply <team> [@mention|number]  ·  owner: .apply <reply|@mention|number>',
  groupOnly: false,
  ownerOnly: false,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      const first = (args && args[0]) || '';
      const teamKey = first.toUpperCase();
      const hasTeam = !!(first && TEAMS[teamKey] && config.crewTeams[teamKey]);

      // No team arg → owner can push the team selection to someone's DMs
      // (reply, @mention or number in any format), from anywhere.
      if (!hasTeam) {
        const target = resolveUser(args || [], mentioned, ctx);

        if (target.jid) {
          if (extra.isOwner) return sendTeamSelection(sock, msg, extra, target);
          return extra.reply(
            `❌ ERROR\n\nProvide a team — only KAMI can drop the team selection on its own\n\n` +
            `Usage:\n` +
            `• \`${prefix}apply <team> @user\` — apply for someone\n` +
            `• \`${prefix}crew apply <team>\` — apply for yourself\n\n` +
            `Teams: ${Object.keys(TEAMS).join(', ')}`
          );
        }

        // Nothing to target — bare `.apply` (reply is picked up above)
        if (!first) return extra.reply(applyUsage(prefix));

        if (target.error === 'invalid_phone') {
          return extra.reply(
            `❌ ERROR\n\nThat number doesn't look valid hey\n\n` +
            `Tip: any format works — \`${prefix}apply 083 388 2383\``
          );
        }

        return extra.reply(applyUsage(prefix));
      }

      // Team given → normal application flow (self, reply, mention or number)
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
        `🏢 Team: *${getTeamDisplayName(teamKey)}*\n` +
        `🆔 *App ID:* ${result.app.appUid}\n\n` +
        (applyingForSomeone
          ? `📲 Dropped the form in ${mention(applicantJid)}'s DMs.\n\n`
          : `📲 Dropped the form in your DMs.\n\n`) +
        `_${voice.greetOpen()}, good luck!_`;

      await sock.sendMessage(extra.from, {
        text: confirmText,
        mentions: [applicantJid],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew apply error:', error);
      await extra.reply(`❌ ERROR\n\n${voice.openErr()} — couldn't kick it off, shame`);
    }
  },
};

function applyUsage(prefix) {
  return (
    `❌ ERROR\n\nProvide a team or a target\n\n` +
    `Usage:\n` +
    `• \`${prefix}apply <team>\` — apply for yourself\n` +
    `• \`${prefix}apply <team> @user\` — apply for someone\n` +
    `• \`${prefix}apply <team> 0833882383\` — apply by number\n` +
    `• \`${prefix}apply @user\` / reply / number — *(owner)* send them the team selection\n\n` +
    `Teams: ${Object.keys(TEAMS).join(', ')}`
  );
}

// Owner: push the team selection to someone's DMs from anywhere — same flow
// as .start → "Apply for Security Team" (unblock notice → team cards).
// Their pick runs the normal start:join → start:confirm → form wizard.
async function sendTeamSelection(sock, msg, extra, resolved) {
  const { sendTeamCards, toDmJid, sendApplyDmNotice } = require('../general/start');
  const { allowTempDm } = require('../../handler');

  const targetJid = resolved.jid;
  const dmJid = toDmJid(targetJid);

  // Unblock so DMs land + mark them temp-allowed (orders/apply only)
  try { await sock.updateBlockStatus(dmJid, 'unblock'); } catch (e) {}
  try { allowTempDm(dmJid); allowTempDm(targetJid); } catch (e) {}

  console.log('[APPLY-INVITE]', extra.sender, '→', targetJid, `(${resolved.method}) dm=${dmJid}`);

  // Unblock notice FIRST, then the team cards — identical to .start flow
  await sendApplyDmNotice(sock, dmJid);
  await sendTeamCards(sock, dmJid, dmJid);

  await sock.sendMessage(extra.from, {
    text:
      `📤 *TEAM SELECTION SENT*\n\n` +
      `📲 Dropped the team cards in ${mention(targetJid)}'s DMs — they pick a team and the form starts ${voice.tag('neutral')}\n\n` +
      `_Picked up by: ${resolved.method}_`,
    mentions: [targetJid],
  }, { quoted: msg });
}

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
    fail: () => {}
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
      text: `⚠️ *${uid}* was already ${action} by an admin.\n\nNothing to do here.`,
    });
    return;
  }
  await sock.sendMessage(from, {
    text: `❌ *Deny Application*\n\nDrop a reason for denying *${uid}*\n\`${p}crew deny ${uid} <reason>\``,
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
    fail: () => {}
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
    fail: () => {}
  });
});