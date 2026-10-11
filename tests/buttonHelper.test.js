const { test } = require('node:test');
const assert = require('node:assert');
const { onButton, handleButtonResponse, requireOwner, isOwnerJid } = require('../utils/buttonHelper');

// ── helpers ──────────────────────────────────────────────────────
function fakeSock() {
  const sent = [];
  return {
    sent,
    user: { id: '555:1@s.whatsapp.net' },
    async sendMessage(jid, content) {
      sent.push({ jid, content });
      return { key: { id: 'x' } };
    },
  };
}
function tap(btnId, { from = '120363@g.us', participant = '999@s.whatsapp.net', fromMe = false } = {}) {
  const msg = {
    key: { remoteJid: from, participant, fromMe },
    message: { templateButtonReplyMessage: { selectedId: btnId } },
  };
  return msg;
}

// ── longest-prefix routing ────────────────────────────────────────
test('longest-prefix match wins regardless of registration order', async () => {
  let hit = null;
  // Register SHORT prefix first — old first-match code would misroute
  onButton('tpfx:', async () => { hit = 'short'; });
  onButton('tpfx:sub:', async () => { hit = 'long'; });

  const sock = fakeSock();
  const handled = await handleButtonResponse(sock, tap('tpfx:sub:x'), () => Promise.resolve(true));
  assert.strictEqual(handled, true);
  assert.strictEqual(hit, 'long', 'tap must route to the longest matching prefix');
});

test('short prefix still handles ids it exclusively matches', async () => {
  let hit = null;
  onButton('tpfx2:', async () => { hit = 'short'; });
  onButton('tpfx2:sub:', async () => { hit = 'long'; });

  const sock = fakeSock();
  await handleButtonResponse(sock, tap('tpfx2:other'), () => Promise.resolve(true));
  assert.strictEqual(hit, 'short');
});

test('non-colon key still matches as prefix (crew:accept style)', async () => {
  let hit = null;
  onButton('tpfx3accept', async () => { hit = 'accept'; });
  const sock = fakeSock();
  await handleButtonResponse(sock, tap('tpfx3accept:12345'), () => Promise.resolve(true));
  assert.strictEqual(hit, 'accept');
});

test('prefix overlap registration warns but does not throw', () => {
  assert.doesNotThrow(() => {
    onButton('tpfx4:', async () => {});
    onButton('tpfx4:deep:', async () => {});
  });
});

// ── owner gate ────────────────────────────────────────────────────
test('requireOwner rejects non-owner taps and notifies', async () => {
  let called = false;
  requireOwner('tpown');
  onButton('tpown:go', async () => { called = true; });

  const sock = fakeSock();
  const handled = await handleButtonResponse(sock, tap('tpown:go'), () => Promise.resolve(true));
  assert.strictEqual(handled, true, 'event consumed');
  assert.strictEqual(called, false, 'handler must NOT run for non-owner');
  assert.ok(sock.sent.some(s => /OWNER ONLY/i.test(s.content.text || '')), 'owner-only notice sent');
});

test('requireOwner allows fromMe taps', async () => {
  let called = false;
  requireOwner('tpown2');
  onButton('tpown2:go', async () => { called = true; });

  const sock = fakeSock();
  await handleButtonResponse(sock, tap('tpown2:go', { fromMe: true }), () => Promise.resolve(true));
  assert.strictEqual(called, true);
});

test('isOwnerJid: fromMe is owner; stranger digits are not', () => {
  assert.strictEqual(isOwnerJid({ key: { fromMe: true } }, 'anyone@s.whatsapp.net'), true);
  assert.strictEqual(isOwnerJid({ key: { fromMe: false } }, '99999@s.whatsapp.net'), false);
});

test('sendButtons payload never contains a header (headered native_flow renders invisible on some clients)', async () => {
  const { sendButtons } = require('../utils/buttonHelper');
  const built = [];
  const sock = {
    user: { id: '555:1@s.whatsapp.net' },
    async sendMessage() { return { key: { id: 'x' } }; },
    async relayMessage(jid, message) { built.push(message); return { key: { id: 'x' } }; },
  };
  await sendButtons(sock, '120363@g.us', {
    text: 'body text',
    footer: 'foot',
    header: 'KAMI BOT',
    buttons: [{ id: 'tp:one', text: 'One' }],
  });
  assert.strictEqual(built.length, 1, 'relay path used');
  const im = built[0].interactiveMessage
    || (built[0].ephemeralMessage && built[0].ephemeralMessage.message && built[0].ephemeralMessage.message.interactiveMessage);
  assert.ok(im, 'interactiveMessage present');
  assert.strictEqual(im.header, undefined, 'header must be stripped from the payload');
  assert.ok(im.body && im.body.text, 'body preserved');
  assert.ok(im.nativeFlowMessage.buttons.length >= 1, 'buttons preserved');
});
