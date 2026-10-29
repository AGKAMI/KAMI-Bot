/**
 * Crew Apply Command â€” start a crew application.
 * Owner shortcut: .apply <reply|@mention|number> (no team) â€” DMs that person
 * the team selection, exactly like .start â†’ "Apply for Security Team".
 * Normal flow: .apply <team> [reply|@mention|number] (any SS group or DM)
 * â†’ bot DMs the applicant the application form + assigns a UID.
 * â†’ auto-starts the interactive button wizard.
 * Works from any Slammed Society group or a DM.
 */

const database = require('../../database');
const config = require('../../config');
const { pick, SLANG, mention, voice } = require('../../utils/format');
const { TEAMS } = require('./crewForms');
const { resolveUser, phoneToJid } = require('./crewHelpers');
const { sendButtons, onButton, isOwnerJid, adminOnlyText } = require('../../utils/buttonHelper');
const { createApplication } = require('./applyHelper');
const { getTeamDisplayName } = require('../../utils/teamName');

module.exports = {
  subName: 'apply',
  name: 'apply',
  aliases: ['tryout'],
  category: 'crew',
  description: "Start a crew application â€” or (owner) DM someone the team selection",
  usage: '.apply <team> [@mention|number]  Â·  owner: .apply <reply|@mention|number>',
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

      // No team arg â†’ owner can push the team selection to someone's DMs
      // (reply, @mention or number), from anywhere.
      if (!hasTeam) {
        const target = resolveUser(args || [], mentioned, ctx);
        // A reply to the BOT's own message resolves to the bot â€” never
        // target ourselves (sending cards to our own jid blows up).
        // A typed PHONE that resolves to the bot gets a real answer instead.
        if (target.jid && isSelfJid(sock, target.jid)) {
          if (target.method === 'phone') {
            return extra.reply(`❌ ERROR\n\nThat's this bot's own number â€” can't invite it, hey`);
          }
          target.jid = null;
        }

        if (target.jid) {
          if (extra.isOwner) return sendTeamSelection(sock, msg, extra, target);
          extra.deny && extra.deny('team selection is owner-only');
          return extra.reply(
            `❌ ERROR\n\nProvide a team â€” only KAMI can drop the team selection on its own\n\n` +
            `Usage:\n` +
            `â€¢ \`${prefix}apply <team> @user\` â€” apply for someone\n` +
            `â€¢ \`${prefix}crew apply <team>\` â€” apply for yourself\n\n` +
            `Teams: ${Object.keys(TEAMS).join(', ')}`
          );
        }

        // Fallback: the number arrived mangled (iOS linkifies phone numbers
        // and the tokens can split/mention weirdly) â€” dig a phone-shaped
        // sequence out of the RAW TEXT directly.
        const rawText = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '');
        const phoneInText = rawText.match(/(?:\+?2[27]\s?\d{2}(?:\s?\d{3,4}){2}|\d{9,12})/);
        if (phoneInText) {
          const jid = phoneToJid(phoneInText[0]);
          if (jid && !isSelfJid(sock, jid)) {
            if (extra.isOwner) {
              return sendTeamSelection(sock, msg, extra, { jid, args: [], method: 'phone-fallback' });
            }
          }
        }

        // Nothing to target â€” bare `.apply` (reply is picked up above)
        if (!first) return extra.reply(applyUsage(prefix));

        if (target.error === 'invalid_phone') {
          return extra.reply(
            `❌ ERROR\n\nThat number doesn't look valid hey\n\n` +
            `Tip: any format works â€” \`${prefix}apply 083 388 2383\``
          );
        }

        return extra.reply(applyUsage(prefix));
      }

      // Team given â†’ normal application flow (self, reply, mention or number)
      const resolved = resolveUser(args.slice(1), mentioned, ctx);
      // Same guard: a reply to the bot's own message targets nobody â€” fall
      // through to self-apply instead of sending the form to ourselves. A
      // typed PHONE that resolves to the bot gets a real answer instead.
      if (resolved.jid && isSelfJid(sock, resolved.jid)) {
        if (resolved.method === 'phone') {
          return extra.reply(`❌ ERROR\n\nThat's this bot's own number â€” can't apply for it, hey`);
        }
        resolved.jid = null;
      }

      // A target was clearly attempted (leftover digits or junk tokens) but
      // couldn't be resolved â€” NEVER silently fall back to SELF-apply.
      // That's what produced "You're already in â€¦ ne" about the SENDER when
      // KAMI ran `!crew apply <team> <number>` with a junk-laden paste.
      if (!resolved.jid) {
        if (resolved.error === 'invalid_phone') {
          return extra.reply(
            `❌ ERROR\n\nThat number doesn't look valid hey\n\n` +
            `Tip: any format works â€” \`${prefix}apply ${first} 082 123 4567\``
          );
        }
        const leftover = (resolved.args || []).join(' ');
        if (/\d{6,}/.test(leftover)) {
          console.log('[APPLY] unresolved phone target:', JSON.stringify(resolved.args));
          return extra.reply(
            `❌ ERROR\n\nCouldn't read that number hey â€” try typing it clean\n\n` +
            `Any format works: \`${prefix}apply ${first} +27 82 123 4567\``
          );
        }
        if (leftover.trim()) {
          console.log('[APPLY] unresolved target tokens:', JSON.stringify(resolved.args));
          return extra.reply(
            `❌ ERROR\n\nCouldn't read that as a person, hey\n\n` +
            `Use @mention, a reply, or a number â€” or just \`${prefix}apply ${first}\` to do it yourself`
          );
        }
      }

      // Target was explicitly given but couldn't be resolved — never fall
      // through to self-apply. That's what produced "You're already in … ne"
      // about the SENDER when KAMI ran !crew apply <team> <number> with
      // a junk-laden phone number.
      if (!resolved.jid) {
        return extra.reply(
          `❌ ERROR\n\nCouldn't work out who you meant to apply for.\n\n` +
          `Use \`${prefix}apply <team> @user\`, \`${prefix}apply <team> <number>\`, ` +
          `or just \`${prefix}apply <team>\` to apply yourself.`
        );
      }

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

      // Failure already replied an error via replyFn â€” mark the verdict ❌
      // (the reply classifier catches it too, but be explicit).
      if (!result.ok) return extra.fail(result.error);

      // Confirm where they applied from
      const confirmText =
        `âœ… *APPLICATION STARTED*\n\n` +
        `ðŸ¢ Team: *${getTeamDisplayName(teamKey)}*\n` +
        `ðŸ†” *App ID:* ${result.app.appUid}\n\n` +
        (applyingForSomeone
          ? `ðŸ“² Dropped the form in ${mention(applicantJid)}'s DMs.\n\n`
          : `ðŸ“² Dropped the form in your DMs.\n\n`) +
        `_${voice.greetOpen()}, good luck!_`;

      try {
        await sock.sendMessage(extra.from, {
          text: confirmText,
          mentions: [applicantJid],
        }, { quoted: msg });
      } catch (reportErr) {
        // App already created + form DM delivered â€” don't claim total
        // failure, but don't end on âœ… either.
        console.error('[CREW APPLY] confirm send failed:', reportErr.message);
        extra.fail && extra.fail('confirm send failed');
      }

    } catch (error) {
      console.error('Crew apply error:', error);
      extra.fail && extra.fail(error.message || error);
      await extra.reply(`❌ ERROR\n\n${voice.openErr()} â€” couldn't kick it off, shame (${error.message || 'unknown'})`);
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
    `â€¢ \`${prefix}apply <team>\` â€” apply for yourself\n` +
    `â€¢ \`${prefix}apply <team> @user\` â€” apply for someone\n` +
    `â€¢ \`${prefix}apply <team> 082 123 4567\` â€” apply by number\n` +
    `â€¢ \`${prefix}apply @user\` / reply / number â€” *(owner)* send them the team selection\n\n` +
    `Teams: ${Object.keys(TEAMS).join(', ')}`
  );
}

