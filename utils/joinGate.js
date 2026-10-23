/**
 * Join Gate — membership gatekeeper for the SECURITY crew groups.
 *
 * The bot is the only door into the security teams: members join via
 * (a) the bot's group-add after an accepted application, (b) the bot's
 * invite link DM'd on acceptance, or (c) !crew add / !add (bot performs
 * the group-add). Anyone appearing in a security group through any other
 * channel (human-admin invites, leaked links, member forwards) is kicked,
 * DM'd why, and given a 48h grace window with a two-button menu
 * (apply / make order) instead of being blocked outright.
 *
 * Tracking starts from activation: every member present at first seed is
 * grandfathered ('legacy'). From then on every join is evaluated.
 *
 * Ledger:  database/joinLedger.json  (who the bot vouches for)
 * Grace:   database/joinGrace.json   (kicked users on a 48h clock)
 *
 * Allow rules at join time (in order):
 *   1. ledger entry for this group           (bot vouched, incl. legacy)
 *   2. the actor/initiator IS the bot        (bot performed the add)
 *   3. pending application for this team     (in the bot's pipeline)
 *   4. accepted application for this team    (accepted, invite self-join)
 * Everything else → kick + DM + grace.
 *
 * Never kicked: the bot itself, owner numbers, WhatsApp admins (staff),
 * and nobody at all in non-watched groups (SSGENERAL etc.).
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');

const LEDGER_PATH = path.join(__dirname, '..', 'database', 'joinLedger.json');
const GRACE_PATH = path.join(__dirname, '..', 'database', 'joinGrace.json');
const GRACE_MS = 48 * 60 * 60 * 1000;
const WARN_BEFORE_MS = 30 * 60 * 1000;
const MAX_KICK_DMS = 2; // rejoin spam guard — kick silently after 2 DMs

// ── persistence (direct fs, tempAllowed-style) ───────────────
let ledger = { seeded: {}, groups: {} };
try { ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')) || ledger; } catch (e) {}
ledger.seeded = ledger.seeded || {};
ledger.groups = ledger.groups || {};

let grace = {};
try { grace = JSON.parse(fs.readFileSync(GRACE_PATH, 'utf8')) || {}; } catch (e) {}

const saveLedger = () => {
  try { fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2)); } catch (e) {
    console.error('[JOIN-GATE] ledger save failed:', e.message);
  }
};
const saveGrace = () => {
  try { fs.writeFileSync(GRACE_PATH, JSON.stringify(grace, null, 2)); } catch (e) {
    console.error('[JOIN-GATE] grace save failed:', e.message);
  }
};

// ── helpers ──────────────────────────────────────────────────
const { buildComparableIds, normalizeJidWithLid } = require('./jidHelper');

function jidsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const av = buildComparableIds(a);
  const bv = buildComparableIds(b);
  return av.some(v => bv.includes(v));
}

function digitsOf(jid) {
  return String(jid || '').split(':')[0].split('@')[0].replace(/\D/g, '');
}

function isOwnerJid(jid) {
  const d = digitsOf(jid);
  if (!d) return false;
  return (config.ownerNumber || []).some(o => {
    const od = String(o).replace(/\D/g, '');
    return od && (od === d || od.endsWith(d) || d.endsWith(od));
  });
}

// The four security teams (SSGENERAL is the general crew — not gated)
function watchedGroups() {
  const map = new Map();
  for (const [key, t] of Object.entries(config.crewTeams || {})) {
    if (key === 'SSGENERAL') continue;
    if (t && t.jid) map.set(t.jid, key);
  }
  return map;
}

function isWatched(groupJid) {
  return watchedGroups().has(groupJid);
}

function teamKeyFor(groupJid) {
  return watchedGroups().get(groupJid) || null;
}

// canonical ledger key for a jid (PN form when resolvable)
function keyOf(jid) {
  try {
    const norm = normalizeJidWithLid(jid);
    if (norm) return String(norm).split(':')[0];
  } catch (e) {}
  return String(jid || '').split(':')[0];
}

// ── ledger ───────────────────────────────────────────────────
function ledgerHas(groupJid, jid) {
  const g = ledger.groups[groupJid];
  if (!g) return false;
  const variants = [keyOf(jid), ...buildComparableIds(jid).map(keyOf)];
  if (variants.some(v => g[v])) return true;
  // bare-digit fallback (LID mapping files can be missing)
  const d = digitsOf(jid);
  if (d) {
    for (const k of Object.keys(g)) {
      if (digitsOf(k) === d) return true;
    }
  }
  return false;
}

function markLedger(groupJid, jid, method, by) {
  if (!ledger.groups[groupJid]) ledger.groups[groupJid] = {};
  ledger.groups[groupJid][keyOf(jid)] = { method: method || 'unknown', at: Date.now(), by: by || null };
  saveLedger();
}

function removeLedger(groupJid, jid) {
  const g = ledger.groups[groupJid];
  if (!g) return;
  const variants = [keyOf(jid), ...buildComparableIds(jid).map(keyOf)];
  let removed = false;
  for (const v of variants) {
    if (g[v]) { delete g[v]; removed = true; }
  }
  const d = digitsOf(jid);
  if (d) {
    for (const k of Object.keys(g)) {
      if (digitsOf(k) === d) { delete g[k]; removed = true; }
    }
  }
  if (removed) saveLedger();
}

// ── seed — grandfather everyone present at activation ───────
async function ensureSeed(sock) {
  for (const [groupJid] of watchedGroups()) {
    if (ledger.seeded[groupJid]) continue;
    try {
      const meta = await sock.groupMetadata(groupJid).catch(() => null);
      if (!meta || !meta.participants) continue;
      if (!ledger.groups[groupJid]) ledger.groups[groupJid] = {};
      let n = 0;
      for (const p of meta.participants) {
        const jid = p.id || p.lid;
        if (!jid) continue;
        if (!ledger.groups[groupJid][keyOf(jid)]) {
          ledger.groups[groupJid][keyOf(jid)] = { method: 'legacy', at: Date.now(), by: 'pre-tracking' };
          n++;
        }
      }
      ledger.seeded[groupJid] = true;
      saveLedger();
      console.log(`[JOIN-GATE] seeded ${groupJid.slice(0, 26)} — ${n} existing members grandfathered`);
    } catch (e) {
      console.error(`[JOIN-GATE] seed failed ${groupJid.slice(0, 26)}:`, e.message);
    }
  }
}

// ── pending / accepted checks (team-scoped, variant-aware) ──
function hasPendingForTeam(groupJid, jid) {
  const db = require('../database');
  try {
    const team = db.getTeam(groupJid);
    const variants = buildComparableIds(jid);
    for (const app of Object.values(team.applicants || {})) {
      if (app.status !== 'pending') continue;
      if (buildComparableIds(app.jid || '').some(v => variants.includes(v))) return true;
    }
  } catch (e) {}
  return false;
}

function hasAcceptedForTeam(groupJid, jid) {
  const db = require('../database');
  try {
    const team = db.getTeam(groupJid);
    const variants = buildComparableIds(jid);
    for (const p of Object.values(team.processedApps || {})) {
      if (p.action !== 'accepted') continue;
      if (buildComparableIds(p.applicantJid || '').some(v => variants.includes(v))) return true;
    }
  } catch (e) {}
  return false;
}

// ── bot-actor detection ──────────────────────────────────────
function isBotActor(authorJid, sock) {
  if (!authorJid) return false;
  const botJid = (sock.user && sock.user.id) || '';
  if (botJid && jidsMatch(authorJid, botJid)) return true;
  // The bot's own LID — add events can carry the LID as author while
  // sock.user.id is the PN jid, and the bot's OWN LID→PN mapping usually
  // doesn't exist in our store → jidsMatch alone missed it and the gate
  // kicked members the bot itself was adding. Compare lid explicitly.
  const botLid = (sock.user && sock.user.lid) || '';
  if (botLid && jidsMatch(authorJid, botLid)) return true;
  const ad = digitsOf(authorJid);
  const bd = digitsOf(botJid);
  if (ad && bd && ad === bd) return true;
  const bl = digitsOf(botLid);
  if (ad && bl && ad === bl) return true;
  return false;
}

// ── kick + DM + grace ────────────────────────────────────────
async function kickAndGrace(sock, groupJid, teamKey, joinerJid, authorJid) {
  const { getTeamDisplayName } = require('./teamName');

  // 1. Kick — candidate jids like accept.js (device strip → LID resolve → variants)
  const candidates = [];
  const stripped = joinerJid.replace(/:\d+@/, '@');
  if (stripped !== joinerJid) candidates.push(stripped);
  try {
    const resolved = normalizeJidWithLid(joinerJid);
    if (resolved && resolved !== joinerJid && !candidates.includes(resolved)) candidates.push(resolved);
  } catch (e) {}
  for (const v of buildComparableIds(joinerJid)) {
    if (!candidates.includes(v)) candidates.push(v);
  }
  candidates.push(joinerJid);

  const { groupAction } = require('./groupActions');
  const kickOutcome = await groupAction(sock, groupJid, candidates, 'remove');
  const kicked = kickOutcome.ok;
  console.log(`[JOIN-GATE] kicked ${joinerJid.split('@')[0]} from ${teamKey} (bot=${kicked ? 'yes' : 'FAILED' + (kickOutcome.error ? ' — ' + kickOutcome.error : '')}, addedBy=${authorJid || 'unknown'})`);

  // 2. Ledger the kick so a rejoin is recognised — only when they're
  // actually out (a refused kick used to be ledgered as if it happened)
  if (kicked) markLedger(groupJid, joinerJid, 'kicked', authorJid || 'unknown');

  // 3. Grace record — 48h clock, no extension on rejoin
  const now = Date.now();
  const gkey = keyOf(joinerJid);
  const existing = grace[gkey];
  const kickCount = ((existing && existing.kickCount) || 0) + 1;
  if (!existing) {
    grace[gkey] = {
      teams: [teamKey],
      groupJids: [groupJid],
      kickedAt: now,
      graceEnds: now + GRACE_MS,
      warned30: false,
      kickCount,
      dmJid: candidates.find(c => c.includes('@s.whatsapp.net')) || candidates[0],
    };
  } else {
    // same person kicked from another security group — earliest clock wins
    if (!existing.teams.includes(teamKey)) existing.teams.push(teamKey);
    if (!existing.groupJids.includes(groupJid)) existing.groupJids.push(groupJid);
    existing.kickCount = kickCount;
    existing.graceEnds = Math.min(existing.graceEnds, now + GRACE_MS);
    existing.warned30 = existing.warned30 && (existing.graceEnds - now > WARN_BEFORE_MS);
  }
  saveGrace();

  // 4. DM — kick notice + apply/cancel buttons (skip on rejoin spam)
  const teamName = getTeamDisplayName(teamKey);
  const dmJid = grace[gkey].dmJid;
  if (kickCount <= MAX_KICK_DMS) {
    try {
      await sock.sendMessage(dmJid, {
        text:
          `━━━━━━━━━━━━━━━━\n` +
          `🚷 *WHO ARE YOU AGAIN?*\n` +
          `━━━━━━━━━━━━━━━━\n\n` +
          `I don't recognise you, hey — you just landed in *${teamName}* and:\n\n` +
          `• I didn't add you\n` +
          `• You never applied for that team\n` +
          `• KAMI didn't add you either\n\n` +
          (kicked
            ? `So I removed you from *${teamName}*. No bad blood 😅\n\n`
            : `⚠️ I couldn't pull you out myself — KAMI, check my admin status 😅\n\n`) +
          `⚠️ *You have 48 hours to apply for ${teamName}* — ` +
          `after that this DM gets blocked for good.\n\n` +
          `👇 Sort yourself out:`,
        buttons: [
          { id: `joingate:apply:${teamKey}`, text: `📋 Apply for ${teamName}` },
          { id: 'joingate:cancel', text: '🚫 Cancel' },
        ],
        footer: config.botName || 'KAMI Bot',
      });
    } catch (e) {
      console.error('[JOIN-GATE] kick DM failed:', e.message);
    }
  }
  return kicked;
}

// ── join evaluation (called from handleGroupUpdate) ──────────
// Returns true when the joiner was KICKED (so the caller can skip the
// welcome message for them)
async function evaluateJoin(sock, groupJid, joinerJid, authorJid) {
  try {
    if (!isWatched(groupJid)) return false;
    if (!joinerJid) return false;
    if (joinerJid === (sock.user && sock.user.id)) return false; // the bot itself
    if (isOwnerJid(joinerJid)) { markLedger(groupJid, joinerJid, 'owner', authorJid); return false; }

    // The OWNER performed this add — KAMI's decision overrides the gate.
    // Native WhatsApp adds carry the owner as author (not the bot), and
    // the bot used to kick people the owner was personally adding.
    if (authorJid && isOwnerJid(authorJid)) { markLedger(groupJid, joinerJid, 'owner-actor', authorJid); return false; }

    const teamKey = teamKeyFor(groupJid);

    // 1. ledger (legacy / bot-added / approved) — already vouched
    if (ledgerHas(groupJid, joinerJid)) {
      const prior = (ledger.groups[groupJid] && ledger.groups[groupJid][keyOf(joinerJid)]) || {};
      markLedger(groupJid, joinerJid, prior.method || 'known', authorJid);
      return false;
    }

    // 2. the bot performed this add
    if (isBotActor(authorJid, sock)) {
      markLedger(groupJid, joinerJid, 'bot-add', authorJid);
      return false;
    }

    // 3. pending application for this team (in the bot's pipeline)
    if (teamKey && hasPendingForTeam(groupJid, joinerJid)) {
      markLedger(groupJid, joinerJid, 'pending-join', authorJid);
      return false;
    }

    // 4. accepted application for this team (invite self-join after accept)
    if (teamKey && hasAcceptedForTeam(groupJid, joinerJid)) {
      markLedger(groupJid, joinerJid, 'approved-join', authorJid);
      return false;
    }

    // 5. violation — kick + DM + 48h grace
    return await kickAndGrace(sock, groupJid, teamKey || 'unknown', joinerJid, authorJid);
  } catch (e) {
    console.error('[JOIN-GATE] evaluate failed:', e.message);
    return false;
  }
}

// ── grace ────────────────────────────────────────────────────
function graceKeyFor(jid) {
  return keyOf(jid);
}

function isGraceActive(jid) {
  const g = grace[graceKeyFor(jid)];
  if (!g) return false;
  if (Date.now() > g.graceEnds) return false;
  return true;
}

function clearGrace(jid) {
  const k = graceKeyFor(jid);
  if (grace[k]) {
    delete grace[k];
    saveGrace();
    return true;
  }
  return false;
}

// menu text for grace users who text the bot
function graceMenuText() {
  const p = config.prefix || '.';
  return {
    text:
      `🤖 *BUTTONS ONLY* — I don't know you well enough for texts yet 😅\n\n` +
      `While you're on the 48h clock, your options:\n` +
      `• Apply for a security team\n` +
      `• Make an order\n\n` +
      `_Hit a button below ☝️ or type \`${p}crew apply <team>\`_`,
    buttons: [
      { id: 'start:apply', text: '📋 Apply for a Team' },
      { id: 'start:order', text: '🛒 Make Order' },
    ],
    footer: config.botName || 'KAMI Bot',
  };
}

// ── sweep — 30-min warning + end-of-grace block ─────────────
const _menuTimestamps = new Map(); // jid → last menu reply ts (anti-spam)
function shouldSendMenu(jid) {
  const last = _menuTimestamps.get(jid) || 0;
  if (Date.now() - last < 60 * 1000) return false;
  _menuTimestamps.set(jid, Date.now());
  return true;
}

async function sweep(sock) {
  const db = require('../database');

  // Self-healing seed — boot-time groupMetadata can fail before the
  // socket is ready; the sweep runs every minute, so retry seeding here
  // until every watched group is grandfathered
  try { await ensureSeed(sock); } catch (e) {}

  const now = Date.now();
  for (const [key, g] of Object.entries(grace)) {
    try {
      // applied while on the clock? — a pending application covers them now
      if (db.hasPendingApplication(g.dmJid)) {
        delete grace[key];
        saveGrace();
        continue;
      }

      if (now >= g.graceEnds) {
        // clock ran out — block
        const teamName = g.teams && g.teams.length ? g.teams.join(', ') : 'the team';
        try {
          await sock.sendMessage(g.dmJid, {
            text:
              `⛔ *TIME'S UP*\n\n` +
              `You had 48 hours to apply for *${teamName}*.\n` +
              `No application. This DM is now closed. 🔒`,
          });
        } catch (e) {}
        try {
          const { updateBlockStatusSafe } = require('./jidHelper');
          await updateBlockStatusSafe(sock, g.dmJid, 'block');
        } catch (e) {
          console.error('[JOIN-GATE] block failed:', e.message);
        }
        delete grace[key];
        saveGrace();
        console.log(`[JOIN-GATE] grace expired — blocked ${key.slice(0, 20)}`);
        continue;
      }

      if (!g.warned30 && g.graceEnds - now <= WARN_BEFORE_MS) {
        g.warned30 = true;
        saveGrace();
        const teamName = g.teams && g.teams.length ? g.teams.join(', ') : 'the team';
        try {
          await sock.sendMessage(g.dmJid, {
            text:
              `⏳ *30 MINUTES LEFT*\n\n` +
              `Your 48h grace to apply for *${teamName}* ends soon.\n` +
              `No application by then → I block this DM for good. ⛔`,
            buttons: [
              { id: 'start:apply', text: '📋 Apply for a Team' },
              { id: 'start:order', text: '🛒 Make Order' },
            ],
            footer: config.botName || 'KAMI Bot',
          });
        } catch (e) {
          console.error('[JOIN-GATE] 30m warning failed:', e.message);
        }
      }
    } catch (e) {
      console.error('[JOIN-GATE] sweep error:', e.message);
    }
  }
}

// ── buttons: apply-for-team / cancel from the kick DM ───────
const { onButton } = require('./buttonHelper');

onButton('joingate:apply:', async (sock, msg, from, sender, btnId) => {
  try {
    const teamKey = btnId.replace('joingate:apply:', '').toUpperCase();
    if (!config.crewTeams[teamKey]) return;

    // createApplication validates pending/roster state itself — on success
    // the 48h clock is moot
    const { createApplication } = require('../commands/crew/applyHelper');
    const result = await createApplication(sock, sender, teamKey, {
      replyFn: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
      from,
      applyingForSomeone: false,
    });

    if (result.ok) {
      clearGrace(sender);
      await sock.sendMessage(from, {
        text:
          `🎯 *CLOCK STOPPED*\n\n` +
          `Your *${teamKey}* application is in — the 48h grace no longer applies to you.\n\n` +
          `_Answer the form buttons in your DMs, boet._`,
      }, { quoted: msg });
    }
  } catch (e) {
    console.error('[JOIN-GATE] apply button failed:', e.message);
  }
});

onButton('joingate:cancel', async (sock, msg, from) => {
  try {
    const menu = graceMenuText();
    await sock.sendMessage(from, {
      text:
        `👌 *CANCELLED*\n\n` +
        `No stress — the 48h clock keeps running though.\n\n` + menu.text,
      buttons: menu.buttons,
      footer: menu.footer,
    }, { quoted: msg });
  } catch (e) {
    console.error('[JOIN-GATE] cancel failed:', e.message);
  }
});

module.exports = {
  isWatched,
  teamKeyFor,
  ensureSeed,
  evaluateJoin,
  removeLedger,
  markBotAdded: (groupJid, jid, method, by) => markLedger(groupJid, jid, method || 'bot-add', by),
  isGraceActive,
  clearGrace,
  graceMenuText,
  shouldSendMenu,
  sweep,
};
