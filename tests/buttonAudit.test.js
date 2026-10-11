/**
 * Button audit — every button the bot can send must actually work.
 *
 * Phase A: inventory — scan all sources for button ids (static + template
 *          prefixes) and prove each resolves to a registered handler.
 * Phase B: simulated taps — drive handleButtonResponse with a mock sock,
 *          assert consumption, delivery, and the 10-button cap per message.
 * Phase B2: again: network/mutating ids — validate + command exists + gates,
 *           without executing (no API hammering, no state mutation).
 * Phase C: forged taps — non-owner/non-admin must be rejected, not executed.
 * Phase D: cta_url buttons must carry a valid http(s) URL.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  handleButtonResponse,
  listButtonHandlers,
  getLastHandlerPromise,
} = require('../utils/buttonHelper');
const { validate, passesGates } = require('../utils/againDispatch');
const { loadCommands } = require('../utils/commandLoader');

// handler.js registers requireAdmin('admin') — the global admin tap gate.
// Without this the audit would under-test every admin:* id.
require('../handler');

// Load every command file so all onButton registrations exist
loadCommands();

const CMD = loadCommands();

// ── Scanner ──────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}

function scanSources() {
  const files = [
    ...walk(path.join(__dirname, '..', 'commands')),
    ...walk(path.join(__dirname, '..', 'utils')),
    path.join(__dirname, '..', 'handler.js'),
  ];
  const staticIds = new Set();
  const dynamicPrefixes = new Set();
  const urls = [];
  const ID_RE = /(?<![a-zA-Z0-9_.])id:\s*'([^']+)'/g;
  const IDQ_RE = /(?<![a-zA-Z0-9_.])id:\s*"([^"]+)"/g;
  const IDT_RE = /(?<![a-zA-Z0-9_.])id:\s*`([^`]*)`/g;
  const URL_RE = /url:\s*'(https?:\/\/[^']+)'/g;
  const SAFE = /^[a-z][a-z0-9:._-]*$/i;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const re of [ID_RE, IDQ_RE]) {
      for (const m of src.matchAll(re)) {
        if (m[1].includes(':') && SAFE.test(m[1]) && !m[1].includes('${')) {
          staticIds.add(m[1]);
        }
      }
    }
    for (const m of src.matchAll(IDT_RE)) {
      const v = m[1];
      if (!v.includes('${')) {
        if (v.includes(':') && SAFE.test(v)) staticIds.add(v);
        continue;
      }
      const prefix = v.slice(0, v.indexOf('${'));
      if (prefix.includes(':') || prefix.endsWith(':')) dynamicPrefixes.add(prefix);
    }
    for (const m of src.matchAll(URL_RE)) urls.push({ file: path.basename(f), url: m[1] });
  }
  return { staticIds: [...staticIds], dynamicPrefixes: [...dynamicPrefixes], urls };
}

// Mirror of handleButtonResponse resolution (exact, then longest prefix)
function resolve(btnId) {
  const keys = listButtonHandlers();
  if (keys.includes(btnId)) return btnId;
  let best = null;
  let bestLen = -1;
  for (const k of keys) {
    const p = k.endsWith(':') ? k : k + ':';
    if (btnId.startsWith(p) && p.length > bestLen) {
      bestLen = p.length;
      best = k;
    }
  }
  return best;
}

// ── Mock transport ───────────────────────────────────────────────────
function mkSock(sent) {
  return {
    sendMessage: async (jid, content, opts) => {
      sent.push({ jid, content, opts });
      return { key: { id: 'm' + sent.length, remoteJid: jid } };
    },
    relayMessage: async (jid, message) => {
      const findIm = (obj, d = 0) => {
        if (!obj || typeof obj !== 'object' || d > 8) return null;
        if (obj.body && obj.nativeFlowMessage) return obj;
        for (const v of Object.values(obj)) {
          const f = findIm(v, d + 1);
          if (f) return f;
        }
        return null;
      };
      const im = findIm(message);
      const rows = (im && im.nativeFlowMessage && im.nativeFlowMessage.buttons) || [];
      const buttons = rows.map(r => {
        try {
          const p = JSON.parse(r.buttonParamsJson || '{}');
          return { id: p.id, text: p.display_text, url: p.url };
        } catch (e) { return {}; }
      });
      sent.push({
        jid,
        content: { buttons, text: (im && im.body && im.body.text) || '' },
        opts: { relayed: true },
      });
      return { key: { id: 'r' + sent.length } };
    },
    groupMetadata: async () => { throw new Error('mock: not a group'); },
    groupInviteCode: async () => { throw new Error('mock: not a group'); },
  };
}

let tapSeq = 0;

function mkTap(btnId, { from = '111111111111@s.whatsapp.net', fromMe = true, inGroup = false } = {}) {
  const jid = inGroup ? '12345-67890@g.us' : from;
  return {
    key: { remoteJid: jid, fromMe, participant: inGroup ? from : null },
    pushName: 'audit',
    message: { templateButtonReplyMessage: { selectedId: btnId } },
  };
}

async function tap(btnId, opts = {}) {
  const sent = [];
  const sock = mkSock(sent);
  // Unique chat per tap: the again: dispatcher and sendButtons rate-limiters
  // are per-chat — reusing one jid would silently drop rapid sequential taps.
  const from = opts.from || `${1000000000 + (tapSeq++)}@s.whatsapp.net`;
  const msg = mkTap(btnId, { ...opts, from });
  const consumed = await handleButtonResponse(sock, msg, async () => opts.isAdmin === true);
  if (consumed) await getLastHandlerPromise();
  return { consumed, sent };
}

// ── Phase A: every button id resolves ────────────────────────────────
test('A: every button id in the codebase resolves to a live handler', () => {
  const { staticIds, dynamicPrefixes } = scanSources();
  const keys = listButtonHandlers();
  assert.ok(keys.length > 50, `expected many handlers, got ${keys.length}`);
  const unresolved = [];
  for (const id of staticIds) {
    if (!resolve(id)) unresolved.push(id);
  }
  for (const p of dynamicPrefixes) {
    if (!resolve(p + 'probe123')) unresolved.push(p + '<dynamic>');
  }
  assert.deepStrictEqual(unresolved, [], `unroutable button ids:\n  ${unresolved.join('\n  ')}`);
  assert.ok(staticIds.length > 80, `expected broad inventory, got ${staticIds.length}`);
});

// ── Phase B: safe simulated taps ─────────────────────────────────────
const SAFE_TAPS = [
  'menu:back:main', 'menu:back:more', 'menu:more', 'menu:general', 'menu:ai',
  'menu:media', 'menu:fun', 'menu:games', 'menu:utility', 'menu:anime',
  'menu:textmaker', 'menu:admin', 'menu:owner',
  'owner:hub', 'owner:hub:anticall', 'owner:hub:mode', 'owner:hub:autoreact',
  'owner:hub:dmblocker',
  'admin:hub', 'admin:hub:2', 'admin:hub:3', 'admin:hub:4',
  'admin:hub:go:antilink', 'admin:hub:go:welcome', 'admin:hub:go:rules',
  'kickcfg:main',
  'games:rps:play:rock', 'games:rps:play:paper', 'games:rps:play:scissors',
  'games:tod:play:truth', 'games:tod:play:dare',
  'again:dice', 'again:dice:20', 'again:dice:100',
  'again:coinflip', 'again:slots', 'again:wouldyourather',
];

test('B: every safe button tap is consumed, delivers a reply, and respects the 10-button cap', async () => {
  const failures = [];
  for (const id of SAFE_TAPS) {
    try {
      const { consumed, sent } = await tap(id);
      if (!consumed) { failures.push(`${id}: NOT consumed (no handler)`); continue; }
      if (sent.length === 0) failures.push(`${id}: consumed but sent nothing`);
      for (const s of sent) {
        const n = s.content && s.content.buttons ? s.content.buttons.length : 0;
        if (n > 10) failures.push(`${id}: sent ${n} buttons (cap 10)`);
      }
    } catch (e) {
      failures.push(`${id}: threw ${e.message}`);
    }
  }
  assert.deepStrictEqual(failures, [], failures.join('\n'));
});

// ── Phase B2: again: ids that hit APIs or mutate state ───────────────
test('B2: network/mutating again: ids validate, exist, and pass gates', async () => {
  const dmIds = [
    'again:joke', 'again:truth', 'again:dare', 'again:meme', 'again:pies:india',
    'again:waifu', 'again:neko', 'again:random', 'again:konachan',
  ];
  // events/attend are groupOnly — gates must PASS in a group, FAIL in a DM
  const groupIds = ['again:events', 'again:attend:1', 'again:attend:2'];
  const sock = mkSock([]);
  const dmMsg = mkTap('x', { fromMe: true });
  for (const id of dmIds) {
    const parsed = validate(id);
    assert.ok(parsed, `${id}: validate() rejected`);
    const cmd = CMD.get(parsed.name);
    assert.ok(cmd, `${id}: command ${parsed.name} not loaded`);
    assert.strictEqual(typeof cmd.execute, 'function', `${id}: no execute()`);
    assert.ok(await passesGates(cmd, sock, dmMsg, '111111111111@s.whatsapp.net', '111111111111@s.whatsapp.net'),
      `${id}: passesGates failed for owner in DM`);
  }
  for (const id of groupIds) {
    const parsed = validate(id);
    assert.ok(parsed, `${id}: validate() rejected`);
    const cmd = CMD.get(parsed.name);
    assert.ok(cmd && typeof cmd.execute === 'function', `${id}: command missing`);
    const g = '999888777666@g.us';
    assert.ok(await passesGates(cmd, sock, dmMsg, g, g), `${id}: passesGates failed in group`);
    assert.strictEqual(await passesGates(cmd, sock, dmMsg, '111111111111@s.whatsapp.net', '111111111111@s.whatsapp.net'),
      false, `${id}: groupOnly command must FAIL in DM`);
  }
});

// ── Phase C: forged taps must be rejected ────────────────────────────
test('C: forged non-owner taps on owner surfaces are rejected, not executed', async () => {
  for (const id of ['owner:hub', 'owner:hub:anticall:on', 'kickcfg:main']) {
    const { consumed, sent } = await tap(id, { fromMe: false, isAdmin: false });
    assert.strictEqual(consumed, true, `${id}: should be consumed (rejected)`);
    assert.ok(sent.length > 0, `${id}: rejection should notify`);
    assert.match(sent[0].content.text || '', /OWNER ONLY/, `${id}: expected OWNER ONLY notice`);
    assert.ok(!(sent[0].content.buttons || []).some(b => b.id && b.id.startsWith('owner:hub:anticall') && b.text.includes('On') === false && b.id === id),
      `${id}: must not render the panel`);
  }
});

test('C: forged non-admin taps on admin surfaces are rejected', async () => {
  for (const id of ['admin:hub', 'admin:hub:go:antilink', 'admin:antilink:on']) {
    const { consumed, sent } = await tap(id, { fromMe: false, isAdmin: false, inGroup: true });
    assert.strictEqual(consumed, true, `${id}: should be consumed (rejected)`);
    assert.ok(sent.length > 0, `${id}: rejection should notify`);
    assert.match(sent[0].content.text || '', /ADMIN ONLY/, `${id}: expected ADMIN ONLY notice`);
  }
});

test('C: menu:admin is gated — non-admin sees ADMINS ONLY, not the list', async () => {
  const { consumed, sent } = await tap('menu:admin', { fromMe: false, isAdmin: false, inGroup: true });
  assert.strictEqual(consumed, true);
  assert.match(sent[0].content.text || '', /ADMINS ONLY/);
  assert.ok(!(sent[0].content.text || '').includes('Antilink'), 'must not leak the admin list');
});

test('C: menu:owner is gated — non-owner sees KAMI ONLY', async () => {
  const { consumed, sent } = await tap('menu:owner', { fromMe: false, isAdmin: false, inGroup: true });
  assert.strictEqual(consumed, true);
  assert.match(sent[0].content.text || '', /KAMI ONLY/);
});

test('C: non-allowlisted again: taps are silently dropped (ban, setprefix, NSFW)', async () => {
  for (const id of ['again:ban', 'again:setprefix', 'again:hwaifu', 'again:hneko', 'again:8ball']) {
    assert.strictEqual(validate(id), null, `${id} must NOT be allowlisted`);
  }
});

// ── Phase D: cta_url buttons ─────────────────────────────────────────
test('D: every cta_url in the codebase is a valid http(s) URL', () => {
  const { urls } = scanSources();
  const bad = urls.filter(u => !/^https:\/\/[a-z0-9.-]+/i.test(u.url));
  assert.deepStrictEqual(bad, [], `malformed urls: ${JSON.stringify(bad)}`);
  assert.ok(urls.length > 0, 'expected at least some cta_url buttons');
});