// Owner: push the team selection to someone's DMs from anywhere â€” same flow
// as .start â†’ "Apply for Security Team" (unblock notice â†’ team cards).
// Their pick runs the normal start:join â†’ start:confirm â†’ form wizard.
async function sendTeamSelection(sock, msg, extra, resolved) {
  const { sendTeamCards, toDmJid, sendApplyDmNotice, getAvailableTeams } = require('../general/start');
  const { allowTempDm } = require('../../handler');
  const { updateBlockStatusSafe } = require('../../utils/jidHelper');
  const prefix = config.prefix || '.';

  const targetJid = resolved.jid;

  let dmJid;
  try {
    dmJid = toDmJid(targetJid);
  } catch (e) {
    console.error('[APPLY-INVITE] toDmJid failed:', e.message);
    extra.fail && extra.fail(e.message);
    return sock.sendMessage(extra.from, {
      text: `❌ ERROR\n\nCouldn't work out ${mention(targetJid)}'s DM number â€” ${e.message}\n\n` +
            `_Check the number and try again, shame_`,
      mentions: [targetJid],
    }, { quoted: msg });
  }

  // Check the team DB + group rosters FIRST â€” if there's nothing left for
  // them to apply for, don't unblock them or drop a confusing "UNBLOCKED"
  // notice in their DMs. Tell the owner what's what instead.
  const { available, rosterTeams, pendingTeams, groupTeams } = await getAvailableTeams(sock, targetJid);
  if (available.length === 0) {
    const teamList = (set) => [...set].map(k => getTeamDisplayName(k)).join(', ');
    let why;
    if (rosterTeams.size) {
      why = `They're already in *${teamList(rosterTeams)}*`;
    } else if (pendingTeams.size) {
      why = `They've already got applications waiting: *${teamList(pendingTeams)}*`;
    } else {
      why = `They're already sitting in all the team groups`;
    }
    console.log('[APPLY-INVITE] no teams available for', targetJid, 'â€” nothing sent');
    return sock.sendMessage(extra.from, {
      text:
        `ðŸš« *NOTHING TO APPLY FOR*\n\n` +
        `${why}, hey â€” no team cards dropped ${voice.tag('neutral')}\n\n` +
        `ðŸ’¡ To move them to a different team, remove them from the current one first\n` +
        `(\`${prefix}crew remove\` in that team's group)`,
      mentions: [targetJid],
    }, { quoted: msg });
  }

  // Unblock so DMs land + mark them temp-allowed (orders/apply only).
  // Never swallow a failed unblock â€” the owner must see why the cards
  // may not land, and the temp-allow alone can't free a blocked number.
  let unblockErr = '';
  try { await updateBlockStatusSafe(sock, dmJid, 'unblock'); }
  catch (e) {
    unblockErr = e.message || 'unknown error';
    console.error('[APPLY-INVITE] unblock failed for', dmJid, 'â€”', unblockErr);
  }
  try { allowTempDm(dmJid); allowTempDm(targetJid); } catch (e) {}

  console.log('[APPLY-INVITE]', extra.sender, 'â†’', targetJid, `(${resolved.method}) dm=${dmJid}`);

  // Unblock notice FIRST, then the team cards â€” identical to .start flow.
  // Either send can fail (blocked bot, unreachable number, privacy settings) â€”
  // report the real cause with a ❌ verdict instead of the generic
  // "couldn't kick it off".
  try {
    await sendApplyDmNotice(sock, dmJid);
    await sendTeamCards(sock, dmJid, dmJid);
  } catch (dmErr) {
    console.error('[APPLY-INVITE] DM chain failed:', dmErr.message);
    extra.fail && extra.fail(dmErr.message);
    return sock.sendMessage(extra.from, {
      text: `❌ ERROR\n\nCouldn't DM ${mention(targetJid)} the team cards â€” ${dmErr.message}\n\n` +
            `Likely one of:\n` +
            `â€¢ They blocked the bot\n` +
            `â€¢ Privacy settings are stopping DMs\n` +
            `â€¢ The number isn't on WhatsApp\n\n` +
            `ðŸ’¡ *Try:*\n` +
            `â€¢ Get them to \`${prefix}start\` first\n` +
            `â€¢ Re-check the number (spaces/plus are fine)\n` +
            `â€¢ Or \`${prefix}apply <team> @user\` so they kick it off themselves`,
      mentions: [targetJid],
    }, { quoted: msg });
  }

  // Heads-up for the owner when the target is already tied to some teams â€”
  // those cards were deliberately left out of the DM drop
  const noteBits = [];
  if (rosterTeams.size) noteBits.push(`in *${[...rosterTeams].map(k => getTeamDisplayName(k)).join(', ')}*`);
  if (pendingTeams.size) noteBits.push(`pending for *${[...pendingTeams].map(k => getTeamDisplayName(k)).join(', ')}*`);
  if (groupTeams.size) {
    const extraTeams = [...groupTeams].filter(k => !rosterTeams.has(k) && !pendingTeams.has(k));
    if (extraTeams.length) noteBits.push(`in the *${extraTeams.map(k => getTeamDisplayName(k)).join(', ')}* group(s)`);
  }
  const skipNote = noteBits.length
    ? `\n\nâš ï¸ _Heads up: they're already ${noteBits.join(' and ')} â€” those cards were left out_`
    : '';

  try {
    await sock.sendMessage(extra.from, {
      text:
        `ðŸ“¤ *TEAM SELECTION SENT*\n\n` +
        `ðŸ“² Dropped the team cards in ${mention(targetJid)}'s DMs â€” they pick a team and the form starts ${voice.tag('neutral')}\n\n` +
        `_Picked up by: ${resolved.method}_${skipNote}` +
        (unblockErr
          ? `\n\nâš ï¸ *WhatsApp unblock failed:* ${unblockErr}\n_They may still be blocked â€” the cards may not reach them_`
          : ''),
      mentions: [targetJid],
    }, { quoted: msg });
  } catch (reportErr) {
    // Cards went out â€” just the report-back failed.
    console.error('[APPLY-INVITE] report-back failed:', reportErr.message);
    extra.fail && extra.fail(reportErr.message);
  }
}

