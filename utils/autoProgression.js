/**
 * Auto Progression Engine
 * Automatically promotes crew members based on activity thresholds.
 * Runs on a timer — no human intervention needed.
 *
 * Thresholds:
 *   - member → officer: 100 messages + 14 days active
 *   - officer → co-leader: 300 messages + 30 days active
 *   - co-leader → leader: 500 messages + 60 days active
 *
 * Configurable via PROGRESSION_RULES below.
 */

const database = require('../database');
const config = require('../config');

// ── Progression Rules ─────────────────────────────────────
// Each rule: { from, to, minMessages, minDaysActive }
// Checked in order — first matching rule wins
const PROGRESSION_RULES = [
  { from: 'member',    to: 'officer',    minMessages: 100, minDaysActive: 14 },
  { from: 'officer',   to: 'co-leader',  minMessages: 300, minDaysActive: 30 },
  { from: 'co-leader', to: 'leader',     minMessages: 500, minDaysActive: 60 },
];

// How often to run (in ms) — default every hour
const CHECK_INTERVAL = 60 * 60 * 1000;

// Cooldown per member — don't re-check same member within this window
const MEMBER_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours

// Track last check time per member to avoid spam
const lastCheck = new Map();

/**
 * Check one group for eligible promotions
 * Returns array of { memberJid, from, to, activity } for each auto-promotion
 */
const checkGroup = async (sock, groupJid, teamKey) => {
  const promotions = [];
  const allActivity = database.getGroupMemberActivity(groupJid);
  const roles = database.getCustomRoles(groupJid);

  for (const [memberJid, data] of Object.entries(allActivity)) {
    // Skip if cooldown active
    const cooldownKey = `${groupJid}:${memberJid}`;
    const lastCheckTime = lastCheck.get(cooldownKey) || 0;
    if (Date.now() - lastCheckTime < MEMBER_COOLDOWN) continue;

    // Find applicable rule
    const currentRoleIndex = roles.indexOf(data.role);
    const rule = PROGRESSION_RULES.find(r => r.from === data.role);

    if (!rule) continue; // No rule for this role (e.g., already leader)
    if (data.role !== rule.from) continue;

    // Check thresholds
    if (data.totalMessages >= rule.minMessages && data.daysActive >= rule.minDaysActive) {
      // Verify role exists in hierarchy
      const newRoleIndex = roles.indexOf(rule.to);
      if (newRoleIndex === -1) continue;

      // Auto-promote
      try {
        const member = database.getCrewMember(groupJid, memberJid);
        if (!member) continue;

        database.addCrewMember(groupJid, memberJid, { ...member, role: rule.to });

        // Also promote in WhatsApp if officer or above
        if (rule.to === 'officer' || rule.to === 'co-leader' || rule.to === 'leader') {
          try {
            await sock.groupParticipantsUpdate(groupJid, [memberJid], 'promote');
          } catch (e) {
            // WhatsApp promote might fail if not admin — that's ok, role is still updated in DB
          }
        }

        const memberNum = memberJid.split(':')[0].split('@')[0].replace(/\D/g, '');

        // Notify the group
        await sock.sendMessage(groupJid, {
          text:
            `⬆️ *AUTO-PROGRESSION*\n\n` +
            `@${memberNum} has been promoted to *${rule.to}*\n\n` +
            `📊 Activity: ${data.totalMessages} messages, ${data.daysActive} days active\n` +
            `📈 Met the threshold for ${rule.to}\n\n` +
            `_Consistency pays off ${pick(SLANG.vibe)}_ 👑`,
          mentions: [memberJid],
        });

        // DM the member
        try {
          await sock.sendMessage(memberJid, {
            text:
              `⬆️ *YOU GOT PROMOTED* 🎉\n\n` +
              `You're now a *${rule.to}* in ${teamKey}\n\n` +
              `📊 Your activity: ${data.totalMessages} messages, ${data.daysActive} days\n` +
              `📈 You met the threshold — keep it up!\n\n` +
              `_KAMI sees the effort ${pick(SLANG.good)}_ 👑`,
          });
        } catch (e) {}

        promotions.push({
          memberJid,
          from: rule.from,
          to: rule.to,
          activity: { messages: data.totalMessages, days: data.daysActive },
        });

        console.log(`[AUTO-PROGRESSION] ${memberNum} → ${rule.to} in ${teamKey} (${data.totalMessages} msgs, ${data.daysActive} days)`);
      } catch (e) {
        console.error(`[AUTO-PROGRESSION] Failed to promote ${memberJid}:`, e.message);
      }

      // Set cooldown
      lastCheck.set(cooldownKey, Date.now());
    }
  }

  return promotions;
};

