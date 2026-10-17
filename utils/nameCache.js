/**
 * Display-name cache — learns every user's WhatsApp pushName from incoming
 * messages so commands can show "Tapiwa" instead of a raw jid/lid.
 *
 * who(jid) is the display helper: returns the cached name when known, else a
 * short masked label ("user …223"). NEVER returns a raw jid or lid.
 *
 * True LRU: a Map's insertion order is used as the recency order — every
 * remember()/get() hit re-inserts the key, and overflow evicts the oldest
 * (least-recently-used) entries. The old implementation evicted in pure
 * insertion order and never refreshed on read, so a burst of new contacts
 * evicted frequently-used names.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../database/nameCache.json');
const MAX_ENTRIES = 5000;
const FLUSH_MS = 60 * 1000;

// Map preserves insertion order → first key = least recently used
let cache = new Map();
try {
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
  for (const [k, v] of Object.entries(raw)) cache.set(k, v);
} catch {
  cache = new Map();
}

let dirty = false;

const _evict = () => {
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
};

// Bump recency: delete + re-insert moves the key to the end (most recent)
const _touch = (key) => {
  const v = cache.get(key);
  if (v === undefined) return undefined;
  cache.delete(key);
  cache.set(key, v);
  return v;
};

// key = jid with device suffix stripped (2783…:12@s.whatsapp.net → 2783…@s.whatsapp.net)
const keyOf = (jid) => String(jid || '').split(':')[0];

const remember = (jid, name) => {
  if (!jid || !name || typeof name !== 'string') return;
  const key = keyOf(jid);
  if (!key) return;
  if (cache.get(key) === name) { _touch(key); return; }
  cache.delete(key);
  cache.set(key, name);
  dirty = true;
  _evict();
};

// exact key (recency-bumped), then match by user digits across lid/pn servers
const get = (jid) => {
  if (!jid) return null;
  const key = keyOf(jid);
  const hit = _touch(key);
  if (hit) return hit;
  const user = key.split('@')[0].replace(/\D/g, '');
  if (!user) return null;
  for (const [k, v] of cache) {
    if (k.split('@')[0].replace(/\D/g, '') === user) {
      _touch(k); // found via digit match — bump it too
      return v;
    }
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
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(cache)));
    fs.renameSync(tmp, FILE);
    dirty = false;
  } catch (e) {
    console.error('[NAMECACHE] flush failed:', e.message);
  }
};

setInterval(flush, FLUSH_MS).unref();
process.on('exit', flush);

module.exports = { remember, get, who, flush };
