/**
 * Kick Settings — hot-reloaded configuration for the auto-kick engine.
 * Lives in database/kickConfig.json. Read fresh from disk on every access
 * (tiny file) so owner changes apply on the next scan without a restart —
 * the boot-cache trap that bit inactiveAlerts.json must not repeat here.
 *
 * Structure:
 *   global  — base policy for every crew group
 *   groups  — per-group overrides (any policy key except maxKicksPerCycle)
 *   firstSeen — { digits: { first, last } } roster-sighting guard
 */

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'database', 'kickConfig.json');
const DAY = 24 * 60 * 60 * 1000;

const DEFAULTS = {
  enabled: true,
  inactiveWindow: 30 * DAY,   // quiet this long → named in notice
  gracePeriod: 14 * DAY,      // after notice, still quiet this long → kicked
  minMessages: 1,             // msgs inside the window to count as active
  noticeCooldown: 7 * DAY,    // per-group spacing between notices
  maxKicksPerCycle: 10,       // global safety valve (not overridable per group)
};

// Keys a group may override
const GROUP_OVERRIDABLE = ['enabled', 'inactiveWindow', 'gracePeriod', 'minMessages', 'noticeCooldown'];

const LIMITS = {
  inactiveWindow: { min: DAY, max: 5 * 365 * DAY },
  gracePeriod: { min: DAY, max: 90 * DAY },
  minMessages: { min: 1, max: 100 },
  noticeCooldown: { min: DAY, max: 90 * DAY },
  maxKicksPerCycle: { min: 1, max: 50 },
};

const FIRSTSEEN_PRUNE_MS = 90 * DAY;

const _blank = () => ({ global: {}, groups: {}, firstSeen: {} });

const _load = () => {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (raw && typeof raw === 'object') {
      return {
        global: raw.global && typeof raw.global === 'object' ? raw.global : {},
        groups: raw.groups && typeof raw.groups === 'object' ? raw.groups : {},
        firstSeen: raw.firstSeen && typeof raw.firstSeen === 'object' ? raw.firstSeen : {},
      };
    }
  } catch (e) {} // no file yet
  return _blank();
};

const _save = (data) => {
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('[KICK-SETTINGS] save failed:', e.message);
    return false;
  }
};

// ── Parsing / formatting ──────────────────────────────────
// Units: d/w/m/y (m = 30d months, y = 365d years — fixed, stated in UI).
const _parseDuration = (str) => {
  if (str === null || str === undefined) return null;
  const m = String(str).trim().toLowerCase()
    .replace(/,/g, '')
    .match(/^(\d+)\s*(d(?:ay)?s?|w(?:ee)?k?s?|m(?:on)?(?:th)?s?|y(?:ea)?r?s?)?$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = m[2] || 'd';
  if (u.startsWith('y')) return n * 365 * DAY;
  if (u.startsWith('m')) return n * 30 * DAY;
  if (u.startsWith('w')) return n * 7 * DAY;
  return n * DAY;
};

const _fmtDuration = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) return '0 days';
  if (ms % (365 * DAY) === 0) { const n = ms / (365 * DAY); return `${n} year${n === 1 ? '' : 's'}`; }
  if (ms % (30 * DAY) === 0) { const n = ms / (30 * DAY); return `${n} month${n === 1 ? '' : 's'}`; }
  if (ms % (7 * DAY) === 0) { const n = ms / (7 * DAY); return `${n} week${n === 1 ? '' : 's'}`; }
  const n = Math.round(ms / DAY);
  return `${n} day${n === 1 ? '' : 's'}`;
};

// Validate + coerce a raw value for a policy key.
// Returns { ok: true, value } or { ok: false, error }.
const _validate = (key, raw) => {
  if (key === 'enabled') {
    const v = typeof raw === 'boolean' ? raw : /^(on|true|1|yes)$/i.test(String(raw));
    return { ok: true, value: v };
  }
  if (key === 'minMessages' || key === 'maxKicksPerCycle') {
    const n = parseInt(raw, 10);
    const lim = LIMITS[key];
    if (!Number.isFinite(n) || n < lim.min || n > lim.max) {
      return { ok: false, error: `must be ${lim.min}–${lim.max}` };
    }
    return { ok: true, value: n };
  }
  // Duration keys
  let ms;
  if (typeof raw === 'number') ms = raw;
  else ms = _parseDuration(raw);
  if (ms === null) return { ok: false, error: 'use e.g. 7d, 2w, 1m, 1y' };
  const lim = LIMITS[key];
  if (ms < lim.min || ms > lim.max) {
    return { ok: false, error: `must be between ${_fmtDuration(lim.min)} and ${_fmtDuration(lim.max)}` };
  }
  return { ok: true, value: ms };
};

