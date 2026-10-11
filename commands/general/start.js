/**
 * Start Command — onboarding entry point (like Telegram /start).
 * Works in DMs + groups. Shows welcome + 3 buttons:
 *   Menu, Apply for Security Team, Make Order
 *
 * Apply flow: shows team cards -> confirmation -> DM application form.
 * Already-accepted teams are hidden from the team card list.
 */

const path = require('path');
const fs = require('fs');
const config = require('../../config');
const database = require('../../database');
const { pick, SLANG, mention, voice } = require('../../utils/format');
const { normalizeJidWithLid, buildComparableIds, updateBlockStatusSafe } = require('../../utils/jidHelper');
const { sendButtons, onButton } = require('../../utils/buttonHelper');
const { TEAMS } = require('../crew/crewForms');
const { createApplication } = require('../crew/applyHelper');
const { sendMainMenu: sendOrderMenu } = require('./order');

// Team display order
const TEAM_ORDER = ['KSSMP', 'KSSPS', 'SSRS', 'KSSMS'];

// Team theme emojis
const TEAM_EMOJI = {
  SSRS:  '\u{1F7E2}\u{1F535}\u{1F7E1}',
  KSSPS: '\u{26AB}\u{1F534}\u{26AA}',
  KSSMP: '\u{1F535}\u{26AA}\u{1FA75}',
  KSSMS: '\u{26AB}\u{26AA}\u{1F534}',
};

// Fallback image
const BOT_IMAGE = path.join(__dirname, '../../utils/bot_image.jpg');

function getTeamImage(teamKey) {
  const imgPath = config.crewTeams?.[teamKey]?.image;
  if (imgPath) {
    // Resolve relative to project root (config stores ./utils/...)
    const resolved = path.resolve(imgPath);
    if (fs.existsSync(resolved)) return resolved;
    if (fs.existsSync(imgPath)) return imgPath;
  }
  return BOT_IMAGE;
}

function buildTeamCaption(teamKey) {
  const team = config.crewTeams[teamKey];
  const meta = TEAMS[teamKey];
  let text = `${TEAM_EMOJI[teamKey]} *${team.name.toUpperCase()}*\n`;
  text += `----------\n`;
  text += `\u{1F6E1}\uFE0F *Role:* ${meta.role}\n`;
  if (team.description) text += `\u{1F4CB} *Info:* ${team.description}\n`;
  if (team.cars) text += `\u{1F697} *Cars:* ${team.cars}`;
  return text;
}

// Do two jids point at the same human? Covers PN vs LID (and unknown
// mappings where both sides fall back to their own form)
function jidsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const av = buildComparableIds(a);
  const bv = buildComparableIds(b);
  return av.some(v => bv.includes(v));
}

// Every team the applicant is already tied to:
//   rosterTeams  — on the crew DB roster (member keys may be PN *or* LID jids,
//                  so both sides get variant-expanded before comparing)
//   pendingTeams — pending application(s), could be more than one team
//   groupTeams   — sitting in the team's WhatsApp group but missing from the
//                  roster (added manually) — createApplication would reject
//                  them there anyway, so don't tease them with the card
async function getTakenTeams(sock, applicantJid) {
  const rosterTeams = new Set();
  const pendingTeams = new Set();
  const groupTeams = new Set();
  if (!applicantJid) return { rosterTeams, pendingTeams, groupTeams };

  for (const [key, team] of Object.entries(config.crewTeams || {})) {
    if (key === 'SSGENERAL') continue;

    // Roster check
    const members = database.getCrewMembers(team.jid) || {};
    for (const memberJid of Object.keys(members)) {
      if (jidsMatch(memberJid, applicantJid)) { rosterTeams.add(key); break; }
    }

    // Pending application check
    const apps = database.getApplicants(team.jid) || {};
    for (const app of Object.values(apps)) {
      if (app.status === 'pending' && jidsMatch(app.jid, applicantJid)) {
        pendingTeams.add(key);
        break;
      }
    }

    // WhatsApp group membership check
    try {
      const meta = sock ? await sock.groupMetadata(team.jid) : null;
      if (meta?.participants?.some(p => jidsMatch(p.id, applicantJid) || jidsMatch(p.lid, applicantJid))) {
        groupTeams.add(key);
      }
    } catch (e) { /* bot not in that group / network blip — skip the check */ }
  }

  return { rosterTeams, pendingTeams, groupTeams };
}

