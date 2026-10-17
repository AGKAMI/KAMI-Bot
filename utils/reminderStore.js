// utils/reminderStore.js — persistent .remind scheduling
// Reminders used to live in plain in-memory Maps inside commands/general/
// remind.js — a restart lost every pending timer. This store persists them
// to database/reminders.json and re-schedules on boot (overdue ones fire
// immediately). remind.js registers the fire handler at module load; index.js
// calls restore(sock) once the socket is open.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'database', 'reminders.json');

let cache = {};   // id → { id, chatJid, sender, targetJids, message, dueAt, ms, amount, fullUnit, setAt }
let timers = {};  // id → Timeout
let sockRef = null;
let fireFn = null;

try {
  cache = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
} catch {
  cache = {};
}

const save = () => {
  try {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    console.error('[REMINDER-STORE] save failed:', e.message);
  }
};

const _fire = async (id) => {
  const r = cache[id];
  if (!r) return;
  delete timers[id];
  delete cache[id];
  save();
  if (!fireFn || !sockRef) return;
  try {
    const late = Date.now() > r.dueAt + 5000;
    await fireFn(sockRef, r, { late });
  } catch (e) {
    console.error('[REMINDER-STORE] fire failed:', e.message);
  }
};

const _schedule = (r) => {
  if (timers[r.id]) return; // already scheduled (reconnect-safe)
  const delay = Math.max(0, r.dueAt - Date.now());
  timers[r.id] = setTimeout(() => { _fire(r.id); }, delay);
  // Cap is 7 days — well under the 24.8-day setTimeout ceiling — but keep
  // the timer referenced so a long reminder isn't GC'd.
  if (timers[r.id]?.unref) timers[r.id].unref();
};

const setFireHandler = (fn) => { fireFn = fn; };

const add = (sock, r) => {
  if (sock) sockRef = sock;
  cache[r.id] = { ...r, setAt: r.setAt || Date.now() };
  save();
  _schedule(cache[r.id]);
};

const cancel = (id) => {
  if (timers[id]) { clearTimeout(timers[id]); delete timers[id]; }
  const existed = !!cache[id];
  delete cache[id];
  save();
  return existed;
};

const get = (id) => cache[id] || null;

const listForGroup = (chatJid) =>
  Object.values(cache)
    .filter(r => r.chatJid === chatJid)
    .sort((a, b) => a.dueAt - b.dueAt);

// Called from index.js on every 'open'. Updates sockRef and schedules any
// reminder that isn't already timed (reconnect-safe); overdue ones fire now.
const restore = (sock) => {
  if (sock) sockRef = sock;
  for (const r of Object.values(cache)) {
    _schedule(r);
  }
};

module.exports = { setFireHandler, add, cancel, get, listForGroup, restore };
