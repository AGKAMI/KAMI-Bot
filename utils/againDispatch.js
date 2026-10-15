/**
 * Generic Again/replay button dispatcher.
 * One 'again:' prefix handler re-runs any allowlisted target-less command
 * with args encoded in the button id:
 *
 *   again:<cmd>            → re-run with no args   (again:neko)
 *   again:<cmd>:<arg>      → re-run with args      (again:dice:20)
 *
 * Rules (final-judge edge register):
 * - Allowlist only TARGET-LESS commands — tap messages carry no mentions, so
 *   ship/flirt/insult/compliment/gayrate/8ball are excluded (targets/question
 *   would be silently lost).
 * - Args whitelist-validated (^ [a-z0-9] {1,20}$) — never trust btnId (F4).
 * - 2s per-chat cooldown (F11/edge#19): image results pay a 3s post-image
 *   delay + the 500ms interactive limiter; rapid Again taps would degrade to
 *   plain text. Duplicate taps within the window are dropped silently.
 * - Programmatic execute() BYPASSES handler.js permission gates (edge#22) —
 *   the dispatcher re-checks groupOnly/adminOnly/ownerOnly itself.
 * - commandLoader re-reads the fs per call — the map is memoized here once.
 */

const config = require('../config');
const { onButton, isOwnerJid } = require('./buttonHelper');

const COOLDOWN_MS = 2000;
const lastAgain = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [jid, ts] of lastAgain) {
    if (now - ts > 300000) lastAgain.delete(jid);
  }
}, 300000).unref();

// Target-less, zero-or-fixed-arg commands safe to re-run from a tap.
const ALLOW = new Set([
  // games
  'dice', 'coinflip', 'slots', 'truthordare', 'wouldyourather',
  // fun
  'joke', 'meme', 'truth', 'dare', 'pies',
  // anime (SFW only — NSFW stays typed-only permanently)
  'waifu', 'neko', 'random', 'konachan',
  // crew — events list + RSVP toggle (number encoded in id)
  'events', 'attend',
]);

const ARG_RE = /^[a-z0-9]{1,20}$/i;

let _cmds = null;
function getCommand(name) {
  if (!_cmds) {
    const { loadCommands } = require('./commandLoader');
    _cmds = loadCommands();
  }
  return _cmds.get(name) || null;
}

/**
 * Minimal commandExtra mirroring the fields handler.js builds — enough for
 * the allowlisted one-shots (they use reply/fail; isGroup for guards).
 */
function buildExtra(sock, msg, from, sender) {
  return {
    from,
    sender,
    isGroup: from.endsWith('@g.us'),
    pushName: msg.pushName || '',
    reply: (text, opts) => sock.sendMessage(from, { text, ...(opts || {}) }, { quoted: msg }),
    fail: () => {},
    deny: () => {},
  };
}

/** Parse+validate a btnId → { name, args } or null. Exported for tests. */
function validate(btnId) {
  if (typeof btnId !== 'string' || !btnId.startsWith('again:')) return null;
  const parts = btnId.slice('again:'.length).split(':').filter(Boolean);
  const name = parts[0] ? parts[0].toLowerCase() : '';
  const args = parts.slice(1);
  if (!name || !ALLOW.has(name)) return null;
  if (args.some(a => !ARG_RE.test(a))) return null;
  return { name, args };
}

/** Re-check command flags execute() would otherwise bypass. */
async function passesGates(cmd, sock, msg, from, sender) {
  if (cmd.ownerOnly && !isOwnerJid(msg, sender)) return false;
  if (cmd.groupOnly && !from.endsWith('@g.us')) return false;
  if (cmd.adminOnly && from.endsWith('@g.us') && !isOwnerJid(msg, sender)) {
    try {
      const meta = await sock.groupMetadata(from);
      const { findParticipant } = require('./jidHelper');
      const part = findParticipant(meta.participants || [], [sender]);
      if (!part || !part.admin) return false;
    } catch (e) {
      return false;
    }
  }
  return true;
}

onButton('again:', async (sock, msg, from, sender, btnId) => {
  const now = Date.now();
  const last = lastAgain.get(from) || 0;
  if (now - last < COOLDOWN_MS) return; // drop duplicate rapid taps
  lastAgain.set(from, now);

  const parsed = validate(btnId);
  if (!parsed) return;

  const cmd = getCommand(parsed.name);
  if (!cmd || typeof cmd.execute !== 'function') return;
  if (!(await passesGates(cmd, sock, msg, from, sender))) return;

  try {
    await cmd.execute(sock, msg, parsed.args, buildExtra(sock, msg, from, sender));
  } catch (e) {
    console.error('[again] dispatch error:', e.message);
  }
});

/**
 * Run-buttons for a category: the allowlisted, zero-arg commands in that
 * category, as ▶️ tap-to-run buttons. Menu submenus attach these so the
 * user taps instead of typing. Only allowlisted commands qualify (target-
 * less, SFW-only for anime); anything needing an argument stays text so the
 * user can't fire a half-specified command. Capped so run buttons + nav
 * buttons never exceed the 10-per-message nativeFlow limit.
 *
 * MENU_EXCLUDE: mutations that are fine as an Again-replay but a footgun on
 * an exploratory menu tap — `attend` with no args silently RSVPs to the
 * first/only event; the events list carries its own numbered RSVP buttons.
 */
const MENU_EXCLUDE = new Set(['attend']);

function buildRunButtons(category, reserved = 0) {
  if (!_cmds) {
    const { loadCommands } = require('./commandLoader');
    _cmds = loadCommands();
  }
  const out = [];
  for (const [name, cmd] of _cmds) {
    if (cmd.category !== category || !ALLOW.has(name) || MENU_EXCLUDE.has(name)) continue;
    out.push({ id: `again:${name}`, text: `▶️ ${name}` });
  }
  out.sort((a, b) => a.text.localeCompare(b.text));
  return out.slice(0, Math.max(0, 10 - reserved));
}

module.exports = { ALLOW, validate, buildExtra, passesGates, buildRunButtons };
