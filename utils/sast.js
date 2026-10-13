/**
 * SAST (Africa/Johannesburg — UTC+2, no DST) time utilities.
 *
 * The bot container runs UTC (verified live: `date` → UTC, Intl → 'UTC'),
 * so every wall-clock in this codebase must either go through here or
 * pass `timeZone` explicitly — otherwise it renders 2h behind South
 * Africa. index.js also sets process.env.TZ at boot as a global backstop
 * for unaudited local-time code; these helpers stay TZ-independent so
 * they're correct everywhere (Windows dev/tests ignore process.env.TZ).
 *
 * Epoch math (parts/todayISO/epochOf/minutesUntil/dateLabel/clock) is
 * pure UTC+2 arithmetic — no ICU, no container TZ. Display helpers
 * (fmtDate/fmtTime/fmtDateTime) use Intl with `timeZone` forced to SAST
 * and a manual +2 fallback for hosts without full ICU (the
 * giveaway.js formatEndTime pattern).
 */

const TZ = 'Africa/Johannesburg';
const OFFSET_MS = 2 * 60 * 60 * 1000; // SAST = UTC+2, no DST
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad2 = (n) => String(n).padStart(2, '0');

// Wall-clock parts of an epoch, read in SAST
function parts(ms = Date.now()) {
  const d = new Date(ms + OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

// SAST calendar date as 'YYYY-MM-DD' — lexicographically sortable, and
// the date South Africans are actually on (differs from the container's
// UTC date during 00:00–01:59 SAST)
const todayISO = (ms = Date.now()) => {
  const p = parts(ms);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
};

// SAST wall clock as 'HH:MM'
const clock = (ms = Date.now()) => {
  const p = parts(ms);
  return `${pad2(p.hours)}:${pad2(p.minutes)}`;
};

// 'YYYY-MM-DD' + 'HH:MM' (SAST) → epoch ms — inverse of todayISO/clock.
// A host typing 20:30 means 20:30 in SA, so endAt must be this, never
// "20:30 on the container's local clock".
function epochOf(iso, hhmm) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const [h, mi] = String(hhmm).split(':').map(Number);
  return Date.UTC(y, m - 1, d, h || 0, mi || 0, 0, 0) - OFFSET_MS;
}

// 'YYYY-MM-DD' N days before the SAST date (day-of-month clamped)
const isoDaysAgo = (days, ms = Date.now()) => todayISO(ms - days * 86400000);

// 'YYYY-MM-DD' N calendar months before the SAST date (day-of-month clamped)
function isoMonthsAgo(months, ms = Date.now()) {
  const p = parts(ms);
  let y = p.year;
  let m = p.month - months;
  while (m < 1) { m += 12; y--; }
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad2(m)}-${pad2(Math.min(p.day, dim))}`;
}

// Minutes from SAST now until the next occurrence of HH:MM (same-day or
// overnight) — mirrors the original local-time minsUntil semantics
function minutesUntil(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const p = parts();
  const nowMins = p.hours * 60 + p.minutes;
  let delta = (h * 60 + m - nowMins + 1440) % 1440;
  if (delta === 0) delta = 1440;
  return delta;
}

// 'YYYY-MM-DD' → 'Thu 17 Oct' (+ year when it isn't the current SAST
// year). Weekday from the ISO's own components via Date.UTC — independent
// of both container TZ and ICU.
function dateLabel(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return null;
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const yr = y !== parts().year ? ` ${y}` : '';
  return `${wd} ${d} ${MONTHS[m - 1]}${yr}`;
}

// 'YYYY-MM-DD' + 'HH:MM' → '13 Oct 2026 22:06' (never elides the year)
function stamp(ms) {
  const p = parts(ms);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year} ${pad2(p.hours)}:${pad2(p.minutes)}`;
}

// ── Display helpers (Intl forced to SAST, +2h fallback) ─────
function fmtDate(ms, opts = {}, locale = 'en-ZA') {
  try {
    return new Date(ms).toLocaleDateString(locale, { timeZone: TZ, ...opts });
  } catch (e) {
    const p = parts(ms);
    return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
  }
}

function fmtTime(ms, opts = { hour: '2-digit', minute: '2-digit' }, locale = 'en-ZA') {
  try {
    return new Date(ms).toLocaleTimeString(locale, { timeZone: TZ, ...opts });
  } catch (e) {
    return clock(ms);
  }
}

function fmtDateTime(ms, opts = {}, locale = 'en-ZA') {
  try {
    return new Date(ms).toLocaleString(locale, { timeZone: TZ, ...opts });
  } catch (e) {
    return stamp(ms);
  }
}

module.exports = {
  TZ,
  OFFSET_MS,
  MONTHS,
  WEEKDAYS,
  pad2,
  parts,
  todayISO,
  isoDaysAgo,
  isoMonthsAgo,
  clock,
  epochOf,
  minutesUntil,
  dateLabel,
  stamp,
  fmtDate,
  fmtTime,
  fmtDateTime,
};
