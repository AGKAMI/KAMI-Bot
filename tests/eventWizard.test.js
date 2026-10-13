/**
 * Event wizard tests — drive the real handleButtonResponse + captureText
 * with a mock sock. crew.json is snapshotted and restored around the
 * suite (tests dirty it — same convention as the picker arc).
 *
 * Reply-bound capture: typed answers must quote the current step message
 * (contextInfo.stanzaId === s.lastStepId) — textMsg() threads the id.
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
const cpmData = require('../commands/crew/cpmData');

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
      sent.push({
        jid,
        content: {
          buttons,
          text: (im && im.body && im.body.text) || '',
          mentions: (im && im.contextInfo && im.contextInfo.mentionedJid) || [],
        },
        opts: { relayed: true },
      });
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

// Reply-bound: pass the session (reads s.lastStepId) or an explicit stanza
const textMsg = (body, sender, sOrStanza) => ({
  key: { remoteJid: GROUP, participant: sender || HOST, fromMe: false },
  pushName: 'test',
  message: {
    extendedTextMessage: {
      text: body,
      contextInfo: {
        stanzaId: typeof sOrStanza === 'string' ? sOrStanza : (sOrStanza && sOrStanza.lastStepId) || 'STALE',
        mentionedJid: [],
      },
    },
  },
});

const ctx = (body, sender, isGroup = true) => ({
  from: GROUP, sender: sender || HOST, body, isGroup,
});

const settle = () => new Promise(r => setTimeout(r, 750)); // > render debounce + 500ms cooldown

test.after(() => {
  // Restore crew.json — tests may have written events into it
  if (CREW_SNAPSHOT !== null) fs.writeFileSync(CREW_DB, CREW_SNAPSHOT);
  else if (fs.existsSync(CREW_DB)) fs.unlinkSync(CREW_DB);
});

// ── cpmData locks ─────────────────────────────────────────────────────
test('cpmData: 84 servers, A–Z, JAPANESE + FILIPINO in slot, 6/page', () => {
  const keys = cpmData.SERVERS.map(s => s.key);
  assert.strictEqual(keys.length, 84, '84 servers (user 83 + JAPANESE)');
  assert.strictEqual(keys.at(-1), 'OTHER', 'OTHER rides last');
  const sorted = keys.filter(k => k !== 'OTHER').slice().sort();
  assert.deepStrictEqual(sorted, keys.filter(k => k !== 'OTHER'), 'strict A–Z');
  const jp = cpmData.SERVERS[keys.indexOf('JAPANESE')];
  assert.strictEqual(jp.flag, '🇯🇵', 'JAPANESE carries the JP flag');
  assert.strictEqual(keys[keys.indexOf('JAPANESE') - 1], 'JAMAICAN');
  assert.strictEqual(keys[keys.indexOf('JAPANESE') + 1], 'JORDANIAN');
  assert.strictEqual(keys[keys.indexOf('FILIPINO') - 1], 'FAROESE', 'FILIPINO in the F-slot');
  assert.strictEqual(keys[keys.indexOf('FILIPINO') + 1], 'FINNISH');
  assert.strictEqual(cpmData.PAGE_SIZE, 6, '6 rows make room for the Jump button');
  assert.strictEqual(cpmData.buildServerPages().length, 14, '14 pages at 6/page');
  assert.strictEqual(cpmData.SERVER_RANGES.length, 6, '6 jump ranges');
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
test('full build: template → host → id → server → car → time → duration → post', async () => {
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

  // Host via typed capture (reply-bound)
  const ate = await eventWizard.captureText(sock, textMsg('AG KAMI', HOST, s), ctx('AG KAMI'));
  assert.strictEqual(ate, true, 'host text consumed');
  await settle();
  assert.ok(sock.sent.at(-1).content.text.includes('ROOM ID'), 'id prompt after host');

  // Garbage ID → strike; good ID → advance (replies quote the strike msg)
  assert.strictEqual(await eventWizard.captureText(sock, textMsg('not an id!!', HOST, s), ctx('not an id!!')), true);
  await settle();
  assert.match(sock.sent.at(-1).content.text, /VR401128/, 're-ask shows the ID example');
  assert.strictEqual(await eventWizard.captureText(sock, textMsg('vr 401128', HOST, s), ctx('vr 401128')), true);
  await settle();
  assert.ok(sock.sent.at(-1).content.text.includes('SERVER'), 'server prompt after id');

  // Server: page 1 has 🇿🇦 pinned, tap it
  const srvMsg = sock.sent.at(-1);
  assert.ok(srvMsg.content.buttons[0].text.includes('AFRIKAANS'), 'home server pinned first');
  assert.ok(srvMsg.content.buttons.some(b => String(b.id).includes(':jumps')), 'Jump button present');
  await tap(sock, srvMsg.content.buttons[0].id);
  await settle();
  assert.ok(sock.sent.at(-1).content.text.includes('CAR TYPE'), 'car prompt after server');

  // Car: first preset (Any Stance Car)
  await tap(sock, sock.sent.at(-1).content.buttons[0].id);
  await settle();
  assert.ok(sock.sent.at(-1).content.text.includes('TIME'), 'time prompt after car');

  // Skip time → DURATION step (not review)
  await tap(sock, `ewiz:${nonce}:tskip`);
  await settle();
  assert.ok(sock.sent.at(-1).content.text.includes('DURATION'), 'duration step after time skip');
  assert.ok(!sock.sent.at(-1).content.text.includes('⏰:'), 'no time line on skipped-time preview');

  // Skip duration → review
  await tap(sock, `ewiz:${nonce}:dskip`);
  await settle();
  assert.ok(sock.sent.at(-1).content.text.includes('REVIEW'), 'review after duration skip');

  // Post → card (hidden mention + evrsvp) + pin
  await tap(sock, `ewiz:${nonce}:post`);
  await settle();
  const card = sock.sent.find(x => (x.content.buttons || []).some(b => String(b.id || '').startsWith('evrsvp:in:')));
  assert.ok(card, 'card posted with evrsvp buttons');
  assert.match(card.content.text, /STANCE MEET/);
  assert.match(card.content.text, /Host 👤: AG KAMI/, 'word-first host label');
  assert.match(card.content.text, /🆔: VR401128/, 'ID stays emoji-only');
  assert.match(card.content.text, /Server 🌐: 🇿🇦 AFRIKAANS/);
  assert.match(card.content.text, /Cars 🚗: Any Stance Car/);
  assert.ok(!card.content.text.includes('⏰:'), 'no time line when both skipped');
  assert.match(card.content.text, /👥 1 going so far/, 'host auto-RSVP seeds the count');
  assert.deepStrictEqual(card.content.mentions.slice().sort(), [HOST, OTHER].sort(), 'hidden mention tags the whole crew');
  const pin = sock.sent.map(x => x.content && x.content.pin).find(Boolean);
  assert.ok(pin, 'pin sent after the card');
  assert.strictEqual(pin.type, 1, 'pin action');
  assert.strictEqual(pin.time, 24 * 60 * 60, '24h pin');
  assert.strictEqual([...eventWizard.sessions.values()].length, 0, 'session closed after post');

  // Record persisted with the v2 fields
  const team = database.getTeam(GROUP);
  const [evId, ev] = Object.entries(team.events).find(([, e]) => e.name === 'STANCE MEET') || [];
  assert.ok(ev.pinnedMsgId, 'pin target persisted for the unpin sweep');
  assert.strictEqual(ev.pinnedMsgId, pin.key.id, 'stored id matches the pinned card');
  assert.ok(evId && evId.startsWith('EV-'), 'EV-XXXXX id');
  assert.strictEqual(ev.host, 'AG KAMI');
  assert.strictEqual(ev.cpmId, 'VR401128');
  assert.strictEqual(ev.serverKey, 'AFRIKAANS');
  assert.strictEqual(ev.carType, 'Any Stance Car');
  assert.strictEqual(ev.time, null, 'skipped time stored as null');
  assert.strictEqual(ev.endTime, null);
  assert.strictEqual(ev.endAt, null, 'no duration → no endAt');
  assert.strictEqual(ev.expiresAt, null, 'timeless events never lazily expire');
  assert.strictEqual(ev.createdBy, HOST);
  assert.deepStrictEqual(ev.attendees, [HOST], 'host seeded as the first attendee');

  // RSVP round-trip on the live id — host already in, OTHER joins then leaves
  const rsvpSock = mkSock();
  await tap(rsvpSock, `evrsvp:in:${evId}`, { isAdmin: false, participant: OTHER });
  assert.match(rsvpSock.sent[0].content.text, /Locked in for \*STANCE MEET\*/, 'RSVP confirm');
  assert.strictEqual(database.getCrewEvent(GROUP, evId).attendees.length, 2, 'host + OTHER');
  await tap(rsvpSock, `evrsvp:out:${evId}`, { isAdmin: false, participant: OTHER });
  assert.strictEqual(database.getCrewEvent(GROUP, evId).attendees.length, 1, 'OTHER out, host remains');
});