const _clampGlobal = (obj) => {
  const out = {};
  for (const key of Object.keys(DEFAULTS)) {
    const res = _validate(key, obj[key]);
    if (res.ok) out[key] = res.value;
  }
  return out;
};

// ── Public API ────────────────────────────────────────────
const getGlobal = () => {
  const data = _load();
  return { ...DEFAULTS, ..._clampGlobal(data.global) };
};

// Effective policy for a group: defaults ← global ← per-group override
const getEffective = (groupJid) => {
  const data = _load();
  const g = { ...DEFAULTS, ..._clampGlobal(data.global) };
  const ov = (groupJid && data.groups[groupJid]) || {};
  for (const key of GROUP_OVERRIDABLE) {
    if (ov[key] !== undefined) {
      const res = _validate(key, ov[key]);
      if (res.ok) g[key] = res.value;
    }
  }
  return g;
};

const getOverrides = () => _load().groups;

// scope: 'global' | groupJid. patch: partial policy object.
const update = (scope, patch) => {
  if (!patch || typeof patch !== 'object') return { ok: false, error: 'nothing to update' };
  const data = _load();
  const isGlobal = scope === 'global';
  const target = isGlobal ? data.global : (data.groups[scope] = data.groups[scope] || {});

  const errors = [];
  for (const [key, raw] of Object.entries(patch)) {
    if (key === 'maxKicksPerCycle' && !isGlobal) {
      errors.push('maxKicksPerCycle is global-only');
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
      errors.push(`unknown key "${key}"`);
      continue;
    }
    const res = _validate(key, raw);
    if (!res.ok) { errors.push(`${key} ${res.error}`); continue; }
    target[key] = res.value;
  }
  if (errors.length) return { ok: false, error: errors.join('; ') };
  _save(data);
  return { ok: true };
};

const resetGroup = (groupJid) => {
  const data = _load();
  if (!data.groups[groupJid]) return false;
  delete data.groups[groupJid];
  _save(data);
  return true;
};

const resetGlobal = () => {
  const data = _load();
  data.global = {};
  _save(data);
};

// ── First-seen guard (new-member protection) ──────────────
// Called once per scan pass with the WHOLE roster (batched load/save):
//   - known members: bump `last` only (first preserved forever)
//   - new members: first = earliest known activity ts (hintByDigits), else now
// Kick-eligible only after first + inactiveWindow.
const ensureFirstSeen = (variantLists, hintByDigits, now) => {
  if (!Array.isArray(variantLists) || !variantLists.length) return;
  const data = _load();
  let changed = false;
  for (const variants of variantLists) {
    if (!variants || !variants.length) continue;
    const knownKey = variants.find(d => d && data.firstSeen[d]);
    if (knownKey) {
      const cur = data.firstSeen[knownKey];
      if (cur.last !== now) {
        cur.last = now;
        changed = true;
      }
      continue;
    }
    const hint = variants.map(d => hintByDigits?.[d]).find(v => Number.isFinite(v));
    const first = hint || now;
    for (const d of variants) {
      if (!d) continue;
      data.firstSeen[d] = { first, last: now };
    }
    changed = true;
  }
  if (changed) _save(data);
};

// Returns { first, last } or null if never seen
const getFirstSeen = (digitsOrList) => {
  const list = Array.isArray(digitsOrList) ? digitsOrList : [digitsOrList];
  const data = _load();
  for (const d of list) {
    if (d && data.firstSeen[d]) return data.firstSeen[d];
  }
  return null;
};

// Drop entries not seen for 90 days (bounded growth)
const pruneFirstSeen = (now = Date.now()) => {
  const data = _load();
  let removed = 0;
  for (const [d, e] of Object.entries(data.firstSeen)) {
    if (!e || !e.last || now - e.last > FIRSTSEEN_PRUNE_MS) {
      delete data.firstSeen[d];
      removed++;
    }
  }
  if (removed) _save(data);
  return removed;
};

module.exports = {
  DEFAULTS,
  DAY,
  getGlobal,
  getEffective,
  getOverrides,
  update,
  resetGroup,
  resetGlobal,
  ensureFirstSeen,
  getFirstSeen,
  pruneFirstSeen,
  parseDuration: _parseDuration,
  fmtDuration: _fmtDuration,
  validate: _validate,
};