/**
 * Check all crew teams for eligible promotions
 * Called on a timer from index.js
 */
const runProgressionCheck = async (sock) => {
  console.log('[AUTO-PROGRESSION] Running progression check...');

  const teamMap = database.getTeamMap();
  const allTeams = { ...teamMap };
  for (const [key, info] of Object.entries(config.crewTeams || {})) {
    if (!allTeams[key]) allTeams[key] = info;
  }

  let totalPromotions = 0;

  for (const [teamKey, teamInfo] of Object.entries(allTeams)) {
    try {
      const promotions = await checkGroup(sock, teamInfo.jid, teamKey);
      totalPromotions += promotions.length;
    } catch (e) {
      console.error(`[AUTO-PROGRESSION] Error checking ${teamKey}:`, e.message);
    }
  }

  if (totalPromotions > 0) {
    console.log(`[AUTO-PROGRESSION] Auto-promoted ${totalPromotions} members`);
  } else {
    console.log('[AUTO-PROGRESSION] No eligible promotions this cycle');
  }
};

/**
 * Start the progression timer
 * Call this once from index.js after bot connects
 */
const startProgressionEngine = (sock) => {
  console.log(`[AUTO-PROGRESSION] Engine started (checking every ${CHECK_INTERVAL / 60000} min)`);

  // Run first check after 5 minutes (give bot time to settle)
  setTimeout(() => {
    runProgressionCheck(sock);
    runInactiveCheck(sock);
  }, 5 * 60 * 1000);

  // Then run on interval
  setInterval(() => {
    runProgressionCheck(sock);
    runInactiveCheck(sock);
  }, CHECK_INTERVAL);
};

// ── Inactive Member Alerts ────────────────────────────────
const INACTIVE_THRESHOLD_DAYS = 30;

const runInactiveCheck = async (sock) => {
  console.log('[INACTIVE-CHECK] Scanning for inactive members...');

  const teamMap = database.getTeamMap();
  const allTeams = { ...teamMap };
  for (const [key, info] of Object.entries(config.crewTeams || {})) {
    if (!allTeams[key]) allTeams[key] = info;
  }

  const ownerNumbers = config.ownerNumber || [];

  for (const [teamKey, teamInfo] of Object.entries(allTeams)) {
    try {
      const inactive = database.getInactiveMembers(teamInfo.jid, INACTIVE_THRESHOLD_DAYS);
      const inactiveList = Object.entries(inactive);

      if (inactiveList.length === 0) continue;

      // Notify owner
      for (const ownerNum of ownerNumbers) {
        try {
          const ownerJid = ownerNum.includes('@') ? ownerNum : `${ownerNum}@s.whatsapp.net`;
          const mentions = inactiveList.map(([jid]) => jid);

          const memberList = inactiveList.slice(0, 5).map(([jid, data]) => {
            const num = jid.split(':')[0].split('@')[0].replace(/\D/g, '');
            const days = data.lastActive
              ? Math.floor((Date.now() - data.lastActive) / (24 * 60 * 60 * 1000))
              : '?';
            return `• @${num} — ${data.role} — ${data.totalMessages} msgs — ${days}d ago`;
          }).join('\n');

          const more = inactiveList.length > 5 ? `\n• ...and ${inactiveList.length - 5} more` : '';

          await sock.sendMessage(ownerJid, {
            text:
              `😴 *INACTIVE MEMBERS*\n\n` +
              `🏢 Team: *${teamKey}*\n` +
              `👥 *${inactiveList.length}* members inactive for 30+ days\n\n` +
              `${memberList}${more}\n\n` +
              `_Consider reviewing the roster ${pick(SLANG.vibe)}_`,
            mentions,
          });
        } catch (e) {}
      }

      console.log(`[INACTIVE-CHECK] ${teamKey}: ${inactiveList.length} inactive members`);
    } catch (e) {
      console.error(`[INACTIVE-CHECK] Error checking ${teamKey}:`, e.message);
    }
  }
};

// Need to import pick and SLANG here
const { pick, SLANG } = require('../utils/format');

module.exports = {
  checkGroup,
  runProgressionCheck,
  runInactiveCheck,
  startProgressionEngine,
  PROGRESSION_RULES,
};
