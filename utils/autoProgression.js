/**
 * Auto Progression Engine
 * Promotes crew members based on activity — uses per-team ranks from config.
 *
 * Dual cooldown system:
 *   1. In-memory Set (`promotedThisCycle`) — immediate, survives within session
 *   2. DB field (`lastPromoted`) — survives bot restarts
 *
 * Both must be clear for a member to be eligible.
 */

const database = require('../database');
const config = require('../config');

// ── Progression Thresholds ────────────────────────────────
// Ratio: 2.74 msgs/day — leader at 365 days
const PROMOTION_THRESHOLDS = [
  { minMessages: 100,  minDaysActive: 36 },   // ~1 month
  { minMessages: 300,  minDaysActive: 109 },  // ~3.5 months
  { minMessages: 600,  minDaysActive: 219 },  // ~7 months
  { minMessages: 800,  minDaysActive: 292 },  // ~10 months
  { minMessages: 1000, minDaysActive: 365 },  // 1 year
];

const getThresholds = (index) => {
  return PROMOTION_THRESHOLDS[index] || PROMOTION_THRESHOLDS[PROMOTION_THRESHOLDS.length - 1];
};

// WhatsApp admin threshold — rank index must be >= this
const getAdminThresholdIndex = (teamKey) => {
  if (teamKey === 'SSGENERAL') return 3;
  if (teamKey === 'KSSMP') return 3;
  return 3;
};

// How often to run (in ms) — default every hour
const CHECK_INTERVAL = 60 * 60 * 1000;

// Cooldown per member — don't re-promote within this window
const MEMBER_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours

// ── In-memory cooldown Set ────────────────────────────────
// Primary guard: tracks JIDs promoted during this session.
// Survives within the session even if DB reads fail or lastPromoted
// was never set for older members. Cleared on bot restart (which is
// fine because the DB lastPromoted field is the persistent backup).
const promotedThisSession = new Set();

/**
 * Get rank hierarchy for a team from config
 */
const getTeamRanks = (teamKey) => {
  const configRanks = config.crewTeams?.[teamKey]?.ranks;
  if (configRanks && configRanks.length > 0) return configRanks;
  return ['member', 'senior member', 'moderator', 'admin', 'co-leader', 'leader'];
};

/**
 * Check one group for eligible promotions
 * Returns array of { memberJid, from, to, activity } for each auto-promotion
 */