// ── Duration flow ──────────────────────────────────────────────────────
test('duration: 20:30 + 2hr preset → end 22:30, endAt stored, card shows range', async () => {
  const sock = mkSock();
  await eventWizard.startWizard(sock, tapMsg('x'), { from: GROUP, sender: HOST });
  await settle();
  const s = [...eventWizard.sessions.values()].find(x => x.chatJid === GROUP);
  const nonce = s.nonce;

  await tap(sock, `ewiz:${nonce}:tpl:STANCE`);
  await settle();
  await eventWizard.captureText(sock, textMsg('AG KAMI', HOST, s), ctx('AG KAMI'));
  await settle();
  await eventWizard.captureText(sock, textMsg('VR401128', HOST, s), ctx('VR401128'));
  await settle();
  await tap(sock, `ewiz:${nonce}:srv:AFRIKAANS`);
  await settle();
  await tap(sock, `ewiz:${nonce}:car:0`);
  await settle();
  await eventWizard.captureText(sock, textMsg('20:30', HOST, s), ctx('20:30'));
  await settle();
  assert.ok(sock.sent.at(-1).content.text.includes('DURATION'), 'duration step after typed time');
  await tap(sock, `ewiz:${nonce}:dur:120`);
  await settle();
  assert.match(sock.sent.at(-1).content.text, /20:30 – 22:30/, 'review shows the range');
  await tap(sock, `ewiz:${nonce}:post`);
  await settle();

  const card = sock.sent.find(x => (x.content.buttons || []).some(b => String(b.id || '').startsWith('evrsvp:in:')));
  assert.match(card.content.text, /Time ⏰: 20:30 – 22:30/, 'card time line carries both ends');
  const team = database.getTeam(GROUP);
  const ev = Object.values(team.events).find(e => e.name === 'STANCE MEET' && e.time === '20:30');
  assert.ok(ev, 'record with the typed time');
  assert.strictEqual(ev.endTime, '22:30');
  assert.strictEqual(ev.durationMins, 120);
  assert.ok(ev.endAt > Date.now(), 'endAt in the future');
  assert.ok(ev.expiresAt, 'timed events keep the 48h window too');
  eventWizard.sessions.delete(s.nonce);
});

