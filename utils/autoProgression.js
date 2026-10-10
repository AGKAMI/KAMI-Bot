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
            `📊 Activity: ${data.totalMessages} msgs over ${data.daysActive} days\n` +
            `📈 Met threshold for ${nextRank}\n\n` +
            `_Consistency pays off, ${voice.tag('neutral')}_ 👑`,
          mentions: [memberJid],
        });

        // DM the member
        try {
          await sock.sendMessage(memberJid, {
            text:
              `⬆️ *YOU GOT PROMOTED* 🎉\n\n` +
              `You're now *${nextRank}* in ${teamKey}\n\n` +
              `📊 Your activity: ${data.totalMessages} msgs over ${data.daysActive} days\n` +
              `📈 You made the cut — keep that energy up!\n\n` +
              `_KAMI sees the effort, ${voice.tag('affirm')}_ 👑`,
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

  // Inactive notices — scan hourly + 5 min after startup, but each group's
  // NOTICE fires at most every noticeCooldown (persisted per-group cooldown in
  // _state.groups). The short scan cadence is restart-proof: frequent
  // restarts reset intervals, but the persisted cooldown + the next hourly
  // scan still catch expiry within an hour. A weekly-only interval would
  // starve under frequent restarts.
  setTimeout(() => runInactiveCheck(sock), 5 * 60 * 1000);
  _inactiveInterval = setInterval(() => runInactiveCheck(sock), CHECK_INTERVAL);
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

// ── Inactive Member Notices & Auto-Kick ───────────────────
// Policy comes from utils/kickSettings.js — hot-reloaded every pass:
//   effective = defaults ← global ← per-group override
// Knobs: enabled, inactiveWindow, gracePeriod, minMessages,
//        noticeCooldown (per-group) + maxKicksPerCycle (global cap).
const kickSettings = require('./kickSettings');
const fs = require('fs');
const path = require('path');
const ALERT_DB = path.join(__dirname, '..', 'database', 'inactiveAlerts.json');

// v2 state: groups → last notice ts, flagged → { groupJid → { memberJid → flaggedAt } },
// massAck → owner previewed a large due batch (kicks unheld for 12h)
let _state = { groups: {}, flagged: {}, holdUntil: 0, massAck: null };

const _saveState = () => {
  try { fs.writeFileSync(ALERT_DB, JSON.stringify(_state, null, 2)); } catch (e) {}
};
const _loadState = () => {
  try {
    const raw = JSON.parse(fs.readFileSync(ALERT_DB, 'utf8'));
    if (raw && typeof raw === 'object' && (raw.groups || raw.flagged)) {
      _state = {
        groups: raw.groups || {},
        flagged: raw.flagged || {},
        holdUntil: raw.holdUntil || 0,
        massAck: raw.massAck || null,
      };
      return;
    }
  } catch (e) {} // no file yet
  // Fresh start — or v1 format ({ jid: ts }): hold every group for one cooldown
  // period so a deploy never re-notices a group that was just messaged.
  _state = { groups: {}, flagged: {}, holdUntil: Date.now(), massAck: null };
  _saveState();
};
_loadState();

// ── Bulk-message safety ───────────────────────────────────
// Group notices only — never DMs (cold DMs to non-contacts got all three
// accounts restricted even at 5/cycle). Max 5 group notices per hourly cycle.
const MAX_NOTICES_PER_CYCLE = 5;

// Mass-kill guard: this many members instantly due → hold kicks until the
// owner views Preview (settings shrunk / stats reset protection).
const MASS_DUE_THRESHOLD = 10;
const MASS_ACK_TTL = 12 * 60 * 60 * 1000; // preview acknowledges for 12h

// Identity across LID/PN variants — one person, one entry.
const { buildComparableIds } = require('./jidHelper');
const { getTeamDisplayName } = require('./teamName');
const { voice } = require('../utils/format');

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

const isCrewGroupJid = (jid) => _collectTeams().has(jid);

// ── Inactive computation (window + minMessages) ───────────
// Replaces database.getInactiveMembers: honours per-group effective settings.
// minMessages > 1 counts msgs inside the window from groupStats daily counts.
const _inactiveFromActivity = (groupJid, activity, s, now) => {
  const inactive = {};
  const windowDays = s.inactiveWindow / _dayMs;
  const cutoff = now - s.inactiveWindow;
  for (const [jid, data] of Object.entries(activity)) {
    if (s.minMessages <= 1) {
      if (!data.lastActive || data.lastActive < cutoff) inactive[jid] = data;
    } else {
      const winMsgs = database.getMessagesInWindow(groupJid, jid, windowDays);
      if (winMsgs < s.minMessages) inactive[jid] = { ...data, windowMsgs: winMsgs };
    }
  }
  return inactive;
};

// ── Dry-run due computation (shared by kick pass + preview) ──
// reason === null → eligible for removal; otherwise why it's excluded.
const _computeDueFlags = (teamsByJid, participantsByGroup, inactiveByGroup, ownerDigits, botDigits, now) => {
  const out = [];
  for (const [groupJid, flags] of Object.entries(_state.flagged)) {
    const teamInfo = teamsByJid.get(groupJid);
    if (!teamInfo) continue;
    const s = kickSettings.getEffective(groupJid);
    if (!s.enabled) continue;

    const flagList = Object.entries(flags || {});
    if (!flagList.length) continue;
    const due = flagList.filter(([, ts]) => now - ts >= s.gracePeriod);
    if (!due.length) continue;

    const pmap = participantsByGroup.get(groupJid);
    if (!pmap || !pmap.size) continue;

    const inactiveDigits = new Set();
    for (const jid of Object.keys(inactiveByGroup.get(groupJid) || {})) {
      for (const v of buildComparableIds(jid)) {
        const d = _digits(v);
        if (d) inactiveDigits.add(d);
      }
    }

    const teamName = _teamLabel(teamInfo);
    for (const [entryJid, flaggedAt] of due) {
      const variants = buildComparableIds(entryJid);
      const memberDigits = [...new Set(variants.map(v => _digits(v)).filter(Boolean))];
      const targetId = memberDigits.map(d => pmap.get(d)).find(Boolean);

      let reason = null;
      if (!targetId) reason = 'left';
      else if (!memberDigits.some(d => inactiveDigits.has(d))) reason = 'active';
      else if (memberDigits.some(d => ownerDigits.has(d) || d === botDigits)) reason = 'owner';
      else if (variants.some(v => database.isOwnerProtected(groupJid, v))) reason = 'protected';
      else {
        // New-member guard: kick-eligible only after firstSeen + window
        const seen = kickSettings.getFirstSeen(memberDigits);
        if (!seen || now - seen.first < s.inactiveWindow) reason = 'too-new';
      }

      out.push({ groupJid, entryJid, flaggedAt, targetId, memberDigits, reason, teamInfo, teamName, s });
    }
  }
  return out;
};

// ── Auto-kick pass ────────────────────────────────────────
// Flag bookkeeping (left/active/owner/protected) always runs. Actual removals
// honour: effective enabled, mass-kill hold, bot-admin, maxKicksPerCycle.
// Kick FAILURES keep flags (retry next cycle); terminal states delete them.
const _runKickPass = async (sock, teamsByJid, participantsByGroup, inactiveByGroup, ownerDigits, botDigits, now) => {
  const handler = require('../handler');
  let kicked = 0;

  // Group no longer a crew group — drop its flags
  for (const groupJid of Object.keys(_state.flagged)) {
    if (!teamsByJid.has(groupJid)) {
      delete _state.flagged[groupJid];
      _saveState();
    }
  }

  const due = _computeDueFlags(teamsByJid, participantsByGroup, inactiveByGroup, ownerDigits, botDigits, now);
  const eligible = due.filter(d => !d.reason);
  const maxPerCycle = kickSettings.getGlobal().maxKicksPerCycle;
  const ackFresh = _state.massAck && (now - _state.massAck.at < MASS_ACK_TTL);
  const holdKicks = eligible.length >= MASS_DUE_THRESHOLD && !ackFresh;

  if (holdKicks) {
    console.log(
      `[INACTIVE-CHECK] ⚠️ ${eligible.length} members due at once — kicks HELD until owner runs .kickcfg preview (mass-kill guard)`
    );
  }

  // Safe bookkeeping: clear flags that can never lead to a kick
  for (const d of due) {
    if (!d.reason || d.reason === 'too-new') continue;
    if (d.reason === 'protected') {
      console.log(`[INACTIVE-CHECK] AUTO-KICK skipped ${d.memberDigits[0]} — owner-protected`);
    }
    if (_state.flagged[d.groupJid]) delete _state.flagged[d.groupJid][d.entryJid];
    _saveState();
  }

  if (holdKicks) return kicked;

  const botAdminCache = new Map();
  for (const d of due) {
    if (d.reason) continue; // too-new keeps its flag; others already cleared
    if (kicked >= maxPerCycle) {
      console.log(`[INACTIVE-CHECK] Kick cap reached (${maxPerCycle}/cycle) — remaining kicks roll to the next pass`);
      break;
    }
    const { groupJid, entryJid, flaggedAt, targetId, memberDigits, teamInfo, teamName, s } = d;

    if (!botAdminCache.has(groupJid)) {
      botAdminCache.set(groupJid, await handler.isBotAdmin(sock, groupJid).catch(() => false));
    }
    if (!botAdminCache.get(groupJid)) {
      console.log(`[INACTIVE-CHECK] AUTO-KICK paused in ${teamInfo.key || groupJid} — bot is not admin`);
      continue; // keep flags — retry when admin again
    }

    // Protection re-add guard — same pattern as commands/admin/kick.js
    const guardIds = [...new Set([...memberDigits, targetId])];
    for (const v of guardIds) handler._botKicked.add(v);
    setTimeout(() => { for (const v of guardIds) handler._botKicked.delete(v); }, 5000);

    try {
      await sock.groupParticipantsUpdate(groupJid, [targetId], 'remove');
      const pmap = participantsByGroup.get(groupJid);
      if (pmap) for (const dd of memberDigits) pmap.delete(dd); // don't mention them in today's notice
      if (_state.flagged[groupJid]) delete _state.flagged[groupJid][entryJid];
      _saveState();
      kicked++;

      const when = new Date(flaggedAt).toLocaleDateString();
      console.log(`[INACTIVE-CHECK] AUTO-KICKED ${_digits(targetId)} from ${teamInfo.key || groupJid} (flagged ${when})`);
      await sock.sendMessage(groupJid, {
        text:
          `🗑️ *AUTO-KICK*\n\n` +
          `@${_digits(targetId)} — got warned ${when}, still quiet after ${kickSettings.fmtDuration(s.gracePeriod)}\n` +
          `Removed from *${teamName}*`,
        mentions: [targetId],
      }).catch(() => {});
    } catch (e) {
      console.error(`[INACTIVE-CHECK] Auto-kick failed in ${groupJid} for ${targetId}:`, e.message);
      // Keep flag — retry next cycle
    }
  }
  return kicked;
};

// ── Shared scan: roster + inactive + firstSeen + byMember ──
const _scanAll = async (sock) => {
  const teamsByJid = _collectTeams();
  const ownerDigits = new Set((config.ownerNumber || []).map(n => n.replace(/\D/g, '')).filter(Boolean));
  const botDigits = _digits(sock.user?.id);
  const now = Date.now();

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
  const inactiveByGroup = new Map();     // groupJid → { memberJid → data }

  for (const [groupJid, teamInfo] of teamsByJid) {
    try {
      const s = kickSettings.getEffective(groupJid);
      const activity = database.getGroupMemberActivity(groupJid);
      const inactive = _inactiveFromActivity(groupJid, activity, s, now);
      inactiveByGroup.set(groupJid, inactive);
      const teamName = _teamLabel(teamInfo);

      // Only nudge about groups the member is STILL in — stats include people who left
      const meta = await sock.groupMetadata(groupJid).catch(() => null);
      if (!meta || !meta.participants) continue;
      const pmap = new Map();
      const memberVariants = [];
      for (const p of meta.participants) {
        const d = _digits(p.id);
        if (d && !pmap.has(d)) pmap.set(d, p.id);
        memberVariants.push(buildComparableIds(p.id).map(v => _digits(v)).filter(Boolean));
      }
      participantsByGroup.set(groupJid, pmap);

      // First-seen guard: seed from earliest known activity, else now.
      // Batches the whole roster in ONE load/save of kickConfig.json.
      const hintByDigits = {};
      for (const [jid, data] of Object.entries(activity)) {
        if (!data.firstActive) continue;
        for (const v of buildComparableIds(jid)) {
          const d = _digits(v);
          if (d && (!hintByDigits[d] || data.firstActive < hintByDigits[d])) hintByDigits[d] = data.firstActive;
        }
      }
      kickSettings.ensureFirstSeen(memberVariants, hintByDigits, now);

      for (const [jid, data] of Object.entries(inactive)) {
        rosterInactive++;
        const num = _digits(jid);
        if (jid === sock.user?.id || (num && num === botDigits)) continue;
        if (num && ownerDigits.has(num)) continue;

        // Member must still be in this group (bridge LID/PN via variants)
        const memberDigits = [...new Set(buildComparableIds(jid).map(v => _digits(v)).filter(Boolean))];
        if (!memberDigits.some(d => pmap.has(d))) continue;

        const days = data.lastActive
          ? Math.floor((now - data.lastActive) / _dayMs)
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
            windowMsgs: data.windowMsgs,
            role: data.role || 'member',
          });
        }
      }
    } catch (e) {
      console.error(`[INACTIVE-CHECK] Error scanning ${teamInfo.key || groupJid}:`, e.message);
    }
  }

  // Bounded growth: drop firstSeen entries unseen for 90 days
  kickSettings.pruneFirstSeen(now);

  return { teamsByJid, participantsByGroup, inactiveByGroup, byMember, ownerDigits, botDigits, now, rosterInactive };
};

