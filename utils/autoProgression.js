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

// Alert dedup: notify about each member once per 7 days (prevents hourly DM spam).
// PERSISTED to disk — survives restarts, so a fresh pairing never re-blasts everyone.
const ALERT_COOLDOWN = 7 * 24 * 60 * 60 * 1000;
const fs = require('fs');
const path = require('path');
const ALERT_DB = path.join(__dirname, '..', 'database', 'inactiveAlerts.json');
const lastAlerted = new Map(); // jid → last notified timestamp

const loadAlerted = () => {
  try {
    const obj = JSON.parse(fs.readFileSync(ALERT_DB, 'utf8'));
    for (const [jid, ts] of Object.entries(obj)) lastAlerted.set(jid, ts);
  } catch (e) {}
};
const saveAlerted = () => {
  try {
    const obj = {};
    for (const [jid, ts] of lastAlerted) obj[jid] = ts;
    fs.writeFileSync(ALERT_DB, JSON.stringify(obj, null, 2));
  } catch (e) {}
};
loadAlerted();

// ── Bulk-message safety ───────────────────────────────────
// WhatsApp restricts accounts that send cold DMs too fast.
// Max 5 DMs per cycle + 60-90s randomized delay between each.
const MAX_DMS_PER_CYCLE = 5;
const DM_DELAY_BASE_MS = 60000;
const DM_DELAY_JITTER_MS = 30000;

setInterval(() => {
  const now = Date.now();
  for (const [jid, ts] of lastAlerted) {
    if (now - ts > 30 * 24 * 60 * 60 * 1000) lastAlerted.delete(jid);
  }
}, 60 * 60 * 1000);

// Identity across LID/PN variants — one person, one alert, one DM.
const { buildComparableIds } = require('./jidHelper');
const { getTeamDisplayName } = require('./teamName');

const _digits = (jid) => String(jid || '').split(':')[0].split('@')[0].replace(/\D/g, '');
const _dayMs = 24 * 60 * 60 * 1000;
const MAX_GROUPS_IN_DM = 8;

const _teamLabel = (info) =>
  info.name || getTeamDisplayName(info.key || info.jid, null) || info.key || info.jid || 'Unknown';

const _activityFor = (groupJid, jid) => {
  for (const v of buildComparableIds(jid)) {
    const a = database.getMemberActivity(groupJid, v);
    if (a.lastActive || a.totalMessages) return a;
  }
  return database.getMemberActivity(groupJid, jid);
};

const _wasAlerted = (jid) =>
  buildComparableIds(jid).some(v => (lastAlerted.get(v) || 0) > Date.now() - ALERT_COOLDOWN);

const _markAlerted = (jid) => {
  const now = Date.now();
  for (const v of buildComparableIds(jid)) lastAlerted.set(v, now);
  saveAlerted();
};

const _collectTeams = () => {
  const merged = { ...(database.getTeamMap() || {}) };
  for (const [key, info] of Object.entries(config.crewTeams || {})) {
    if (!merged[key]) merged[key] = info;
  }
  // Same JID can appear under teamMap + config keys — dedupe by JID
  const byJid = new Map();
  for (const [key, info] of Object.entries(merged)) {
    if (!info?.jid || byJid.has(info.jid)) continue;
    byJid.set(info.jid, { key, ...info });
  }
  return byJid;
};

