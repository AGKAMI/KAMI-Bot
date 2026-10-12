/**
 * Event wizard tests — drive the real handleButtonResponse + captureText
 * with a mock sock. crew.json is snapshotted and restored around the
 * suite (tests dirty it — same convention as the picker arc).
 *
 * Run: node --test --test-force-exit tests/eventWizard.test.js
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CREW_DB = path.join(__dirname, '..', 'database', 'crew.json');
const CREW_SNAPSHOT = fs.existsSync(CREW_DB) ? fs.readFileSync(CREW_DB, 'utf8') : null;

// Registers requireAdmin('ewiz') + all ewiz:/evrsvp: handlers at boot
require('../handler');
const { handleButtonResponse, getLastHandlerPromise } = require('../utils/buttonHelper');
const eventWizard = require('../commands/crew/eventWizard');
const eventCmd = require('../commands/crew/event');
const database = require('../database');

const GROUP = '120363000000000001@g.us';
const HOST = '27800000001@s.whatsapp.net';
const OTHER = '27800000002@s.whatsapp.net';

function mkSock() {
  const sent = [];
  return {
    sent,
    user: { id: '27833882383:1@s.whatsapp.net' },
    async sendMessage(jid, content, opts) {
      sent.push({ jid, content, opts });
      return { key: { id: 'm' + sent.length, remoteJid: jid } };
    },
    async relayMessage(jid, message) {
      const findIm = (obj, d = 0) => {
        if (!obj || typeof obj !== 'object' || d > 8) return null;
        if (obj.body && obj.nativeFlowMessage) return obj;
        for (const v of Object.values(obj)) { const f = findIm(v, d + 1); if (f) return f; }
        return null;
      };
      const im = findIm(message);
      const rows = (im && im.nativeFlowMessage && im.nativeFlowMessage.buttons) || [];
      const buttons = rows.map(r => {
        try { const p = JSON.parse(r.buttonParamsJson || '{}'); return { id: p.id, text: p.display_text }; }
        catch (e) { return {}; }
      });
      sent.push({ jid, content: { buttons, text: (im && im.body && im.body.text) || '' }, opts: { relayed: true } });
      return { key: { id: 'r' + sent.length } };
    },
    async groupMetadata() { return { participants: [{ id: HOST, admin: 'admin' }, { id: OTHER, admin: null }] }; },
    async groupInviteCode() { return 'abc'; },
    updateBlockStatus: async () => {},
  };
}

function tapMsg(btnId, participant) {
  return {
    key: { remoteJid: GROUP, participant: participant || HOST, fromMe: false },
    pushName: 'test',
    message: { templateButtonReplyMessage: { selectedId: btnId } },
  };
}

async function tap(sock, btnId, { isAdmin = true, participant } = {}) {
  const consumed = await handleButtonResponse(sock, tapMsg(btnId, participant), async () => isAdmin);
  if (consumed) await getLastHandlerPromise();
  return consumed;
}

const textMsg = (body, sender) => ({
  key: { remoteJid: GROUP, participant: sender || HOST, fromMe: false },
  pushName: 'test',
  message: { conversation: body },
});

const settle = () => new Promise(r => setTimeout(r, 750)); // > render debounce + 500ms cooldown

test.after(() => {
  // Restore crew.json — tests may have written events into it
  if (CREW_SNAPSHOT !== null) fs.writeFileSync(CREW_DB, CREW_SNAPSHOT);
  else if (fs.existsSync(CREW_DB)) fs.unlinkSync(CREW_DB);
});

// ── Gates ──────────────────────────────────────────────────────────────
test('forged ewiz taps by non-admins are rejected at the router', async () => {
  const sock = mkSock();
  const consumed = await tap(sock, 'ewiz:ZZZZZZ:cancel', { isAdmin: false });
  assert.strictEqual(consumed, true, 'should be consumed (rejected)');
  assert.match(sock.sent[0].content.text, /ADMIN ONLY/, 'must reject with ADMIN ONLY');
});

test('stale ewiz taps (unknown nonce) get the gone-nudge, never silence', async () => {
  const sock = mkSock();
  const consumed = await tap(sock, 'ewiz:DEAD00:tpl:STANCE');
  assert.strictEqual(consumed, true);
  assert.match(sock.sent[0].content.text, /gone/, 'must explain the build is gone');
});

// ── Wizard happy path ──────────────────────────────────────────────────
test('full build: template → host → id → server → car → skip time → post', async () => {
  const sock = mkSock();

  // Start (bare !event → startWizard)
  await eventWizard.startWizard(sock, tapMsg('x'), { from: GROUP, sender: HOST });
  await settle();
  const s = [...eventWizard.sessions.values()].find(x => x.chatJid === GROUP);
  assert.ok(s, 'session created');
  assert.strictEqual(sock.sent.at(-1).content.buttons.length, 9, 'title step = 7 templates + custom + cancel');
  const nonce = s.nonce;

  // Title: pick STANCE
  await tap(sock, `ewiz:${nonce}:tpl:STANCE`);
  await settle();
  assert.ok(sock.sent.at(-1).content.text.includes('HOST'), 'host prompt after title');

  // Host via typed capture
  const ate = await eventWizard.captureText(sock, textMsg('AG KAMI'), { from: GROUP, sender: HOST, body: 'AG KAMI', isGroup: true });
  assert.strictEqual(ate, true, 'host text consumed');
  await settle();
  assert.ok(sock.sent.at(-1).content.text.includes('ROOM ID'), 'id prompt after host');

  // Garbage ID → strike; good ID → advance
  assert.strictEqual(await eventWizard.captureText(sock, textMsg('not an id!!'), { from: GROUP, sender: HOST, body: 'not an id!!', isGroup: true }), true);
  await settle();
  assert.match(sock.sent.at(-1).content.text, /VR401128/, 're-ask shows the ID example');
  assert.strictEqual(await eventWizard.captureText(sock, textMsg('vr 401128'), { from: GROUP, sender: HOST, body: 'vr 401128', isGroup: true }), true);
  await settle();
  assert.ok(sock.sent.at(-1).content.text.includes('SERVER'), 'server prompt after id');

  // Server: page 1 has 🇿🇦 pinned, tap it
  const srvMsg = sock.sent.at(-1);
  assert.ok(srvMsg.content.buttons[0].text.includes('AFRIKAANS'), 'home server pinned first');
  await tap(sock, srvMsg.content.buttons[0].id);
  await settle();
  assert.ok(sock.sent.at(-1).content.text.includes('CAR TYPE'), 'car prompt after server');

  // Car: first preset (Any Stance Car)
  await tap(sock, sock.sent.at(-1).content.buttons[0].id);
  await settle();
  assert.ok(sock.sent.at(-1).content.text.includes('TIME'), 'time prompt after car');

  // Skip time
  await tap(sock, `ewiz:${nonce}:tskip`);
  await settle();
  assert.ok(sock.sent.at(-1).content.text.includes('REVIEW'), 'review after time skip');
  assert.ok(!sock.sent.at(-1).content.text.includes('⏰:'), 'no time line on skipped-time preview');

  // Post
  await tap(sock, `ewiz:${nonce}:post`);
  await settle();
  const card = sock.sent.find(x => (x.content.buttons || []).some(b => String(b.id || '').startsWith('evrsvp:in:')));
  assert.ok(card, 'card posted with evrsvp buttons');
  assert.match(card.content.text, /STANCE MEET/);
  assert.match(card.content.text, /AG KAMI/);
  assert.match(card.content.text, /VR401128/);
  assert.match(card.content.text, /AFRIKAANS/);
  assert.ok(card.content.buttons.some(b => String(b.id).startsWith('evrsvp:in:')), 'card carries evrsvp buttons');
  assert.strictEqual([...eventWizard.sessions.values()].length, 0, 'session closed after post');

  // Record persisted with the v2 fields (the old whitelist would've eaten them)
  const team = database.getTeam(GROUP);
  const [evId, ev] = Object.entries(team.events).find(([, e]) => e.name === 'STANCE MEET') || [];
  assert.ok(evId && evId.startsWith('EV-'), 'EV-XXXXX id');
  assert.strictEqual(ev.host, 'AG KAMI');
  assert.strictEqual(ev.cpmId, 'VR401128');
  assert.strictEqual(ev.serverKey, 'AFRIKAANS');
  assert.strictEqual(ev.carType, 'Any Stance Car');
  assert.strictEqual(ev.time, null, 'skipped time stored as null');
  assert.strictEqual(ev.expiresAt, null, 'timeless events never lazily expire');
  assert.strictEqual(ev.createdBy, HOST);

  // RSVP round-trip on the live id
  const rsvpSock = mkSock();
  await tap(rsvpSock, `evrsvp:in:${evId}`, { isAdmin: false, participant: OTHER });
  assert.match(rsvpSock.sent[0].content.text, /Locked in for \*STANCE MEET\*/, 'RSVP confirm');
  assert.strictEqual(database.getCrewEvent(GROUP, evId).attendees.length, 1);
  await tap(rsvpSock, `evrsvp:out:${evId}`, { isAdmin: false, participant: OTHER });
  assert.strictEqual(database.getCrewEvent(GROUP, evId).attendees.length, 0, 'RSVP out removes');
});

