/**
 * Auto Progression Engine
 * Promotes crew members based on activity — uses per-team ranks from config.
 *
 * Each team's rank hierarchy is defined in config.crewTeams[teamKey].ranks.
 * Progression thresholds scale with position in the hierarchy:
 *   lower ranks = easier thresholds
 *   higher ranks = harder thresholds
 *
 * WhatsApp admin promotion:
 *   SS General: moderator and above
 *   Security teams: grade b / shift supervisor and above
 */

const database = require('../database');
const config = require('../config');

// ── Progression Thresholds ────────────────────────────────
// Scales with index in the team's rank array
const getThresholds = (index, total) => {
  // Earlier promotions = easier, later = harder
  const msgMultiplier = index + 1;
  const dayMultiplier = index + 1;

  const minMessages = Math.floor(40 * Math.pow(msgMultiplier, 1.5));
  const minDaysActive = Math.floor(5 * Math.pow(dayMultiplier, 1.2));

  return { minMessages, minDaysActive };
};

// WhatsApp admin threshold — rank index must be >= this
// SSGENERAL: no auto-admin (loyalty ranks ≠ authority)
const getAdminThresholdIndex = (teamKey) => {
  if (teamKey === 'SSGENERAL') return 99; // never auto-admin
  if (teamKey === 'KSSMP') return 3; // inspector+ (metro police)
  return 3; // grade b / shift supervisor+ for security teams
};

// How often to run (in ms) — default every hour
const CHECK_INTERVAL = 60 * 60 * 1000;

// Cooldown per member — don't re-check same member within this window
const MEMBER_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours

// Track last check time per member to avoid spam
const lastCheck = new Map();

/**
 * Get rank hierarchy for a team from config
 */
const getTeamRanks = (teamKey) => {
  const configRanks = config.crewTeams?.[teamKey]?.ranks;
  if (configRanks && configRanks.length > 0) return configRanks;
  // Fallback — shouldn't happen if config is correct
  return ['member', 'senior member', 'moderator', 'admin', 'co-leader', 'leader'];
};

/**
 * Check one group for eligible promotions
 * Returns array of { memberJid, from, to, activity } for each auto-promotion
 */
const checkGroup = async (sock, groupJid, teamKey) => {
  const promotions = [];
  const allActivity = database.getGroupMemberActivity(groupJid);
  const roles = database.getCustomRoles(groupJid);
  const ranks = getTeamRanks(teamKey);
  const adminThreshold = getAdminThresholdIndex(teamKey);

  for (const [memberJid, data] of Object.entries(allActivity)) {
    // Skip if cooldown active
    const cooldownKey = `${groupJid}:${memberJid}`;
    const lastCheckTime = lastCheck.get(cooldownKey) || 0;
    if (Date.now() - lastCheckTime < MEMBER_COOLDOWN) continue;

    // Find current rank in hierarchy
    const currentRankIndex = ranks.indexOf(data.role);
    if (currentRankIndex === -1) continue; // Role not in hierarchy
    if (currentRankIndex >= ranks.length - 1) continue; // Already at top rank

    // Next rank
    const nextRank = ranks[currentRankIndex + 1];
    const { minMessages, minDaysActive } = getThresholds(currentRankIndex, ranks.length);

    // Check thresholds
    if (data.totalMessages >= minMessages && data.daysActive >= minDaysActive) {
      // Auto-promote
      try {
        const member = database.getCrewMember(groupJid, memberJid);
        if (!member) continue;

        database.addCrewMember(groupJid, memberJid, { ...member, role: nextRank });

        // Promote to WhatsApp admin if reaching threshold
        const nextRankIndex = currentRankIndex + 1;
        if (nextRankIndex >= adminThreshold) {
          try {
            await sock.groupParticipantsUpdate(groupJid, [memberJid], 'promote');
          } catch (e) {
            // WhatsApp promote might fail — role is still updated in DB
          }
        }

        const memberNum = memberJid.split(':')[0].split('@')[0].replace(/\D/g, '');

        // Notify the group
        await sock.sendMessage(groupJid, {
          text:
            `⬆️ *AUTO-PROGRESSION*\n\n` +
            `@${memberNum} promoted to *${nextRank}*\n\n` +
            `📊 Activity: ${data.totalMessages} msgs, ${data.daysActive} days\n` +
            `📈 Met threshold for ${nextRank}\n\n` +
            `_Consistency pays off ${pick(SLANG.vibe)}_ 👑`,
          mentions: [memberJid],
        });

        // DM the member
        try {
          await sock.sendMessage(memberJid, {
            text:
              `⬆️ *YOU GOT PROMOTED* 🎉\n\n` +
              `You're now *${nextRank}* in ${teamKey}\n\n` +
              `📊 Your activity: ${data.totalMessages} msgs, ${data.daysActive} days\n` +
              `📈 You met the threshold — keep it up!\n\n` +
              `_KAMI sees the effort ${pick(SLANG.good)}_ 👑`,
          });
        } catch (e) {}

        promotions.push({
          memberJid,
          from: data.role,
          to: nextRank,
          activity: { messages: data.totalMessages, days: data.daysActive },
        });

        console.log(`[AUTO-PROGRESSION] ${memberNum} → ${nextRank} in ${teamKey} (${data.totalMessages} msgs, ${data.daysActive} days)`);
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

const { pick, SLANG } = require('../utils/format');

module.exports = {
  checkGroup,
  runProgressionCheck,
  runInactiveCheck,
  startProgressionEngine,
  getTeamRanks,
};
