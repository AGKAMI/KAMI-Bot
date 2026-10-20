/**
 * Member picker tests — pagination math, role filters, cap, and the
 * end-to-end pick → command execution path (synthetic mention injection).
 */

const test = require('node:test');
const assert = require('node:assert');

require('../handler'); // registers requireAdmin('admin') for the Back button

const { openPicker, membersFor } = require('../utils/memberPicker');
const { handleButtonResponse, getLastHandlerPromise } = require('../utils/buttonHelper');

const GROUP = '555666777888@g.us';

function fakeMeta() {
  const participants = [
    { id: '270000000001@s.whatsapp.net', admin: 'superadmin' }, // bot
    { id: '270000000002@s.whatsapp.net', admin: 'admin' },
    { id: '270000000003@s.whatsapp.net', admin: null },
    { id: '270000000004@s.whatsapp.net', admin: null },
    { id: '270000000005@s.whatsapp.net', admin: null },
    { id: '270000000006@s.whatsapp.net', admin: null },
    { id: '270000000007@s.whatsapp.net', admin: null },
    { id: '270000000008@s.whatsapp.net', admin: null },
    { id: '270000000009@s.whatsapp.net', admin: null },
    { id: '270000000010@s.whatsapp.net', admin: null },
    { id: '270000000011@s.whatsapp.net', admin: null },
    { id: '270000000012@s.whatsapp.net', admin: 'admin' },
  ];
  return { id: GROUP, subject: 'Test Group', participants };
}

function mkSock(sent, updates) {
  const findIm = (obj, d = 0) => {
    if (!obj || typeof obj !== 'object' || d > 8) return null;
    if (obj.body && obj.nativeFlowMessage) return obj;
    for (const v of Object.values(obj)) {
      const f = findIm(v, d + 1);
      if (f) return f;
    }
    return null;
  };
  const extract = (message) => {
    const im = findIm(message);
    const rows = (im && im.nativeFlowMessage && im.nativeFlowMessage.buttons) || [];
    return {
      buttons: rows.map(r => {
        try {
          const p = JSON.parse(r.buttonParamsJson || '{}');
          return { id: p.id, text: p.display_text, url: p.url };
        } catch (e) { return {}; }
      }),
      text: (im && im.body && im.body.text) || '',
    };
  };
  return {
    user: { id: '270000000001:3@s.whatsapp.net' },
    sendMessage: async (jid, content, opts) => {
      sent.push({ jid, content, opts });
      return { key: { id: 'm' + sent.length, remoteJid: jid } };
    },
    relayMessage: async (jid, message) => {
      sent.push({ jid, content: extract(message), opts: { relayed: true } });
      return { key: { id: 'r' + sent.length } };
    },
    groupMetadata: async () => fakeMeta(),
    groupInviteCode: async () => { throw new Error('mock'); },
    groupParticipantsUpdate: async (jid, targets, action) => {
      updates.push({ jid, targets, action });
      // mirror real Baileys: per-participant status codes (200 = done)
      return targets.map(t => ({ jid: t, status: '200' }));
    },
  };
}

function mkTap(btnId, { fromMe = false } = {}) {
  return {
    key: { remoteJid: GROUP, fromMe, participant: '270000000002@s.whatsapp.net' },
    pushName: 'picker-test',
    message: { templateButtonReplyMessage: { selectedId: btnId } },
  };
}

const settle = () => new Promise(r => setTimeout(r, 560)); // clear 500ms interactive limiter

test('membersFor: promote filters admins, demote keeps only admins, bot excluded, labels crowned + sorted', () => {
  const meta = fakeMeta();
  const BOT = '270000000001:3@s.whatsapp.net';
  const prom = membersFor(meta, 'promote', BOT);
  assert.ok(!prom.some(p => p.admin), 'promote must not list admins');
  assert.strictEqual(prom.length, 9, '9 non-admin candidates');
  const dem = membersFor(meta, 'demote', BOT);
  assert.ok(dem.every(p => p.admin), 'demote lists only admins');
  assert.ok(dem.every(p => p.label.startsWith('👑 ')), 'admin labels crowned');
  const kick = membersFor(meta, 'kick', BOT);
  assert.strictEqual(kick.length, 11, 'kick lists all members except the bot');
  assert.ok(!kick.some(p => p.jid.startsWith('270000000001')), 'bot excluded');
  for (const list of [prom, dem, kick]) {
    const labels = list.map(p => p.label);
    assert.deepStrictEqual(labels, [...labels].sort((a, b) => a.localeCompare(b)), 'sorted by label');
  }
});