// Teams the applicant can still apply for, in card order
async function getAvailableTeams(sock, applicantJid) {
  const { rosterTeams, pendingTeams, groupTeams } = await getTakenTeams(sock, applicantJid);
  const available = TEAM_ORDER.filter(k =>
    !rosterTeams.has(k) && !pendingTeams.has(k) && !groupTeams.has(k));
  return { available, rosterTeams, pendingTeams, groupTeams };
}

// Send the team cards (filtered by the user's existing membership)
async function sendTeamCards(sock, from, applicantJid) {
  const { available, rosterTeams, pendingTeams, groupTeams } = await getAvailableTeams(sock, applicantJid);

  if (available.length === 0) {
    const inTeam = [...rosterTeams][0] || [...groupTeams][0];
    let why;
    if (rosterTeams.size) {
      why = `You're already part of *${config.crewTeams[inTeam].name}*\n\n` +
            `Just hit up an admin if you want to move teams.`;
    } else if (pendingTeams.size) {
      why = `You've already got an application waiting.\n\nLet it get reviewed, or chat to an admin.`;
    } else {
      why = `You're already chilling in the team groups.\n\nChat to an admin if you want to move teams.`;
    }
    await sock.sendMessage(from, {
      text: `\u{1F4CB} *SECURITY TEAMS*\n\n${why}`,
    });
    return;
  }

  for (const teamKey of available) {
    const imgPath = getTeamImage(teamKey);
    const team = config.crewTeams[teamKey];
    const meta = TEAMS[teamKey];
    const emoji = TEAM_EMOJI[teamKey];

    const caption =
      `${emoji} *${team.name}*\n` +
      `${meta.role}\n` +
      (team.description ? `${team.description}\n` : '') +
      (team.cars ? `\u{1F697} ${team.cars}` : '');

    // Send image with join button — caption on image, short text on buttons
    const joinBtn = { id: `start:join:${teamKey}`, text: `${emoji} Join ${teamKey} \u2014 ${team.name}` };
    if (fs.existsSync(imgPath)) {
      const imageBuffer = fs.readFileSync(imgPath);
      await sendButtons(sock, from, {
        text: caption,
        buttonText: `\u{1F4AC} _Tap below to apply_`,
        footer: config.botName || 'KAMI Bot',
        buttons: [joinBtn],
        image: imageBuffer,
      });
    } else {
      await sendButtons(sock, from, {
        text: caption,
        footer: config.botName || 'KAMI Bot',
        buttons: [joinBtn],
      });
    }
  }
}

// Convert sender JID (may be LID) to a proper DM JID
function toDmJid(sender) {
  const resolved = normalizeJidWithLid(sender);
  // normalizeJidWithLid returns full JID like 27840820712@s.whatsapp.net
  // If it returned a hosted JID, strip to phone + @s.whatsapp.net
  const phone = resolved.split(':')[0].split('@')[0];
  return phone + '@s.whatsapp.net';
}

// Send confirmation message
async function sendConfirmation(sock, from, teamKey) {
  const team = config.crewTeams[teamKey];
  const meta = TEAMS[teamKey];
  const emoji = TEAM_EMOJI[teamKey];

  const text =
    `${emoji} *${team.name.toUpperCase()}*\n` +
    `----------\n\n` +
    `\u{1F6E1}\uFE0F *Role:* ${meta.role}\n` +
    (team.cars ? `\u{1F697} *Cars:* ${team.cars}\n\n` : '\n') +
    `_Apply for ${team.name}?_`;

  await sendButtons(sock, from, {
    text,
    footer: config.botName || 'KAMI Bot',
    buttons: [
      { id: `start:confirm:${teamKey}`, text: '\u2705 Yes, Apply' },
      { id: 'start:back', text: '\u21A9\uFE0F Not Sure / Go Back' },
    ],
  });
}

