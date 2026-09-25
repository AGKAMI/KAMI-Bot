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

    if (data.totalMessages > 0 || data.daysActive > 0) {
      console.log(`[AUTO-PROGRESSION] CHECK ${memberNum}: role="${data.role}" msgs=${data.totalMessages}/${minMessages} days=${data.daysActive}/${minDaysActive} lastPromoted=${lastPromoted || 'NONE'}`);
    }

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
let _inactiveInterval = null;

const startProgressionEngine = (sock) => {
  // Clear any previous engine (prevents duplicate intervals on reconnect)
  if (_progressionInterval) {
    clearInterval(_progressionInterval);
    _progressionInterval = null;
  }
  if (_inactiveInterval) {
    clearInterval(_inactiveInterval);
    _inactiveInterval = null;
  }

  console.log(`[AUTO-PROGRESSION] Engine started (checking every ${CHECK_INTERVAL / 60000} min)`);

  // Run progression check after 5 minutes (give bot time to settle), then hourly
  setTimeout(() => runProgressionCheck(sock), 5 * 60 * 1000);
  _progressionInterval = setInterval(() => runProgressionCheck(sock), CHECK_INTERVAL);

  // Inactive notices — WEEKLY: one full-list message per group (7-day per-group
  // cooldown in _state.groups). First scan 5 min after startup is a no-op while
  // groups are in cooldown; notices fire on the weekly cadence from then on.
  setTimeout(() => runInactiveCheck(sock), 5 * 60 * 1000);
  _inactiveInterval = setInterval(() => runInactiveCheck(sock), 7 * 24 * 60 * 60 * 1000);
};

const stopProgressionEngine = () => {
  if (_progressionInterval) {
    clearInterval(_progressionInterval);
    _progressionInterval = null;
  }
  if (_inactiveInterval) {
    clearInterval(_inactiveInterval);
    _inactiveInterval = null;
  }
  console.log('[AUTO-PROGRESSION] Engine stopped');
};

// ── Inactive Member Notices ───────────────────────────────
const INACTIVE_THRESHOLD_DAYS = 30;

// One notice per GROUP every 7 days (persisted — survives restarts).
// Members flagged in a notice who stay inactive 14 more days are auto-kicked.
const GROUP_NOTICE_COOLDOWN = 7 * 24 * 60 * 60 * 1000;
const KICK_GRACE = 14 * 24 * 60 * 60 * 1000;
const fs = require('fs');
const path = require('path');
const ALERT_DB = path.join(__dirname, '..', 'database', 'inactiveAlerts.json');

// v2 state: groups → last notice ts, flagged → { groupJid → { memberJid → flaggedAt } }
let _state = { groups: {}, flagged: {}, holdUntil: 0 };

const _saveState = () => {
  try { fs.writeFileSync(ALERT_DB, JSON.stringify(_state, null, 2)); } catch (e) {}
};
const _loadState = () => {
  try {
    const raw = JSON.parse(fs.readFileSync(ALERT_DB, 'utf8'));
    if (raw && typeof raw === 'object' && (raw.groups || raw.flagged)) {
      _state = { groups: raw.groups || {}, flagged: raw.flagged || {}, holdUntil: raw.holdUntil || 0 };
      return;
    }
  } catch (e) {} // no file yet
  // Fresh start — or v1 format ({ jid: ts }): hold every group for one cooldown
  // period so a deploy never re-notices a group that was just messaged.
  _state = { groups: {}, flagged: {}, holdUntil: Date.now() };
  _saveState();
};
_loadState();

// ── Bulk-message safety ───────────────────────────────────
// Group notices only — never DMs (cold DMs to non-contacts got all three
// accounts restricted even at 5/cycle). Max 5 group notices per hourly cycle.
const MAX_NOTICES_PER_CYCLE = 5;

// Identity across LID/PN variants — one person, one entry.
const { buildComparableIds } = require('./jidHelper');
const { getTeamDisplayName } = require('./teamName');

const _digits = (jid) => String(jid || '').split(':')[0].split('@')[0].replace(/\D/g, '');
const _dayMs = 24 * 60 * 60 * 1000;

const _teamLabel = (info) =>
  info.name || getTeamDisplayName(info.key || info.jid, null) || info.key || info.jid || 'Unknown';

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

