/**
 * Team Info Command — shows detailed info about a specific team.
 * Usage: !teaminfo <team> or !teaminfo (no args shows all teams as a list)
 */

const path = require('path');
const fs = require('fs');
const config = require('../../config');
const { pick, SLANG, mention } = require('../../utils/format');
const { TEAMS } = require('../crew/crewForms');
const { sendButtons, onButton } = require('../../utils/buttonHelper');
const { getUserTeam, getUserPendingTeam } = require('../crew/applyHelper');

const TEAM_IMAGES_DIR = path.join(__dirname, '../../utils/team_images');
const BOT_IMAGE = path.join(__dirname, '../../utils/bot_image.jpg');

const TEAM_EMOJI = {
  SSRS:  '🟢🔵🟡',
  KSSPS: '⚫🔴⚪',
  KSSMP: '🔵⚪🩵',
  KSSMS: '⚫⚪🔴',
};

const TEAM_ORDER = ['KSSMP', 'KSSPS', 'SSRS', 'KSSMS'];

function getTeamImage(teamKey) {
  const imgPath = config.crewTeams?.[teamKey]?.image;
  if (imgPath && fs.existsSync(imgPath)) return imgPath;
  const localPath = path.join(TEAM_IMAGES_DIR, `${teamKey.toLowerCase()}.jpg`);
  if (fs.existsSync(localPath)) return localPath;
  return BOT_IMAGE;
}

function buildTeamText(teamKey, opts = {}) {
  const { showApplyButton = true } = opts;
  const team = config.crewTeams[teamKey];
  const meta = TEAMS[teamKey];
  if (!team || !meta) return null;

  const emoji = TEAM_EMOJI[teamKey] || '';
  const ranks = team.ranks || meta.ranks || [];
  const prefix = config.prefix || '.';

  let text =
    `━━━━━━━━━━━━━━━━\n` +
    `${emoji} *${team.name.toUpperCase()}*\n` +
    `${meta.role}\n` +
    `━━━━━━━━━━━━━━━━\n\n`;

  if (team.description) {
    text += `${team.description}\n\n`;
  }

  if (team.cars) {
    text += `🚗 *Team Cars:* ${team.cars}\n\n`;
  }

  if (ranks.length > 0) {
    text += `🔰 *RANKS (lowest → highest):*\n`;
    ranks.forEach((r, i) => {
      text += `  ${i + 1}. ${r.charAt(0).toUpperCase() + r.slice(1)}\n`;
    });
    text += `\n`;
  }

  text += `_Type ${prefix}teaminfo <team> for details — or tap Apply below_`;

  return text;
}

module.exports = {
  name: 'teaminfo',
  aliases: ['team', 'teams'],
  category: 'general',
  description: 'View team details and apply',
  usage: '.teaminfo <team> or .teaminfo (all teams)',

  async execute(sock, msg, args, extra) {
    try {
      const teamKey = (args[0] || '').toUpperCase();

      // No args → show all teams as a summary
      if (!teamKey) {
        const applicantJid = extra.sender;
        const userTeam = getUserTeam(applicantJid);
        const pendingTeam = getUserPendingTeam(applicantJid);

        let summary = `🛡️ *SLAMMED SOCIETY SECURITY TEAMS*\n\n`;

        for (const key of TEAM_ORDER) {
          const team = config.crewTeams[key];
          const meta = TEAMS[key];
          const emoji = TEAM_EMOJI[key];
          let status = '';
          if (userTeam === key) status = ' ✅ *YOU*';
          else if (pendingTeam === key) status = ' ⏳ *PENDING*';
          summary += `${emoji} *${team.name}* — ${meta.role}${status}\n`;
        }

        summary += `\n_Type ${config.prefix || '.'}teaminfo <team> for details_`;

        await extra.reply(summary);
        return;
      }

      // Specific team
      if (!config.crewTeams[teamKey] || !TEAMS[teamKey]) {
        return extra.reply(
          `❌ ERROR\n\nInvalid team\n\n` +
          `Teams: ${TEAM_ORDER.join(', ')}`
        );
      }

      const text = buildTeamText(teamKey);
      const imgPath = getTeamImage(teamKey);

      const applicantJid = extra.sender;
      const userTeam = getUserTeam(applicantJid);
      const pendingTeam = getUserPendingTeam(applicantJid);
      const canApply = userTeam !== teamKey && pendingTeam !== teamKey;

      // Send image if available
      if (fs.existsSync(imgPath)) {
        const imageBuffer = fs.readFileSync(imgPath);
        await sock.sendMessage(extra.from, {
          image: imageBuffer,
          caption: text,
          mentions: [applicantJid],
        }, { quoted: msg });
        // Small delay to avoid rate limiter (2s cooldown between button messages)
        await new Promise(r => setTimeout(r, 2500));
      }

      // Send buttons (apply or status)
      const buttons = [];
      if (canApply) {
        buttons.push({
          id: `start:join:${teamKey}`,
          text: `${TEAM_EMOJI[teamKey]} Apply for ${teamKey}`,
        });
      } else if (userTeam === teamKey) {
        buttons.push({
          id: `start:team:you`,
          text: `✅ You're in ${teamKey}`,
        });
      } else if (pendingTeam === teamKey) {
        buttons.push({
          id: `start:team:pending`,
          text: `⏳ Application pending`,
        });
      }

      await sendButtons(sock, extra.from, {
        text: fs.existsSync(imgPath) ? '' : text,
        footer: config.botName || 'KAMI Bot',
        buttons,
      }, msg);

    } catch (error) {
      console.error('[TEAMINFO] Error:', error);
      await extra.reply(`❌ _${pick(SLANG.error)} — ${error.message}_`);
    }
  },
};

// Button handlers
onButton('start:team:', async (sock, msg, from, sender, btnId) => {
  if (btnId === 'start:team:you') {
    await sock.sendMessage(from, {
      text: `✅ You're already part of this team!`,
    });
  } else if (btnId === 'start:team:pending') {
    await sock.sendMessage(from, {
      text: `⏳ Your application is pending review. Contact an admin for updates.`,
    });
  }
});