// The unblock notice sent to the applicant's DM BEFORE the team cards
async function sendApplyDmNotice(sock, dmJid) {
  await sendButtons(sock, dmJid, {
    text:
      `🔓 *UNBLOCKED — FOR NOW*\n\n` +
      `I've let you through to apply for security ${voice.tag('neutral')}\n\n` +
      `⚠️ *Until your application is done, your number can only:*\n` +
      `• Apply for security\n` +
      `• Make orders\n\n` +
      `DM me for anything else and you're blocked again`,
    footer: config.botName || 'KAMI Bot',
  });
}

// ============================================================
// COMMAND
// ============================================================

module.exports = {
  name: 'start',
  reactions: { received: '🚀', done: '🎬' },
  aliases: [],
  category: 'general',
  description: 'Start here — apply for a security team, check the commands',
  usage: '.start',

  async execute(sock, msg, args, extra) {
    try {
      const applicantJid = extra.sender;

      // Welcome text
      const summary =
        `\u{1F916} *KAMI BOT*\n` +
        `----------\n\n` +
        `Aweh — welcome to the Slammed Society, ${voice.mate()}\n\n` +
        `Hit a button to get going \u2B05\uFE0F`;

      await sendButtons(sock, extra.from, {
        text: summary,
        footer: config.botName || 'KAMI Bot',
        buttons: [
          { id: 'start:menu', text: '\u{1F4CB} Menu' },
          { id: 'start:apply', text: '\u{1F4CB} Apply for Security Team' },
          { id: 'start:order', text: '\u{1F6D2} Make Order' },
        ],
      }, msg);

    } catch (error) {
      console.error('[START] Error:', error);
      extra.fail();
      await extra.reply(`\u274C _${voice.openErr()} - ${error.message}_`);
    }
  },
};

// ============================================================
// BUTTON HANDLERS
// ============================================================

// Menu -> show the menu
onButton('start:menu', async (sock, msg, from) => {
  const prefix = config.prefix || '.';
  // Build and send the menu text (button mode version)
  const summary =
    `\u{1F916} *KAMI BOT*\n` +
    `----------\n\n` +
    `\u{1F44B} Hit a button for that section \u2B05\uFE0F\n\n` +
    `_Full list: ${prefix}menu all_`;

  await sendButtons(sock, from, {
    text: summary,
    footer: config.botName || 'KAMI Bot',
    header: 'KAMI BOT',
    buttons: [
      { id: 'menu:admin',   text: '\u{1F4CB} Admin' },
      { id: 'menu:crew',    text: '\u{1F6E1}\uFE0F Crew' },
      { id: 'menu:general', text: '\u{1F3E0} General' },
      { id: 'menu:ai',      text: '\u{1F916} AI' },
      { id: 'menu:media',   text: '\u{1F3AC} Media' },
      { id: 'menu:fun',     text: '\u{1F389} Fun' },
      { id: 'menu:games',   text: '\u{1F3AE} Games' },
      { id: 'menu:utility', text: '\u{1F527} Utility' },
      { id: 'menu:owner',   text: '\u{1F451} Owner' },
      { id: 'menu:more',    text: '\u{1F4C2} More' },
    ],
  });
});