const checkGroup = async (sock, groupJid, teamKey) => {
  const promotions = [];
  const allActivity = database.getGroupMemberActivity(groupJid);
  const ranks = getTeamRanks(teamKey);
  const adminThreshold = getAdminThresholdIndex(teamKey);

  console.log(`[AUTO-PROGRESSION] Checking ${teamKey} — ${Object.keys(allActivity).length} members, Set size: ${promotedThisSession.size}`);

  const { buildComparableIds } = require('../utils/jidHelper');

  for (const [memberJid, data] of Object.entries(allActivity)) {
    const memberNum = memberJid.split(':')[0].split('@')[0].replace(/\D/g, '');

    // ── Owner-demoted blacklist — never auto-promote them ──
    const demotedVariants = buildComparableIds(memberJid);
    if (demotedVariants.some(v => database.isOwnerDemoted(groupJid, v))) {
      console.log(`[AUTO-PROGRESSION] SKIP ${memberNum} — demoted by owner (blacklist)`);
      continue;
    }

    // ── Cooldown check #1: in-memory Set (primary) ──
    if (promotedThisSession.has(memberJid)) {
      console.log(`[AUTO-PROGRESSION] SKIP ${memberNum} — promoted this session (in-memory cooldown)`);
      continue;
    }

    // ── Cooldown check #2: DB lastPromoted field (backup) ──
    const lastPromoted = data.lastPromoted;
    if (lastPromoted && typeof lastPromoted === 'number' && lastPromoted > 0) {
      const elapsed = Date.now() - lastPromoted;
      if (elapsed < MEMBER_COOLDOWN) {
        const hoursLeft = Math.ceil((MEMBER_COOLDOWN - elapsed) / (60 * 60 * 1000));
        console.log(`[AUTO-PROGRESSION] SKIP ${memberNum} — DB cooldown: ${hoursLeft}h remaining`);
        continue;
      }
    }

    // Find current rank in hierarchy (case-insensitive match)
    const currentRankIndex = ranks.findIndex(r => r.toLowerCase() === data.role?.toLowerCase());
    if (currentRankIndex === -1) {
      console.log(`[AUTO-PROGRESSION] SKIP ${memberNum} — role "${data.role}" not in ranks`);
      continue;
    }
    if (currentRankIndex >= ranks.length - 1) continue;

    // Next rank
    const nextRank = ranks[currentRankIndex + 1];

    // Skip if already at this rank (safety check)
    if (data.role?.toLowerCase() === nextRank.toLowerCase()) continue;

    const { minMessages, minDaysActive } = getThresholds(currentRankIndex);

    console.log(`[AUTO-PROGRESSION] CHECK ${memberNum}: role="${data.role}" msgs=${data.totalMessages}/${minMessages} days=${data.daysActive}/${minDaysActive} lastPromoted=${lastPromoted || 'NONE'}`);

    // Check thresholds
    if (data.totalMessages >= minMessages && data.daysActive >= minDaysActive) {
      console.log(`[AUTO-PROGRESSION] ELIGIBLE ${memberNum} → ${nextRank}`);
      // Auto-promote
      try {
        const member = database.getCrewMember(groupJid, memberJid);
        if (!member) continue;

        // Double-check: verify current role in DB still matches (prevent double-promote)
        const dbRoleIndex = ranks.findIndex(r => r.toLowerCase() === member.role?.toLowerCase());
        if (dbRoleIndex === -1 || dbRoleIndex >= ranks.length - 1) continue;
        if (member.role?.toLowerCase() === nextRank.toLowerCase()) continue;

        // ── Set in-memory cooldown FIRST (immediate protection) ──
        promotedThisSession.add(memberJid);

        // ── Update DB with role + lastPromoted timestamp ──
        const now = Date.now();
        database.addCrewMember(groupJid, memberJid, {
          ...member,
          role: nextRank,
          lastPromoted: now,
        });

        // Verify the write succeeded by reading back
        const verifyMember = database.getCrewMember(groupJid, memberJid);
        if (!verifyMember?.lastPromoted) {
          console.error(`[AUTO-PROGRESSION] WARNING: lastPromoted not persisted for ${memberNum}! In-memory cooldown will hold.`);
        } else {
          console.log(`[AUTO-PROGRESSION] DB VERIFIED: ${memberNum} role="${verifyMember.role}" lastPromoted=${verifyMember.lastPromoted} — Set now has ${promotedThisSession.size} entries`);
        }

        // Promote to WhatsApp admin if reaching threshold
        const nextRankIndex = currentRankIndex + 1;
        if (nextRankIndex >= adminThreshold) {
          try {
            await sock.groupParticipantsUpdate(groupJid, [memberJid], 'promote');
          } catch (e) {
            // WhatsApp promote might fail — role is still updated in DB
          }
        }

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
let _progressionInterval = null;

const startProgressionEngine = (sock) => {
  // Clear any previous engine (prevents duplicate intervals on reconnect)
  if (_progressionInterval) {
    clearInterval(_progressionInterval);
    _progressionInterval = null;
  }

  console.log(`[AUTO-PROGRESSION] Engine started (checking every ${CHECK_INTERVAL / 60000} min)`);

  // Run first check after 5 minutes (give bot time to settle)
  setTimeout(() => {
    runProgressionCheck(sock);
    runInactiveCheck(sock);
  }, 5 * 60 * 1000);

  // Then run on interval
  _progressionInterval = setInterval(() => {
    runProgressionCheck(sock);
    runInactiveCheck(sock);
  }, CHECK_INTERVAL);
};

const stopProgressionEngine = () => {
  if (_progressionInterval) {
    clearInterval(_progressionInterval);
    _progressionInterval = null;
    console.log('[AUTO-PROGRESSION] Engine stopped');
  }
};

// ── Inactive Member Alerts ────────────────────────────────
const INACTIVE_THRESHOLD_DAYS = 30;

// Alert dedup: notify about each member once per 7 days (prevents hourly DM spam)
const ALERT_COOLDOWN = 7 * 24 * 60 * 60 * 1000;
const lastAlerted = new Map(); // jid → last notified timestamp

setInterval(() => {
  const now = Date.now();
  for (const [jid, ts] of lastAlerted) {
    if (now - ts > 30 * 24 * 60 * 60 * 1000) lastAlerted.delete(jid);
  }
}, 60 * 60 * 1000);

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

      // Only alert about members not already alerted in the last 7 days
      const dueList = inactiveList.filter(([jid]) => {
        const last = lastAlerted.get(jid) || 0;
        return Date.now() - last > ALERT_COOLDOWN;
      });

      if (dueList.length === 0) continue;
      dueList.forEach(([jid]) => lastAlerted.set(jid, Date.now()));

      // Notify owner
      for (const ownerNum of ownerNumbers) {
        try {
          const ownerJid = ownerNum.includes('@') ? ownerNum : `${ownerNum}@s.whatsapp.net`;
          const mentions = dueList.map(([jid]) => jid);

          const memberList = dueList.slice(0, 5).map(([jid, data]) => {
            const num = jid.split(':')[0].split('@')[0].replace(/\D/g, '');
            const days = data.lastActive
              ? Math.floor((Date.now() - data.lastActive) / (24 * 60 * 60 * 1000))
              : '?';
            return `• @${num} — ${data.role} — ${data.totalMessages} msgs — ${days}d ago`;
          }).join('\n');

          const more = dueList.length > 5 ? `\n• ...and ${dueList.length - 5} more` : '';

          await sock.sendMessage(ownerJid, {
            text:
              `😴 *INACTIVE MEMBERS*\n\n` +
              `🏢 Team: *${teamKey}*\n` +
              `👥 *${dueList.length}* members inactive for 30+ days\n\n` +
              `${memberList}${more}\n\n` +
              `_Consider reviewing the roster ${pick(SLANG.vibe)}_`,
            mentions,
          });
        } catch (e) {}
      }

      console.log(`[INACTIVE-CHECK] ${teamKey}: ${dueList.length} inactive members alerted (${inactiveList.length} total)`);
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
  stopProgressionEngine,
  getTeamRanks,
};
