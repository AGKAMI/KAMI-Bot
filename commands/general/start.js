/**
 * Start Command — onboarding entry point (like Telegram /start).
 * Works in DMs + groups. Shows welcome + 3 buttons:
 *   Menu, Apply for Security Team, Make Order
 *
 * Apply flow: shows team cards → confirmation → DM application form.
 * Already-accepted teams are hidden from the team card list.
 */

const path = require('path');
const fs = require('fs');
const config = require('../../config');
const { pick, SLANG, mention } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');
const { TEAMS } = require('../crew/crewForms');
const { createApplication, getUserTeam, getUserPendingTeam } = require('../crew/applyHelper');

// Team display order
const TEAM_ORDER = ['KSSMP', 'KSSPS', 'SSRS', 'KSSMS'];

// Team theme emojis
const TEAM_EMOJI = {
  SSRS:  '🟢🔵🟡',
  KSSPS: '⚫🔴⚪',
  KSSMP: '🔵⚪🩵',
  KSSMS: '⚫⚪🔴',
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
  text += `🏢 *Role:* ${meta.role}\n`;
  if (team.description) text += `📝 *Info:* ${team.description}\n`;
  if (team.cars) text += `🚗 *Cars:* ${team.cars}`;
  return text;
}

// ── Send the 4 team cards (filtered by user's existing membership) ──
async function sendTeamCards(sock, from, applicantJid) {
  const userTeam = getUserTeam(applicantJid);
  const pendingTeam = getUserPendingTeam(applicantJid);

  const available = TEAM_ORDER.filter(k => k !== userTeam && k !== pendingTeam);

  if (available.length === 0) {
    await sock.sendMessage(from, {
      text:
        `🛡️ *SECURITY TEAMS*\n\n` +
        (userTeam
          ? `You're already part of *${config.crewTeams[userTeam].name}*\n\n` +
            `Contact an admin if you want to switch teams.`
          : `You already have a pending application.\n\nWait for review or contact an admin.`),
    });
    return;
  }

  // Send all images in parallel (no waiting between them)
  const sendPromises = available.map(async (teamKey) => {
    const imgPath = getTeamImage(teamKey);
    const team = config.crewTeams[teamKey];
    const meta = TEAMS[teamKey];
    const emoji = TEAM_EMOJI[teamKey];

    const caption =
      `${emoji} *${team.name}*\n` +
      `${meta.role}\n` +
      (team.description ? `${team.description}\n` : '') +
      (team.cars ? `🚗 ${team.cars}` : '');

    if (fs.existsSync(imgPath)) {
      const imageBuffer = fs.readFileSync(imgPath);
      await sock.sendMessage(from, {
        image: imageBuffer,
        caption,
        mentions: applicantJid ? [applicantJid] : [],
      });
    } else {
      await sock.sendMessage(from, { text: caption });
    }
  });

  await Promise.all(sendPromises);

  // Short delay then send all buttons (rate limiter needs ~2s between interactive msgs)
  await new Promise(r => setTimeout(r, 1500));

  for (const teamKey of available) {
    const team = config.crewTeams[teamKey];
    const emoji = TEAM_EMOJI[teamKey];

    await sendButtons(sock, from, {
      text: '',
      footer: config.botName || 'KAMI Bot',
      buttons: [
        { id: `start:join:${teamKey}`, text: `${emoji} Join ${teamKey} — ${team.name}` },
      ],
    });

    // Small delay between buttons to avoid rate limiter
    if (available.indexOf(teamKey) < available.length - 1) {
      await new Promise(r => setTimeout(r, 2200));
    }
  }
}

// ── Send confirmation message ──
async function sendConfirmation(sock, from, teamKey) {
  const team = config.crewTeams[teamKey];
  const meta = TEAMS[teamKey];
  const emoji = TEAM_EMOJI[teamKey];

  const text =
    `${emoji} *${team.name.toUpperCase()}*\n` +
    `----------\n\n` +
    `🏢 *Role:* ${meta.role}\n` +
    (team.cars ? `🚗 *Cars:* ${team.cars}\n\n` : '\n') +
    `_Apply for ${team.name}?_`;

  await sendButtons(sock, from, {
    text,
    footer: config.botName || 'KAMI Bot',
    buttons: [
      { id: `start:confirm:${teamKey}`, text: '✅ Yes, Apply' },
      { id: 'start:back', text: '↩️ Not Sure / Go Back' },
    ],
  });
}