// Apply -> send team cards via DM (not in group)
onButton('start:apply', async (sock, msg, from, sender) => {
  const isGroup = from.endsWith('@g.us');
  
  if (isGroup) {
    // In group: tell user to check DMs (no @mention needed — bot is sending TO them)
    await sock.sendMessage(from, {
      text: `💬 _DM'd you the form, ${voice.mate()} — check your DMs hey_`,
    });
  }
  
  // Unblock so DMs land + mark them temp-allowed (orders/apply only)
  const dmJid = toDmJid(sender);
  try { await updateBlockStatusSafe(sock, dmJid, 'unblock'); } catch (e) {}
  const { allowTempDm } = require('../../handler');
  allowTempDm(dmJid);
  allowTempDm(sender);

  // The unblock message — BEFORE the team cards
  await sendApplyDmNotice(sock, dmJid);

  console.log('[APPLY BTN] sender:', sender, '→ dmJid:', dmJid);
  await sendTeamCards(sock, dmJid, sender);
});

// Make Order -> send order menu to DM
onButton('start:order', async (sock, msg, from, sender) => {
  const isGroup = from.endsWith('@g.us');
  if (isGroup) {
    await sock.sendMessage(from, {
      text: `💬 _DM'd you the catalog, ${voice.mate()} — go have a look hey_`,
    });
  }
  const dmJid = toDmJid(sender);
  // Unblock so DMs land + mark them temp-allowed (orders/apply only)
  try { await updateBlockStatusSafe(sock, dmJid, 'unblock'); } catch (e) {}
  const { allowTempDm } = require('../../handler');
  allowTempDm(dmJid);
  allowTempDm(sender);

  // The unblock message — BEFORE the order menu
  await sendButtons(sock, dmJid, {
    text:
      `🔓 *UNBLOCKED — FOR NOW*\n\n` +
      `I've let you through so you can browse the catalog and make your order ${voice.tag('neutral')}\n\n` +
      `⚠️ *Until your order is done, your number can only:*\n` +
      `• Make orders\n` +
      `• Apply for security\n\n` +
      `DM me for anything else and you're blocked again`,
    footer: config.botName || 'KAMI Bot',
  });

  await sendOrderMenu(sock, dmJid, msg);
});

// Join a team -> send confirmation
onButton('start:join:', async (sock, msg, from, sender, btnId) => {
  const teamKey = btnId.replace('start:join:', '');
  if (!config.crewTeams[teamKey]) return;
  const isGroup = from.endsWith('@g.us');
  
  if (isGroup) {
    await sock.sendMessage(from, {
      text: `\u{1F4AC} _check your DMs for the confirmation._`,
    });
  }
  
  // Send confirmation to DM
  const dmJid = toDmJid(sender);
  console.log('[JOIN BTN] sender:', sender, '→ dmJid:', dmJid);
  await sendConfirmation(sock, dmJid, teamKey);
});

// Confirm -> create application + DM wizard
onButton('start:confirm:', async (sock, msg, from, sender, btnId) => {
  const teamKey = btnId.replace('start:confirm:', '');
  if (!config.crewTeams[teamKey]) return;

  const result = await createApplication(sock, sender, teamKey, {
    replyFn: (text) => sock.sendMessage(from, { text }),
    from,
    applyingForSomeone: false,
  });

  if (result.ok) {
    await sock.sendMessage(from, {
      text:
        `\u2705 *APPLICATION STARTED*\n\n` +
        `\u{1F6E1}\uFE0F *Team:* ${teamKey} \u2014 ${config.crewTeams[teamKey].name}\n` +
        `\u{1F4CB} *App ID:* ${result.app.appUid}\n\n` +
        `\u{1F4AC} I dropped the form in your DMs.\n\n` +
        `_${voice.greetOpen()}, good luck!_`,
    });
  }
});

// Back -> re-show team cards (via DM)
onButton('start:back', async (sock, msg, from, sender) => {
  const dmJid = toDmJid(sender);
  await sendTeamCards(sock, dmJid, sender);
});

// Shared with .apply (owner can push the team selection to someone's DMs)
module.exports.sendTeamCards = sendTeamCards;
module.exports.toDmJid = toDmJid;
module.exports.sendApplyDmNotice = sendApplyDmNotice;
module.exports.getAvailableTeams = getAvailableTeams;
module.exports.getTakenTeams = getTakenTeams;