test('captureText ignores prefixed text and strangers', async () => {
  const sock = mkSock();
  const P = require('../config').prefix || '.';
  await eventWizard.startWizard(sock, tapMsg('x'), { from: GROUP, sender: HOST });
  await settle();
  const s = [...eventWizard.sessions.values()].find(x => x.chatJid === GROUP);
  s.awaiting = 'host'; s.awaitingSince = Date.now();

  // Prefixed text falls through (commands still work mid-build) — live prefix read
  assert.strictEqual(await eventWizard.captureText(sock, textMsg(`${P}menu`), { from: GROUP, sender: HOST, body: `${P}menu`, isGroup: true }), false);
  // A stranger's text is never stolen
  assert.strictEqual(await eventWizard.captureText(sock, textMsg('hi', OTHER), { from: GROUP, sender: OTHER, body: 'hi', isGroup: true }), false);
  // DMs never capture
  assert.strictEqual(await eventWizard.captureText(sock, textMsg('hi'), { from: '27812345678@s.whatsapp.net', sender: HOST, body: 'hi', isGroup: false }), false);

  eventWizard.sessions.delete(s.nonce);
});

test('three bad answers scrap the build', async () => {
  const sock = mkSock();
  await eventWizard.startWizard(sock, tapMsg('x'), { from: GROUP, sender: HOST });
  await settle();
  const s = [...eventWizard.sessions.values()].find(x => x.chatJid === GROUP);
  s.awaiting = 'id'; s.awaitingSince = Date.now();
  for (let i = 0; i < 3; i++) {
    await eventWizard.captureText(sock, textMsg('garbage!!'), { from: GROUP, sender: HOST, body: 'garbage!!', isGroup: true });
    await settle();
  }
  assert.strictEqual([...eventWizard.sessions.values()].length, 0, 'auto-cancelled after 3 strikes');
  assert.match(sock.sent.at(-1).content.text, /SCRAPPED/, 'cancel notice sent');
});