// ── Auto-kick pass ────────────────────────────────────────
// Members flagged in a group notice who show NO activity for 14 days
// (KICK_GRACE) are removed from that group. Skips: owner, bot,
// owner-protected members, and groups where the bot isn't admin.
const _runKickPass = async (sock, teamsByJid, participantsByGroup, ownerDigits, botDigits) => {
  const handler = require('../handler');
  let kicked = 0;
  const now = Date.now();

  for (const [groupJid, flags] of Object.entries(_state.flagged)) {
    const flagList = Object.entries(flags || {});
    if (!flagList.length) continue;

    const teamInfo = teamsByJid.get(groupJid);
    if (!teamInfo) {
      // Group no longer a crew group — drop its flags
      delete _state.flagged[groupJid];
      _saveState();
      continue;
    }

    const pmap = participantsByGroup.get(groupJid);
    if (!pmap || !pmap.size) continue;

    const due = flagList.filter(([, ts]) => now - ts >= KICK_GRACE);
    if (!due.length) continue;

    // Still inactive? (fresh per-group read)
    const inactive = database.getInactiveMembers(groupJid, INACTIVE_THRESHOLD_DAYS);
    const inactiveDigits = new Set();
    for (const jid of Object.keys(inactive)) {
      for (const v of buildComparableIds(jid)) {
        const d = _digits(v);
        if (d) inactiveDigits.add(d);
      }
    }

    const botAdmin = await handler.isBotAdmin(sock, groupJid).catch(() => false);
    if (!botAdmin) {
      console.log(`[INACTIVE-CHECK] AUTO-KICK paused in ${teamInfo.key || groupJid} — bot is not admin (${due.length} pending)`);
      continue;
    }

    const teamName = _teamLabel(teamInfo);
    for (const [entryJid, flaggedAt] of due) {
      const variants = buildComparableIds(entryJid);
      const memberDigits = [...new Set(variants.map(v => _digits(v)).filter(Boolean))];

      // Still in the group? (resolve to the actual participant id)
      const targetId = memberDigits.map(d => pmap.get(d)).find(Boolean);
      if (!targetId) {
        // Left the group on their own — clear flag
        delete flags[entryJid];
        _saveState();
        continue;
      }

      // Active again after the notice — clear flag (a fresh notice re-flags later)
      if (!memberDigits.some(d => inactiveDigits.has(d))) {
        delete flags[entryJid];
        _saveState();
        continue;
      }

      // Never auto-kick the owner or the bot
      if (memberDigits.some(d => ownerDigits.has(d) || d === botDigits)) {
        delete flags[entryJid];
        _saveState();
        continue;
      }

      // Never fight the protection system
      if (variants.some(v => database.isOwnerProtected(groupJid, v))) {
        console.log(`[INACTIVE-CHECK] AUTO-KICK skipped ${memberDigits[0]} — owner-protected`);
        delete flags[entryJid];
        _saveState();
        continue;
      }

      // Protection re-add guard — same pattern as commands/admin/kick.js
      const guardIds = [...new Set([...variants, targetId])];
      for (const v of guardIds) handler._botKicked.add(v);
      setTimeout(() => { for (const v of guardIds) handler._botKicked.delete(v); }, 5000);

      try {
        await sock.groupParticipantsUpdate(groupJid, [targetId], 'remove');
        for (const d of memberDigits) pmap.delete(d); // don't mention them in today's notice
        delete flags[entryJid];
        _saveState();
        kicked++;

        const when = new Date(flaggedAt).toLocaleDateString();
        console.log(`[INACTIVE-CHECK] AUTO-KICKED ${_digits(targetId)} from ${teamInfo.key || groupJid} (flagged ${when})`);
        await sock.sendMessage(groupJid, {
          text:
            `🗑️ *AUTO-KICK*\n\n` +
            `@${_digits(targetId)} — warned ${when}, still inactive after 14 days\n` +
            `Removed from *${teamName}*`,
          mentions: [targetId],
        }).catch(() => {});
      } catch (e) {
        console.error(`[INACTIVE-CHECK] Auto-kick failed in ${groupJid} for ${targetId}:`, e.message);
        // Keep flag — retry next cycle
      }
    }
  }
  return kicked;
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
  const participantsByGroup = new Map(); // groupJid → Map(digits → participantId)

  for (const [groupJid, teamInfo] of teamsByJid) {
    try {
      const inactive = database.getInactiveMembers(groupJid, INACTIVE_THRESHOLD_DAYS);
      const teamName = _teamLabel(teamInfo);

      // Only nudge about groups the member is STILL in — stats include people who left
      const meta = await sock.groupMetadata(groupJid).catch(() => null);
      if (!meta || !meta.participants) continue;
      const pmap = new Map();
      for (const p of meta.participants) {
        const d = _digits(p.id);
        if (d && !pmap.has(d)) pmap.set(d, p.id);
      }
      participantsByGroup.set(groupJid, pmap);

      for (const [jid, data] of Object.entries(inactive)) {
        rosterInactive++;
        const num = _digits(jid);
        if (jid === sock.user?.id || (num && num === botDigits)) continue;
        if (num && ownerDigits.has(num)) continue;

        // Member must still be in this group (bridge LID/PN via variants)
        const memberDigits = [...new Set(buildComparableIds(jid).map(v => _digits(v)).filter(Boolean))];
        if (!memberDigits.some(d => pmap.has(d))) continue;

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

  // GROUP notices instead of cold DMs.
  // Cold DMs to non-contacts are WhatsApp's highest-risk pattern — they got the
  // owner's accounts restricted three times (even at 5/cycle). Group messages in
  // chats the bot already talks in are far safer, and members still get told
  // via mention. One notice per group every 7 days, ALL inactive members in a
  // single message (no mention cap); flagged members are auto-kicked 14 days later.
  let noticesSent = 0;
  let nudgedMembers = 0;
  let groupsInCooldown = 0;

  const kicked = await _runKickPass(sock, teamsByJid, participantsByGroup, ownerDigits, botDigits);

  for (const [groupJid, teamInfo] of teamsByJid) {
    if (noticesSent >= MAX_NOTICES_PER_CYCLE) break;

    const lastNoticeAt = _state.groups[groupJid] ?? _state.holdUntil ?? 0;
    if (Date.now() - lastNoticeAt < GROUP_NOTICE_COOLDOWN) {
      groupsInCooldown++;
      continue;
    }

    const pmap = participantsByGroup.get(groupJid);
    if (!pmap || pmap.size === 0) continue;

    const teamName = _teamLabel(teamInfo);

    // Due members in THIS group (still in the group per pmap)
    const teamDue = [];
    const seenTeam = new Set();
    for (const entry of byMember.values()) {
      if (seenTeam.has(entry)) continue;
      seenTeam.add(entry);
      const inThisTeam = entry.inactiveGroups.find(g => g.groupJid === groupJid);
      if (!inThisTeam) continue;
      const memberDigits = [...new Set(buildComparableIds(entry.jid).map(v => _digits(v)).filter(Boolean))];
      if (!memberDigits.some(d => pmap.has(d))) continue;
      teamDue.push({ entry, info: inThisTeam });
    }

    if (!teamDue.length) continue;

    const lines = teamDue.map(({ entry, info }) => {
      const num = _digits(entry.jid);
      const when = info.days !== null ? `${info.days}d` : 'never';
      return `• @${num} — ${when} — ${info.totalMessages || 0} msgs`;
    });
    const mentions = teamDue.map(({ entry }) => entry.jid);

    await sock.sendMessage(groupJid, {
      text:
        `😴 *ACTIVITY CHECK*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `*${teamDue.length}* member${teamDue.length === 1 ? '' : 's'} quiet for ${INACTIVE_THRESHOLD_DAYS}+ days:\n\n` +
        `${lines.join('\n')}` +
        `\n\n_Pop in and stay active hey — inactive 14 more days after this = removed_ ${pick(SLANG.vibe)}`,
      mentions,
    });

    // Persist: this group's next notice is in 7 days. Members get flagged for
    // the kick clock — keep the EARLIEST flag if already flagged (grace runs
    // from the first notice, so re-notices can't delay a kick forever).
    const now = Date.now();
    _state.groups[groupJid] = now;
    if (!_state.flagged[groupJid]) _state.flagged[groupJid] = {};
    for (const { entry } of teamDue) {
      if (!_state.flagged[groupJid][entry.jid]) _state.flagged[groupJid][entry.jid] = now;
    }
    _saveState();

    noticesSent++;
    nudgedMembers += teamDue.length;

    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(
    `[INACTIVE-CHECK] Done: ${noticesSent} group notice(s), ${nudgedMembers} members nudged, ` +
    `${groupsInCooldown} group(s) in 7-day cooldown, ${kicked} auto-kicked, ` +
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
