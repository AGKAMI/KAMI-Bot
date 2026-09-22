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
const { pick, SLANG, mention } = require('../../utils/format');
const { normalizeJidWithLid } = require('../../utils/jidHelper');
const { sendButtons, onButton } = require('../../utils/buttonHelper');
const { TEAMS } = require('../crew/crewForms');
const { createApplication, getUserTeam, getUserPendingTeam } = require('../crew/applyHelper');
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

// Send the 4 team cards (filtered by user's existing membership)
async function sendTeamCards(sock, from, applicantJid) {
  const userTeam = getUserTeam(applicantJid);
  const pendingTeam = getUserPendingTeam(applicantJid);

  const available = TEAM_ORDER.filter(k => k !== userTeam && k !== pendingTeam);

  if (available.length === 0) {
    await sock.sendMessage(from, {
      text:
        `\u{1F4CB} *SECURITY TEAMS*\n\n` +
        (userTeam
          ? `You're already part of *${config.crewTeams[userTeam].name}*\n\n` +
            `Contact an admin if you want to switch teams.`
          : `You already have a pending application.\n\nWait for review or contact an admin.`),
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

    // Send image with join button in ONE message (iPhone needs this)
    const joinBtn = { id: `start:join:${teamKey}`, text: `${emoji} Join ${teamKey} \u2014 ${team.name}` };
    if (fs.existsSync(imgPath)) {
      const imageBuffer = fs.readFileSync(imgPath);
      await sendButtons(sock, from, {
        text: caption,
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

// ============================================================
// COMMAND
// ============================================================

module.exports = {
  name: 'start',
  aliases: [],
  category: 'general',
  description: 'Start menu - apply for security teams, view commands',
  usage: '.start',

  async execute(sock, msg, args, extra) {
    try {
      const applicantJid = extra.sender;

      // Welcome text
      const summary =
        `\u{1F916} *KAMI BOT*\n` +
        `----------\n\n` +
        `Welcome to the Slammed Society, ${pick(SLANG.greeting)}\n\n` +
        `Tap a button to get started \u2B05\uFE0F`;

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
      await extra.reply(`\u274C _${pick(SLANG.error)} - ${error.message}_`);
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
    `\u{1F44B} Tap a button to see that section's commands \u2B05\uFE0F\n\n` +
    `_Full list: ${prefix}menu all_`;

  await sendButtons(sock, from, {
    text: summary,
    footer: config.botName || 'KAMI Bot',
    header: 'KAMI BOT',
    buttons: [
      { id: 'menu:admin', text: '\u{1F4CB} Admin' },
      { id: 'menu:crew',  text: '\u{1F6E1}\uFE0F Crew' },
      { id: 'menu:more1', text: '\u2795 More' },
    ],
  });
});

// Apply -> send team cards via DM (not in group)
onButton('start:apply', async (sock, msg, from, sender) => {
  const isGroup = from.endsWith('@g.us');
  
  if (isGroup) {
    // In group: tell user to check DMs (no @mention needed — bot is sending TO them)
    await sock.sendMessage(from, {
      text: `\u{1F4AC} _check your DMs for the application form._`,
    });
  }
  
  // Send team cards to user's DM
  const dmJid = toDmJid(sender);
  console.log('[APPLY BTN] sender:', sender, '→ dmJid:', dmJid);
  await sendTeamCards(sock, dmJid, sender);
});

// Make Order -> send order menu to DM
onButton('start:order', async (sock, msg, from, sender) => {
  const isGroup = from.endsWith('@g.us');
  if (isGroup) {
    await sock.sendMessage(from, {
      text: `\u{1F4AC} _check your DMs to browse the catalog._`,
    });
  }
  const dmJid = toDmJid(sender);
  // Unblock so DMs land (same as crew application)
  try { await sock.updateBlockStatus(dmJid, 'unblock'); } catch (e) {}
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
        `\u{1F4AC} I've DM'd you the application form.\n\n` +
        `_${pick(SLANG.greeting)}, good luck!_`,
    });
  }
});

// Back -> re-show team cards (via DM)
onButton('start:back', async (sock, msg, from, sender) => {
  const dmJid = toDmJid(sender);
  await sendTeamCards(sock, dmJid, sender);
});