// ── Legacy one-liner stays verbatim ────────────────────────────────────
test('legacy !event <name> <HH:MM> still works', async () => {
  const sock = mkSock();
  await eventCmd.execute(sock, tapMsg('x'), ['Friday', 'Drift', '20:30'], { from: GROUP, sender: HOST });
  const team = database.getTeam(GROUP);
  const [id, ev] = Object.entries(team.events).find(([, e]) => e.name === 'Friday Drift') || [];
  assert.ok(id, 'legacy event created');
  assert.strictEqual(ev.time, '20:30');
  assert.strictEqual(ev.createdBy, HOST);
  assert.ok(!ev.serverKey, 'legacy path writes no v2 fields');
  assert.match(sock.sent[0].content.text, /EVENT CREATED/);
});

test('legacy rejects impossible times (99:99)', async () => {
  const sock = mkSock();
  await eventCmd.execute(sock, tapMsg('x'), ['Friday', '99:99'], { from: GROUP, sender: HOST });
  const team = database.getTeam(GROUP);
  const bad = Object.values(team.events).some(e => e.time === '99:99');
  assert.ok(!bad, '99:99 must not create');
  // 2 args without a valid time opens the builder instead of erroring,
  // and a second bare start REPLACES the host's own draft (not a second one)
  assert.strictEqual([...eventWizard.sessions.values()].length, 1, 'builder opened');
  await eventCmd.execute(sock, tapMsg('x'), ['Stance', 'Meet'], { from: GROUP, sender: HOST });
  const live = [...eventWizard.sessions.values()].filter(x => x.chatJid === GROUP);
  assert.strictEqual(live.length, 1, 'restart replaces the draft, never duplicates');
  assert.strictEqual(live[0].step, 'title', 'fresh draft restarts at the title step');
  eventWizard.sessions.delete(live[0].nonce);
});