// ── Jump overlay ───────────────────────────────────────────────────────
test('jump overlay: range tap lands on the page containing that range', async () => {
  const sock = mkSock();
  await eventWizard.startWizard(sock, tapMsg('x'), { from: GROUP, sender: HOST });
  await settle();
  const s = [...eventWizard.sessions.values()].find(x => x.chatJid === GROUP);
  const nonce = s.nonce;
  await tap(sock, `ewiz:${nonce}:tpl:STANCE`);
  await settle();
  await eventWizard.captureText(sock, textMsg('AG KAMI', HOST, s), ctx('AG KAMI'));
  await settle();
  await eventWizard.captureText(sock, textMsg('VR401128', HOST, s), ctx('VR401128'));
  await settle(); // now on the server step

  await tap(sock, `ewiz:${nonce}:jumps`);
  await settle();
  const jumpMsg = sock.sent.at(-1);
  assert.match(jumpMsg.content.text, /JUMP TO/);
  assert.strictEqual(jumpMsg.content.buttons.length, 8, '6 ranges + back + cancel');

  await tap(sock, `ewiz:${nonce}:jump:5`); // T–Z
  await settle();
  const pages = cpmData.buildServerPages();
  const expected = cpmData.pageForKey(pages, 'TAJIK');
  assert.strictEqual(s.serverPage, expected, 'lands on the T–Z page');
  assert.match(sock.sent.at(-1).content.text, new RegExp(`Page ${expected + 1}/${pages.length}`));
  eventWizard.sessions.delete(s.nonce);
});

// ── Unpin sweep (event ends → pin released) ────────────────────────────
test('unpin sweep: completed event with a pin target gets unpinned once', async () => {
  const { sweepExpiredPins } = require('../commands/crew/eventRsvp');
  database.addCrewEvent(GROUP, 'EV-UNPIN', {
    name: 'ENDED MEET', status: 'completed', attendees: [],
    pinnedMsgId: 'UNPIN-TARGET-1', endAt: Date.now() - 60_000,
  });
  // Legacy record without pinnedMsgId — nothing to unpin, must be skipped
  database.addCrewEvent(GROUP, 'EV-NOKEY', {
    name: 'LEGACY MEET', status: 'completed', attendees: [],
    endAt: Date.now() - 60_000,
  });

  const sock = mkSock();
  await sweepExpiredPins(sock);
  const unpin = sock.sent
    .map(x => x.content && x.content.pin)
    .find(p => p && p.type === 2 && p.key && p.key.id === 'UNPIN-TARGET-1');
  assert.ok(unpin, 'UNPIN_FOR_ALL sent for the pinned card');
  assert.strictEqual(unpin.key.remoteJid, GROUP, 'targets the owning group');
  const evt = database.getCrewEvent(GROUP, 'EV-UNPIN');
  assert.ok(evt.unpinnedAt, 'marked unpinned');

  // Second sweep must not re-unpin (or touch the legacy record)
  const sock2 = mkSock();
  await sweepExpiredPins(sock2);
  const dup = sock2.sent.filter(x => x.content && x.content.pin && x.content.pin.type === 2);
  assert.strictEqual(dup.length, 0, 'never unpins twice');

  database.removeCrewEvent(GROUP, 'EV-UNPIN');
  database.removeCrewEvent(GROUP, 'EV-NOKEY');
});

