/**
 * kickSettings — auto-kick policy tests.
 * Covers the 14-day / instant-grace policy: window 14d, grace 0 (settable
 * via config AND via the `set grace 0` command path), minMessages 1.
 * Mutations to database/kickConfig.json are snapshotted + restored.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const DB = path.join(__dirname, '..', 'database', 'kickConfig.json');
const SNAPSHOT = fs.existsSync(DB) ? fs.readFileSync(DB) : null;

const kickSettings = require('../utils/kickSettings');

const DAY = 24 * 60 * 60 * 1000;

test.after(() => {
  if (SNAPSHOT !== null) fs.writeFileSync(DB, SNAPSHOT);
  else if (fs.existsSync(DB)) fs.unlinkSync(DB);
});

// ── Defaults = the shipped policy ─────────────────────────────────────
test('defaults: 14d window, instant grace, 1 msg, 7d cooldown, cap 10', () => {
  assert.strictEqual(kickSettings.DEFAULTS.inactiveWindow, 14 * DAY);
  assert.strictEqual(kickSettings.DEFAULTS.gracePeriod, 0);
  assert.strictEqual(kickSettings.DEFAULTS.minMessages, 1);
  assert.strictEqual(kickSettings.DEFAULTS.noticeCooldown, 7 * DAY);
  assert.strictEqual(kickSettings.DEFAULTS.maxKicksPerCycle, 10);
});

// ── grace validation (0 allowed, everything sane still parses) ────────
test('validate grace: 0 / 0d / 0 days accepted as instant', () => {
  assert.deepStrictEqual(kickSettings.validate('gracePeriod', '0'), { ok: true, value: 0 });
  assert.deepStrictEqual(kickSettings.validate('gracePeriod', '0d'), { ok: true, value: 0 });
  assert.deepStrictEqual(kickSettings.validate('gracePeriod', '0 days'), { ok: true, value: 0 });
  assert.deepStrictEqual(kickSettings.validate('gracePeriod', 0), { ok: true, value: 0 });
});

test('validate grace: normal durations still work, negatives rejected', () => {
  assert.deepStrictEqual(kickSettings.validate('gracePeriod', '7d'), { ok: true, value: 7 * DAY });
  assert.deepStrictEqual(kickSettings.validate('gracePeriod', '2w'), { ok: true, value: 14 * DAY });
  assert.strictEqual(kickSettings.validate('gracePeriod', '-1').ok, false);
  assert.strictEqual(kickSettings.validate('gracePeriod', 'banana').ok, false);
  assert.strictEqual(kickSettings.validate('gracePeriod', '100d').ok, false); // > 90d max
});

test('validate window: zero not allowed (min 1d), 14d accepted', () => {
  assert.strictEqual(kickSettings.validate('inactiveWindow', '0').ok, false);
  assert.deepStrictEqual(kickSettings.validate('inactiveWindow', '14d'), { ok: true, value: 14 * DAY });
});

// ── fmtDuration surface (dashboard/previews) ──────────────────────────
test('fmtDuration: 0 → "0 days", 14d → "2 weeks" (week granularity)', () => {
  assert.strictEqual(kickSettings.fmtDuration(0), '0 days');
  assert.strictEqual(kickSettings.fmtDuration(14 * DAY), '2 weeks');
  assert.strictEqual(kickSettings.fmtDuration(7 * DAY), '1 week');
});

// ── update() round-trip through the real file (restored in after) ─────
test('update global grace 0 persists and reads back', () => {
  const res = kickSettings.update('global', { gracePeriod: '0' });
  assert.strictEqual(res.ok, true, res.error);
  assert.strictEqual(kickSettings.getGlobal().gracePeriod, 0);
});

test('update group override grace 0 merges into getEffective', () => {
  const gid = '120363000000000000@g.us';
  const res = kickSettings.update(gid, { gracePeriod: '0', inactiveWindow: '7d' });
  assert.strictEqual(res.ok, true, res.error);
  const eff = kickSettings.getEffective(gid);
  assert.strictEqual(eff.gracePeriod, 0);
  assert.strictEqual(eff.inactiveWindow, 7 * DAY);
  kickSettings.resetGroup(gid);
  assert.strictEqual(kickSettings.getEffective(gid).inactiveWindow, 14 * DAY);
});