test('picker: renders paginated rows within the 10-button cap', async () => {
  const sent = [];
  const updates = [];
  const sock = mkSock(sent, updates);
  const msg = mkTap('x');
  const opened = await openPicker(sock, msg, GROUP, 'promote', { title: '*PROMOTE*\n\n_action: promote_' });
  assert.strictEqual(opened, true);
  const pick = sent.find(s => (s.content.buttons || []).some(b => String(b.id).startsWith('pick:')));
  assert.ok(pick, 'picker message rendered');
  assert.ok(pick.content.buttons.length <= 10, `cap: ${pick.content.buttons.length}`);
  const rows = pick.content.buttons.filter(b => /:u:/.test(b.id));
  assert.strictEqual(rows.length, 7, '7 member rows on page 1');
  assert.ok(pick.content.buttons.some(b => /:p:/.test(b.id)), 'Next present');
  assert.ok(pick.content.buttons.some(b => b.id === 'admin:hub'), 'Back → hub');
});

test('picker: nav + select drives the real command with the picked member', async () => {
  await settle(); // prior test rendered for the same jid — clear the limiter
  const sent = [];
  const updates = [];
  const sock = mkSock(sent, updates);
  const msg = mkTap('x');
  await openPicker(sock, msg, GROUP, 'promote', {});
  const first = sent.find(s => (s.content.buttons || []).some(b => String(b.id).startsWith('pick:')));
  const nonce = first.content.buttons.find(b => /:u:/.test(b.id)).id.split(':')[1];

  // clear the 500ms interactive limiter BEFORE tapping so the handler's
  // re-render goes through the relay path (not the plain-text fallback)
  await settle();

  // page 2
  const navId = `pick:${nonce}:p:1`;
  assert.strictEqual(await (async () => { const m = mkTap(navId); return handleButtonResponse(sock, m, async () => true); })(), true);
  await getLastHandlerPromise();
  const second = sent.filter(s => (s.content.buttons || []).some(b => String(b.id).startsWith('pick:'))).pop();
  assert.ok(second, 'page 2 rendered');
  assert.ok(second.content.buttons.some(b => b.id === `pick:${nonce}:p:0`), 'Prev present on page 2');
  const page2Rows = second.content.buttons.filter(b => /:u:/.test(b.id));
  assert.strictEqual(page2Rows.length, 2, 'remaining 2 members on page 2');

  await settle();

  // select first member of page 2 (index 7)
  const selId = `pick:${nonce}:u:7`;
  assert.strictEqual(await handleButtonResponse(sock, mkTap(selId), async () => true), true);
  await getLastHandlerPromise();

  assert.strictEqual(updates.length, 1, 'groupParticipantsUpdate called once');
  assert.strictEqual(updates[0].action, 'promote');
  assert.ok(updates[0].targets[0].startsWith('2700000000'), `picked a real member jid: ${updates[0].targets}`);
  const done = sent[sent.length - 1];
  assert.match(JSON.stringify(done.content), /PROMOTED|SUCCESS|admin/i, 'promote confirmed');
});

test('picker: stale/expired nonce taps are dropped silently', async () => {
  const sent = [];
  const updates = [];
  const sock = mkSock(sent, updates);
  const before = sent.length;
  const consumed = await handleButtonResponse(sock, mkTap('pick:deadbeef:u:0'), async () => true);
  await getLastHandlerPromise();
  // consumed = handler exists (prefix pick:), but nothing was executed or sent
  assert.strictEqual(consumed, true);
  assert.strictEqual(sent.length, before, 'no message for expired session');
  assert.strictEqual(updates.length, 0, 'no action for expired session');
});