const runInactiveCheck = async (sock) => {
  console.log('[INACTIVE-CHECK] Scanning all crew groups (cross-group)...');

  const teamsByJid = _collectTeams();
  const ownerDigits = new Set((config.ownerNumber || []).map(n => n.replace(/\D/g, '')).filter(Boolean));
  const botDigits = _digits(sock.user?.id);

  // Member-centric: identity → { jid, inactiveGroups[], roles[] }
  const byMember = new Map(); // anyIdVariant → entry

  const findEntry = (jid) => {
    for (const v of buildComparableIds(jid)) {
      if (byMember.has(v)) return byMember.get(v);
    }
    return null;
  };
  const indexEntry = (entry, jid) => {
    for (const v of buildComparableIds(jid)) byMember.set(v, entry);
  };

  let rosterInactive = 0;

  for (const [groupJid, teamInfo] of teamsByJid) {
    try {
      const inactive = database.getInactiveMembers(groupJid, INACTIVE_THRESHOLD_DAYS);
      const teamName = _teamLabel(teamInfo);

      for (const [jid, data] of Object.entries(inactive)) {
        rosterInactive++;
        const num = _digits(jid);
        if (jid === sock.user?.id || (num && num === botDigits)) continue;
        if (num && ownerDigits.has(num)) continue;

        const days = data.lastActive
          ? Math.floor((Date.now() - data.lastActive) / _dayMs)
          : null;

        let entry = findEntry(jid);
        if (!entry) {
          entry = { jid, inactiveGroups: [] };
          indexEntry(entry, jid);
        }
        // Same group twice under different keys — keep the worse (older) entry
        if (!entry.inactiveGroups.some(g => g.groupJid === groupJid)) {
          entry.inactiveGroups.push({
            groupJid,
            teamName,
            days,
            lastActive: data.lastActive || null,
            totalMessages: data.totalMessages || 0,
            role: data.role || 'member',
          });
        }
      }
    } catch (e) {
      console.error(`[INACTIVE-CHECK] Error scanning ${teamInfo.key || groupJid}:`, e.message);
    }
  }

  // One DM per person, covering every crew group they're quiet in
  const due = [...byMember.values()].filter(entry => {
    if (!entry.inactiveGroups.length) return false;
    return !_wasAlerted(entry.jid);
  });

  // Worst silence first — people quiet everywhere get nudged first
  due.sort((a, b) => {
    const aMin = Math.min(...a.inactiveGroups.map(g => g.days ?? INACTIVE_THRESHOLD_DAYS));
    const bMin = Math.min(...b.inactiveGroups.map(g => g.days ?? INACTIVE_THRESHOLD_DAYS));
    return bMin - aMin;
  });

  let dmsSent = 0;
  const dueIds = new Set(due.map(e => e.jid));
  let skippedCooldown = 0;
  for (const entry of byMember.values()) {
    if (entry.inactiveGroups.length && !dueIds.has(entry.jid)) skippedCooldown++;
  }

  for (const entry of due) {
    if (dmsSent >= MAX_DMS_PER_CYCLE) break;

    const groups = [...entry.inactiveGroups]
      .sort((a, b) => (b.days ?? INACTIVE_THRESHOLD_DAYS) - (a.days ?? INACTIVE_THRESHOLD_DAYS));

    // Where ARE they still active? (other crew groups not on the inactive list)
    const inactiveJids = new Set(groups.map(g => g.groupJid));
    const stillActiveIn = [];
    for (const [groupJid, teamInfo] of teamsByJid) {
      if (inactiveJids.has(groupJid)) continue;
      const a = _activityFor(groupJid, entry.jid);
      if (a.lastActive && Date.now() - a.lastActive <= INACTIVE_THRESHOLD_DAYS * _dayMs) {
        stillActiveIn.push(_teamLabel(teamInfo));
      }
    }

    const shown = groups.slice(0, MAX_GROUPS_IN_DM);
    const hidden = groups.length - shown.length;
    const totalMsgs = groups.reduce((s, g) => s + (g.totalMessages || 0), 0);
    const maxDays = Math.max(...groups.map(g => g.days ?? INACTIVE_THRESHOLD_DAYS));
    const neverPosted = groups.every(g => !g.lastActive);

    let text =
      `😴 *ACTIVITY CHECK*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `You've gone quiet in *${groups.length} crew group${groups.length === 1 ? '' : 's'}*` +
      (neverPosted ? ` (never posted)` : ` — up to *${maxDays} days* silent`) + `\n\n`;

    for (const g of shown) {
      const when = g.days !== null ? `${g.days}d inactive` : `no activity yet`;
      text += `• *${g.teamName}*\n`;
      text += `  ⏰ ${when}\n`;
      text += `  💬 Messages there: ${g.totalMessages || 0}\n`;
      text += `  🛡️ ${g.role}\n\n`;
    }
    if (hidden > 0) text += `_…and ${hidden} more group${hidden === 1 ? '' : 's'}_\n\n`;

    text += `📊 *Total messages across these groups:* ${totalMsgs}\n`;

    if (stillActiveIn.length) {
      text += `🟢 Still active in: ${stillActiveIn.slice(0, 3).join(', ')}`;
      if (stillActiveIn.length > 3) text += ` +${stillActiveIn.length - 3}`;
      text += `\n\n_Pop into the ones above too — the crew misses you_ ${pick(SLANG.vibe)}`;
    } else {
      text += `\n\n_You're quiet everywhere hey — pop in and stay active_ ${pick(SLANG.vibe)}`;
    }

    try {
      await sock.sendMessage(entry.jid, { text });
      _markAlerted(entry.jid);
      dmsSent++;
    } catch (e) {
      // LID may not be DM-able — retry PN variant once
      const alt = buildComparableIds(entry.jid).find(v => v !== entry.jid && !v.endsWith('@lid'));
      if (alt) {
        try {
          await sock.sendMessage(alt, { text });
          _markAlerted(entry.jid);
          dmsSent++;
        } catch (e2) {}
      }
    }

    if (dmsSent < MAX_DMS_PER_CYCLE && dmsSent > 0) {
      await new Promise(r => setTimeout(r, DM_DELAY_BASE_MS + Math.floor(Math.random() * DM_DELAY_JITTER_MS)));
    }
  }

  console.log(
    `[INACTIVE-CHECK] Done: ${dmsSent} DM'd, ${skippedCooldown} in cooldown, ` +
    `${byMember.size} unique inactive members (from ${rosterInactive} roster hits) across ${teamsByJid.size} groups`
  );
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