const runInactiveCheck = async (sock) => {
  console.log('[INACTIVE-CHECK] Scanning all crew groups (cross-group)...');

  const scan = await _scanAll(sock);
  const { teamsByJid, participantsByGroup, inactiveByGroup, byMember, ownerDigits, botDigits, now, rosterInactive } = scan;

  const kicked = await _runKickPass(sock, teamsByJid, participantsByGroup, inactiveByGroup, ownerDigits, botDigits, now);

  // GROUP notices instead of cold DMs.
  // Cold DMs to non-contacts are WhatsApp's highest-risk pattern — they got the
  // owner's accounts restricted three times (even at 5/cycle). Group messages in
  // chats the bot already talks in are far safer, and members still get told
  // via mention. One notice per group every noticeCooldown (effective per-group),
  // ALL inactive members in a single message (no mention cap); flagged members
  // are auto-kicked gracePeriod later.
  let noticesSent = 0;
  let nudgedMembers = 0;
  let groupsInCooldown = 0;
  let groupsDisabled = 0;

  for (const [groupJid, teamInfo] of teamsByJid) {
    if (noticesSent >= MAX_NOTICES_PER_CYCLE) break;

    const s = kickSettings.getEffective(groupJid);
    if (!s.enabled) {
      groupsDisabled++;
      continue;
    }

    const lastNoticeAt = _state.groups[groupJid] ?? _state.holdUntil ?? 0;
    if (now - lastNoticeAt < s.noticeCooldown) {
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
      const msgs = info.windowMsgs ?? info.totalMessages ?? 0;
      return `• @${num} — ${when} — ${msgs} msgs`;
    });
    const mentions = teamDue.map(({ entry }) => entry.jid);

    await sock.sendMessage(groupJid, {
      text:
        `😴 *ACTIVITY CHECK*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `*${teamDue.length}* member${teamDue.length === 1 ? '' : 's'} quiet for ${kickSettings.fmtDuration(s.inactiveWindow)}+:\n\n` +
        `${lines.join('\n')}` +
        `\n\n_Pop in and stay active hey — inactive ${kickSettings.fmtDuration(s.gracePeriod)} more after this = removed_ ${voice.lead('neutral')}`,
      mentions,
    });

    // Persist: this group's next notice is in noticeCooldown. Members get flagged
    // for the kick clock — keep the EARLIEST flag if already flagged (grace runs
    // from the first notice, so re-notices can't delay a kick forever).
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
    `${groupsInCooldown} group(s) in notice cooldown, ${groupsDisabled} disabled, ${kicked} auto-kicked, ` +
    `${byMember.size} unique inactive members (from ${rosterInactive} roster hits) across ${teamsByJid.size} groups`
  );
};

// ── Preview (dry run) ─────────────────────────────────────
// Owner-only from the command side. No removals, no flag writes, no group
// messages. Running it ACKS the mass-kill guard for 12h.
const runKickPreview = async (sock) => {
  const scan = await _scanAll(sock);
  const { teamsByJid, participantsByGroup, inactiveByGroup, byMember, ownerDigits, botDigits, now, rosterInactive } = scan;
  const due = _computeDueFlags(teamsByJid, participantsByGroup, inactiveByGroup, ownerDigits, botDigits, now);

  const perGroup = [];
  for (const [groupJid, teamInfo] of teamsByJid) {
    const s = kickSettings.getEffective(groupJid);
    const inactive = inactiveByGroup.get(groupJid) || {};
    const flagMap = _state.flagged[groupJid] || {};
    const gDue = due.filter(d => d.groupJid === groupJid);
    const eligible = gDue.filter(d => !d.reason);
    const reasons = {};
    for (const d of gDue) if (d.reason) reasons[d.reason] = (reasons[d.reason] || 0) + 1;

    // Members inactive & still in roster (notice candidates), for the list
    const pmap = participantsByGroup.get(groupJid) || new Map();
    const kickList = eligible.slice(0, 25).map(d => ({
      digits: _digits(d.targetId),
      flaggedAt: d.flaggedAt,
    }));

    perGroup.push({
      jid: groupJid,
      name: _teamLabel(teamInfo),
      enabled: s.enabled,
      inactiveCount: Object.keys(inactive).length,
      flaggedCount: Object.keys(flagMap).length,
      dueCount: gDue.length,
      kickCount: eligible.length,
      cleared: reasons,
      kickList,
    });
  }

  const totals = perGroup.reduce((acc, g) => ({
    inactive: acc.inactive + g.inactiveCount,
    flagged: acc.flagged + g.flaggedCount,
    due: acc.due + g.dueCount,
    kicks: acc.kicks + g.kickCount,
  }), { inactive: 0, flagged: 0, due: 0, kicks: 0 });

  // Ack the mass-kill guard — owner has now seen the numbers
  _state.massAck = { at: now };
  _saveState();

  return {
    scannedAt: now,
    perGroup,
    totals,
    uniqueInactive: byMember.size,
    rosterHits: rosterInactive,
    massHoldWouldApply: totals.kicks >= MASS_DUE_THRESHOLD,
    massAckAt: now,
    maxPerCycle: kickSettings.getGlobal().maxKicksPerCycle,
  };
};

// ── Dashboard summary (cheap — no roster scan) ────────────
const getKickStateSummary = () => {
  const teamsByJid = _collectTeams();
  const global = kickSettings.getGlobal();
  const overrides = kickSettings.getOverrides();
  const per = [];
  let totalFlags = 0;
  for (const [jid, info] of teamsByJid) {
    const flags = Object.keys(_state.flagged[jid] || {}).length;
    totalFlags += flags;
    const eff = kickSettings.getEffective(jid);
    per.push({
      jid,
      name: _teamLabel(info),
      flags,
      enabled: eff.enabled,
      overridden: !!overrides[jid],
      overrideKeys: overrides[jid] ? Object.keys(overrides[jid]) : [],
    });
  }
  return {
    global,
    per,
    totalFlags,
    holdUntil: _state.holdUntil || 0,
    lastNotice: { ..._state.groups },
    massAckAt: _state.massAck?.at || 0,
  };
};

// ── Purge flags (owner clean-slate) ───────────────────────
// Delete flag entries only — notice cooldowns and firstSeen stay intact.
const purgeKickFlags = (groupJid) => {
  if (groupJid) {
    delete _state.flagged[groupJid];
  } else {
    _state.flagged = {};
  }
  _saveState();
};

module.exports = {
  checkGroup,
  runProgressionCheck,
  runInactiveCheck,
  startProgressionEngine,
  stopProgressionEngine,
  getTeamRanks,
  runKickPreview,
  getKickStateSummary,
  isCrewGroupJid,
  purgeKickFlags,
};
