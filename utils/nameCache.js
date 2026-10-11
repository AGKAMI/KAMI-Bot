/**
 * Display-name cache — learns every user's WhatsApp pushName from incoming
 * messages so commands can show "Tapiwa" instead of a raw jid/lid.
 *
 * who(jid) is the display helper: returns the cached name when known, else a
 * short masked label ("user …223"). NEVER returns a raw jid or lid.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../database/nameCache.json');
const MAX_ENTRIES = 5000;
const FLUSH_MS = 60 * 1000;

let cache = {};
try {
  cache = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
} catch {
  cache = {};
}

let dirty = false;

// key = jid with device suffix stripped (2783…:12@s.whatsapp.net → 2783…@s.whatsapp.net)
const keyOf = (jid) => String(jid || '').split(':')[0];

const remember = (jid, name) => {
  if (!jid || !name || typeof name !== 'string') return;
  const key = keyOf(jid);
  if (!key || cache[key] === name) return;
  cache[key] = name;
  dirty = true;
  const keys = Object.keys(cache);
  if (keys.length > MAX_ENTRIES) {
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete cache[k];
  }
};

// exact key, then match by user digits across lid/pn servers
const get = (jid) => {
  if (!jid) return null;
  const key = keyOf(jid);
  if (cache[key]) return cache[key];
  const user = key.split('@')[0].replace(/\D/g, '');
  if (!user) return null;
  for (const [k, v] of Object.entries(cache)) {
    if (k.split('@')[0].replace(/\D/g, '') === user) return v;
  }
  return null;
};

// Friendly label for a person — name when known, else "user …223".
// Group/jid servers (@g.us etc) fall through to the raw prefix (not a person).
const who = (jid) => {
  if (!jid) return 'someone';
  const s = String(jid);
  if (s.includes('@g.us') || s.includes('@newsletter') || s.includes('@broadcast')) {
    return s.split('@')[0];
  }
  const name = get(jid);
  if (name) return name;
  const user = s.split('@')[0].split(':')[0].replace(/\D/g, '');
  return user ? `user …${user.slice(-3)}` : 'someone';
};

const flush = () => {
  if (!dirty) return;
  try {
    fs.writeFileSync(FILE, JSON.stringify(cache));
    dirty = false;
  } catch (e) {
    console.error('[NAMECACHE] flush failed:', e.message);
  }
};

setInterval(flush, FLUSH_MS).unref();
process.on('exit', flush);

module.exports = { remember, get, who, flush };