// â”€â”€ Button Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Migrated from applied.js â€” accept/deny/cancel/pending for admin review

onButton('crew:accept', async (sock, msg, from, sender, btnId) => {
  const uid = btnId.replace('crew:accept:', '');
  if (!uid) return;
  const acceptCmd = require('./accept');
  // Same canonical owner check as the deny handler below â€” the old
  // sender.includes(n) could never match an international jid
  const senderIsOwner = isOwnerJid(msg, sender);
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
    const action = processed.action === 'accepted' ? 'âœ… accepted' : '❌ denied';
    await sock.sendMessage(from, {
      text: `âš ï¸ *${uid}* was already ${action} by an admin.\n\nNothing to do here.`,
    }, { quoted: msg });
    return;
  }

  // Same gate as crew:accept â€” the review card can sit in a group where
  // non-admins see the buttons; unauthorized taps get warned, not prompted.
  let authorized = isOwnerJid(msg, sender) || database.isTeamAdmin(sender);
  if (!authorized && app) {
    const teamGroupJid = config.crewTeams[app.team]?.jid || app.groupJid;
    if (teamGroupJid) {
      try {
        const meta = await sock.groupMetadata(teamGroupJid).catch(() => null);
        const { findParticipant } = require('../../utils/jidHelper');
        const part = meta && findParticipant(meta.participants || [], [sender]);
        authorized = !!(part && part.admin);
      } catch (e) { /* no metadata â€” stays unauthorized */ }
    }
  }
  if (!authorized) {
    return sock.sendMessage(from, {
      text: adminOnlyText(),
      mentions: [sender],
    }, { quoted: msg });
  }

  await sock.sendMessage(from, {
    text: `❌ *Deny Application*\n\nDrop a reason for denying *${uid}*\n\`${p}crew deny ${uid} <reason>\``,
  }, { quoted: msg });
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
