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
      // (reply, @mention or number), from anywhere.
      if (!hasTeam) {
        const target = resolveUser(args || [], mentioned, ctx);
        // A reply to the BOT's own message resolves to the bot — never
        // target ourselves (sending cards to our own jid blows up).
        if (target.jid && isSelfJid(sock, target.jid)) target.jid = null;

        if (target.jid) {
          if (extra.isOwner) return sendTeamSelection(sock, msg, extra, target);
          extra.deny && extra.deny('team selection is owner-only');
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
      // Same guard: a reply to the bot's own message targets nobody — fall
      // through to self-apply instead of sending the form to ourselves.
      if (resolved.jid && isSelfJid(sock, resolved.jid)) resolved.jid = null;

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

      // Failure already replied an error via replyFn — mark the verdict ❌
      // (the reply classifier catches it too, but be explicit).
      if (!result.ok) return extra.fail(result.error);

      // Confirm where they applied from
      const confirmText =
        `✅ *APPLICATION STARTED*\n\n` +
        `🏢 Team: *${getTeamDisplayName(teamKey)}*\n` +
        `🆔 *App ID:* ${result.app.appUid}\n\n` +
        (applyingForSomeone
          ? `📲 Dropped the form in ${mention(applicantJid)}'s DMs.\n\n`
          : `📲 Dropped the form in your DMs.\n\n`) +
        `_${voice.greetOpen()}, good luck!_`;

      try {
        await sock.sendMessage(extra.from, {
          text: confirmText,
          mentions: [applicantJid],
        }, { quoted: msg });
      } catch (reportErr) {
        // App already created + form DM delivered — don't claim total
        // failure, but don't end on ✅ either.
        console.error('[CREW APPLY] confirm send failed:', reportErr.message);
        extra.fail && extra.fail('confirm send failed');
      }

    } catch (error) {
      console.error('Crew apply error:', error);
      extra.fail && extra.fail(error.message || error);
      await extra.reply(`❌ ERROR\n\n${voice.openErr()} — couldn't kick it off, shame (${error.message || 'unknown'})`);
    }
  },
};

// Is this jid the bot's own account? (reply-to-bot contexts)
function isSelfJid(sock, jid) {
  try {
    const botNum = (sock.user?.id || '').split(':')[0];
    const jidNum = (jid || '').split('@')[0].split(':')[0];
    return !!(botNum && jidNum && botNum === jidNum);
  } catch (e) {
    return false;
  }
}

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
  const prefix = config.prefix || '.';

  const targetJid = resolved.jid;

  let dmJid;
  try {
    dmJid = toDmJid(targetJid);
  } catch (e) {
    console.error('[APPLY-INVITE] toDmJid failed:', e.message);
    extra.fail && extra.fail(e.message);
    return sock.sendMessage(extra.from, {
      text: `❌ ERROR\n\nCouldn't work out ${mention(targetJid)}'s DM number — ${e.message}\n\n` +
            `_Check the number and try again, shame`,
      mentions: [targetJid],
    }, { quoted: msg });
  }

  // Unblock so DMs land + mark them temp-allowed (orders/apply only)
  try { await sock.updateBlockStatus(dmJid, 'unblock'); } catch (e) {}
  try { allowTempDm(dmJid); allowTempDm(targetJid); } catch (e) {}

  console.log('[APPLY-INVITE]', extra.sender, '→', targetJid, `(${resolved.method}) dm=${dmJid}`);

  // Unblock notice FIRST, then the team cards — identical to .start flow.
  // Either send can fail (blocked bot, unreachable number, privacy settings) —
  // report the real cause with a ❌ verdict instead of the generic
  // "couldn't kick it off".
  try {
    await sendApplyDmNotice(sock, dmJid);
    await sendTeamCards(sock, dmJid, dmJid);
  } catch (dmErr) {
    console.error('[APPLY-INVITE] DM chain failed:', dmErr.message);
    extra.fail && extra.fail(dmErr.message);
    return sock.sendMessage(extra.from, {
      text: `❌ ERROR\n\nCouldn't DM ${mention(targetJid)} the team cards — ${dmErr.message}\n\n` +
            `Likely one of:\n` +
            `• They blocked the bot\n` +
            `• Privacy settings are stopping DMs\n` +
            `• The number isn't on WhatsApp\n\n` +
            `💡 *Try:*\n` +
            `• Get them to \`${prefix}start\` first\n` +
            `• Re-check the number (spaces/plus are fine)\n` +
            `• Or \`${prefix}apply <team> @user\` so they kick it off themselves`,
      mentions: [targetJid],
    }, { quoted: msg });
  }

  try {
    await sock.sendMessage(extra.from, {
      text:
        `📤 *TEAM SELECTION SENT*\n\n` +
        `📲 Dropped the team cards in ${mention(targetJid)}'s DMs — they pick a team and the form starts ${voice.tag('neutral')}\n\n` +
        `_Picked up by: ${resolved.method}_`,
      mentions: [targetJid],
    }, { quoted: msg });
  } catch (reportErr) {
    // Cards went out — just the report-back failed.
    console.error('[APPLY-INVITE] report-back failed:', reportErr.message);
    extra.fail && extra.fail(reportErr.message);
  }
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