// ══════════════════════════════════════════════════════════
// COMMAND
// ══════════════════════════════════════════════════════════

module.exports = {
  name: 'start',
  aliases: [],
  category: 'general',
  description: 'Start menu — apply for security teams, view commands',
  usage: '.start',

  async execute(sock, msg, args, extra) {
    try {
      const applicantJid = extra.sender;

      // Welcome text
      const summary =
        `👋 *KAMI BOT*\n` +
        `----------\n\n` +
        `Welcome to the Slammed Society, ${pick(SLANG.greeting)}\n\n` +
        `Tap a button to get started 👇`;

      // Send bot image + buttons
      if (fs.existsSync(BOT_IMAGE)) {
        const imageBuffer = fs.readFileSync(BOT_IMAGE);
        await sock.sendMessage(extra.from, {
          image: imageBuffer,
          caption: summary,
          mentions: [applicantJid],
        }, { quoted: msg });
      }

      await sendButtons(sock, extra.from, {
        text: fs.existsSync(BOT_IMAGE) ? '' : summary,
        footer: config.botName || 'KAMI Bot',
        header: 'KAMI BOT',
        buttons: [
          { id: 'start:menu', text: '📋 Menu' },
          { id: 'start:apply', text: '🛡️ Apply for Security Team' },
          { id: 'start:order', text: '🛒 Make Order' },
        ],
      }, msg);

    } catch (error) {
      console.error('[START] Error:', error);
      await extra.reply(`❌ _${pick(SLANG.error)} — ${error.message}_`);
    }
  },
};

// ══════════════════════════════════════════════════════════
// BUTTON HANDLERS
// ══════════════════════════════════════════════════════════

// Menu → show the menu
onButton('start:menu', async (sock, msg, from) => {
  const prefix = config.prefix || '.';
  const menuCmd = require('./menu');
  // Build and send the menu text (button mode version)
  const summary =
    `👋 *KAMI BOT*\n` +
    `----------\n\n` +
    `🤖 Tap a button to see that section's commands 👇\n\n` +
    `_Full list: ${prefix}menu all_`;

  await sendButtons(sock, from, {
    text: summary,
    footer: config.botName || 'KAMI Bot',
    header: 'KAMI BOT',
    buttons: [
      { id: 'menu:admin', text: '🛡️ Admin' },
      { id: 'menu:crew',  text: '🔰 Crew' },
      { id: 'menu:more1', text: '📂 More' },
    ],
  });
});

// Apply → show team cards
onButton('start:apply', async (sock, msg, from, sender) => {
  await sendTeamCards(sock, from, sender);
});

// Make Order → placeholder
onButton('start:order', async (sock, msg, from) => {
  await sock.sendMessage(from, {
    text: `🛒 *MAKE ORDER*\n\n_Coming soon — business catalog will be available here._`,
  });
});

// Join a team → send confirmation
onButton('start:join:', async (sock, msg, from, sender, btnId) => {
  const teamKey = btnId.replace('start:join:', '');
  if (!config.crewTeams[teamKey]) return;
  await sendConfirmation(sock, from, teamKey);
});

// Confirm → create application + DM wizard
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
        `✅ *APPLICATION STARTED*\n\n` +
        `🏷️ *Team:* ${teamKey} — ${config.crewTeams[teamKey].name}\n` +
        `🆔 *App ID:* ${result.app.appUid}\n\n` +
        `📲 I've DM'd you the application form.\n\n` +
        `_${pick(SLANG.greeting)}, good luck!_`,
      mentions: [sender],
    });
  }
});

// Back → re-show team cards
onButton('start:back', async (sock, msg, from, sender) => {
  await sendTeamCards(sock, from, sender);
});
