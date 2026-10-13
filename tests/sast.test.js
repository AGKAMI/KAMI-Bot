/**
 * utils/sast tests — epoch math must be pure UTC+2 (no container TZ, no
 * ICU), display helpers must force Africa/Johannesburg via Intl, and
 * cpmData must stay a thin delegate (single source of truth).
 *
 * Run: node --test --test-force-exit tests/sast.test.js
 */

const test = require('node:test');
const assert = require('node:assert');

const sast = require('../utils/sast');
const cpmData = require('../commands/crew/cpmData');

const curYear = sast.parts().year;
const yr = (y) => (y === curYear ? '' : ` ${y}`);
const weekday = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

test('parts/todayISO/clock read SAST regardless of machine TZ', () => {
  // 13 Oct 2026 22:06 UTC = 14 Oct 2026 00:06 SAST — the exact window
  // where the container's UTC date disagrees with South Africa's
  const t = Date.UTC(2026, 9, 13, 22, 6);
  assert.strictEqual(sast.todayISO(t), '2026-10-14');
  assert.strictEqual(sast.clock(t), '00:06');
  const p = sast.parts(t);
  assert.strictEqual(p.year, 2026);
  assert.strictEqual(p.month, 10);
  assert.strictEqual(p.day, 14);
  assert.strictEqual(p.hours, 0);
  assert.strictEqual(p.minutes, 6);
});

test('epochOf is the inverse of todayISO/clock (SAST anchor)', () => {
  const t = Date.UTC(2026, 9, 13, 22, 6); // 14 Oct 00:06 SAST
  const iso = sast.todayISO(t);
  const hhmm = sast.clock(t);
  assert.strictEqual(iso, '2026-10-14');
  assert.strictEqual(hhmm, '00:06');
  assert.strictEqual(sast.epochOf(iso, hhmm), t);
  // a host typing 20:30 on that date means SA 20:30, not UTC 20:30
  assert.strictEqual(sast.epochOf('2026-10-14', '20:30'), Date.UTC(2026, 9, 14, 20, 30) - 2 * 3600 * 1000);
});

test('dateLabel: weekday day month, year only when it differs', () => {
  assert.strictEqual(sast.dateLabel('2026-01-01'), `Thu 1 Jan${yr(2026)}`);
  assert.strictEqual(sast.dateLabel('2026-12-31'), `Thu 31 Dec${yr(2026)}`);
  const future = `${curYear + 5}-03-05`;
  assert.strictEqual(sast.dateLabel(future), `${weekday(future)} 5 Mar ${curYear + 5}`);
  assert.strictEqual(sast.dateLabel(null), null);
  assert.strictEqual(sast.dateLabel('bogus'), null);
});

test('fmtTime/fmtDate force SAST through Intl', () => {
  const t = Date.UTC(2026, 9, 13, 22, 6); // SAST clock says 00:06 on the 14th
  assert.match(sast.fmtTime(t), /00:06/);
  assert.match(sast.fmtDate(t), /(2026.*10.*14)|(14.*10.*2026)/);
  assert.ok(sast.fmtDateTime(t).length > 0);
  // opts + locale pass through (the welcome/goodbye en-US long form)
  const long = sast.fmtDate(t, { month: 'long', day: 'numeric', year: 'numeric' }, 'en-US');
  assert.ok(long.includes('October') && long.includes('14'), long);
});

test('isoDaysAgo/isoMonthsAgo shift the SAST calendar with clamping', () => {
  const t = Date.UTC(2026, 2, 31, 12); // 31 Mar 2026 (SAST: 14:00)
  assert.strictEqual(sast.isoDaysAgo(7, t), '2026-03-24');
  assert.strictEqual(sast.isoMonthsAgo(1, t), '2026-02-28'); // non-leap Feb clamp
  const jan = Date.UTC(2026, 0, 15, 10);
  assert.strictEqual(sast.isoMonthsAgo(2, jan), '2025-11-15'); // crosses year
  assert.strictEqual(sast.isoDaysAgo(7, jan), '2026-01-08');
});

test('minutesUntil counts against the SAST wall clock', () => {
  // Derive from clock() so the assertion stays honest about what "now" is
  const p = sast.parts();
  const nowMins = p.hours * 60 + p.minutes;
  const d = sast.minutesUntil('23:59');
  const expect = (23 * 60 + 59 - nowMins + 1440) % 1440 || 1440;
  assert.strictEqual(d, expect);
  assert.ok(d >= 1 && d <= 1440);
});

test('cpmData delegates to utils/sast (single source of truth)', () => {
  assert.strictEqual(cpmData.todayISO, sast.todayISO);
  assert.strictEqual(cpmData.fmtCardDate('2026-01-01'), sast.dateLabel('2026-01-01'));
  // resolveEventDate picks against the SAST year and never lands in the past
  const p = sast.parts();
  assert.strictEqual(cpmData.resolveEventDate(p.month, p.day), sast.todayISO());
  const pastMonth = p.month === 1 ? 12 : p.month - 1;
  assert.ok(cpmData.resolveEventDate(pastMonth, 15) > sast.todayISO(), 'earlier-in-year rolls forward');
  assert.strictEqual(cpmData.daysInMonth(2028, 2), 29); // leap year math stays local-clean
});
