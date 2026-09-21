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
  if (imgPath && fs.existsSync(imgPath)) return imgPath;
  return BOT_IMAGE;
}

function buildTeamCaption(teamKey) {
  const team = config.crewTeams[teamKey];
  const meta = TEAMS[teamKey];
  return (
    `${TEAM_EMOJI[teamKey]} *${team.name}*\n` +
    `${meta.role}\n` +
    (team.cars ? `🚗 ${team.cars}` : '')
  );
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

  // Build one rich text message with all team info + buttons
  let summary = `🛡️ *SLAMMED SOCIETY SECURITY TEAMS*\n\n`;
  for (const teamKey of available) {
    const team = config.crewTeams[teamKey];
    const meta = TEAMS[teamKey];
    const emoji = TEAM_EMOJI[teamKey];
    summary += `${emoji} *${team.name}*\n${meta.role}`;
    if (team.cars) summary += ` • 🚗 ${team.cars}`;
    summary += `\n${team.description || ''}\n\n`;
  }

  const teamButtons = available.slice(0, 3).map(teamKey => ({
    id: `start:join:${teamKey}`,
    text: `${TEAM_EMOJI[teamKey]} Join ${teamKey}`,
  }));

  await sendButtons(sock, from, {
    text: summary + (available.length > 3
      ? `_Type ${config.prefix || '.'}teaminfo <team> for the 4th team_`
      : ''),
    footer: config.botName || 'KAMI Bot',
    buttons: teamButtons,
  });

  // Send images separately (WhatsApp limitation — no images in button messages)
  for (const teamKey of available) {
    const imgPath = getTeamImage(teamKey);
    if (fs.existsSync(imgPath)) {
      const imageBuffer = fs.readFileSync(imgPath);
      await sock.sendMessage(from, {
        image: imageBuffer,
        caption: `${TEAM_EMOJI[teamKey]} *${config.crewTeams[teamKey].name}*`,
      });
    }
  }
}

// ── Send confirmation message ──
async function sendConfirmation(sock, from, teamKey) {
  const team = config.crewTeams[teamKey];
  const meta = TEAMS[teamKey];
  const emoji = TEAM_EMOJI[teamKey];

  const text =
    `${emoji} *Are you sure you want to apply for ${team.name}?*\n\n` +
    `${meta.role}\n` +
    (team.cars ? `🚗 ${team.cars}` : '');

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
        `*KAMI BOT* ${pick(SLANG.greeting)}! 👋\n\n` +
        `Welcome to the Slammed Society.\n` +
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
    `*KAMI BOT* ${pick(SLANG.greeting)}! 👋\n\n` +
    `🤖 Tap a button to see that section's commands 👇\n\n` +
    `📖 Full list: *${prefix}menu all*`;

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
        `🏢 Team: *${teamKey}* — ${config.crewTeams[teamKey].name}\n` +
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