test('unpin sweep: failed unpin retries 3x then gives up', async () => {
  const { sweepExpiredPins } = require('../commands/crew/eventRsvp');
  database.addCrewEvent(GROUP, 'EV-FAIL', {
    name: 'STUBBORN MEET', status: 'completed', attendees: [],
    pinnedMsgId: 'UNPIN-FAIL-1', endAt: Date.now() - 60_000,
  });
  const failSock = mkSock();
  failSock.sendMessage = async () => { throw new Error('mock: lost admin'); };

  for (let i = 0; i < 4; i++) await sweepExpiredPins(failSock);
  const evt = database.getCrewEvent(GROUP, 'EV-FAIL');
  assert.strictEqual(evt.unpinTries, 3, 'gives up after 3 tries');
  assert.ok(!evt.unpinnedAt, 'never marked unpinned');

  database.removeCrewEvent(GROUP, 'EV-FAIL');
});

test('unpin sweep: upcoming events are never touched', async () => {
  const { sweepExpiredPins } = require('../commands/crew/eventRsvp');
  database.addCrewEvent(GROUP, 'EV-LIVE', {
    name: 'LIVE MEET', status: 'upcoming', attendees: [],
    pinnedMsgId: 'UNPIN-LIVE-1', endAt: Date.now() + 60 * 60 * 1000,
  });
  const sock = mkSock();
  await sweepExpiredPins(sock);
  assert.ok(!sock.sent.some(x => x.content && x.content.pin), 'no unpin for a live event');
  assert.ok(!database.getCrewEvent(GROUP, 'EV-LIVE').unpinnedAt);
  database.removeCrewEvent(GROUP, 'EV-LIVE');
});

// ── Reply-bound capture ────────────────────────────────────────────────
test('captureText: non-replies and stale-quote replies are never consumed', async () => {
  const sock = mkSock();
  await eventWizard.startWizard(sock, tapMsg('x'), { from: GROUP, sender: HOST });
  await settle();
  const s = [...eventWizard.sessions.values()].find(x => x.chatJid === GROUP);
  s.awaiting = 'host'; s.awaitingSince = Date.now();

  // Host chatting in the group WITHOUT replying to the step — ignored
  assert.strictEqual(await eventWizard.captureText(sock, textMsg('anyone else hosting?', HOST, 'OLD-MSG-999'), ctx('anyone else hosting?')), false);
  // Replying to a STALE message (not the current step) — ignored
  assert.strictEqual(await eventWizard.captureText(sock, textMsg('AG KAMI', HOST, 'OLD-MSG-999'), ctx('AG KAMI')), false);
  // Replying to the CURRENT step — consumed
  assert.strictEqual(await eventWizard.captureText(sock, textMsg('AG KAMI', HOST, s), ctx('AG KAMI')), true);

  eventWizard.sessions.delete(s.nonce);
});

test('captureText ignores prefixed text and strangers', async () => {
  const sock = mkSock();
  const P = require('../config').prefix || '.';
  await eventWizard.startWizard(sock, tapMsg('x'), { from: GROUP, sender: HOST });
  await settle();
  const s = [...eventWizard.sessions.values()].find(x => x.chatJid === GROUP);
  s.awaiting = 'host'; s.awaitingSince = Date.now();

  // Prefixed text falls through (commands still work mid-build)
  assert.strictEqual(await eventWizard.captureText(sock, textMsg(`${P}menu`, HOST, s), ctx(`${P}menu`)), false);
  // A stranger's text is never stolen
  assert.strictEqual(await eventWizard.captureText(sock, textMsg('hi', OTHER, s), ctx('hi', OTHER)), false);
  // DMs never capture
  assert.strictEqual(await eventWizard.captureText(sock, textMsg('hi', HOST, s), { from: '27812345678@s.whatsapp.net', sender: HOST, body: 'hi', isGroup: false }), false);

  eventWizard.sessions.delete(s.nonce);
});

test('three bad answers scrap the build', async () => {
  const sock = mkSock();
  await eventWizard.startWizard(sock, tapMsg('x'), { from: GROUP, sender: HOST });
  await settle();
  const s = [...eventWizard.sessions.values()].find(x => x.chatJid === GROUP);
  s.awaiting = 'id'; s.awaitingSince = Date.now();
  for (let i = 0; i < 3; i++) {
    await eventWizard.captureText(sock, textMsg('garbage!!', HOST, s), ctx('garbage!!'));
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
