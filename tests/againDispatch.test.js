const { test } = require('node:test');
const assert = require('node:assert');
const { ALLOW, validate, buildExtra } = require('../utils/againDispatch');

test('validate: allowlisted no-arg id parses', () => {
  const p = validate('again:neko');
  assert.ok(p);
  assert.strictEqual(p.name, 'neko');
  assert.deepStrictEqual(p.args, []);
});

test('validate: whitelisted arg survives (dice d20)', () => {
  const p = validate('again:dice:20');
  assert.ok(p);
  assert.strictEqual(p.name, 'dice');
  assert.deepStrictEqual(p.args, ['20']);
});

test('validate: rejects non-allowlisted commands', () => {
  assert.strictEqual(validate('again:ban'), null);
  assert.strictEqual(validate('again:ship'), null);        // target-lost
  assert.strictEqual(validate('again:8ball'), null);       // question-lost
  assert.strictEqual(validate('again:setprefix'), null);   // owner config writer
});

test('validate: rejects unsafe arg characters (id injection)', () => {
  assert.strictEqual(validate('again:dice:20;drop'), null);
  assert.strictEqual(validate('again:dice:../etc'), null);
  assert.strictEqual(validate('again:dice:$$bad$$'), null);
});

test('validate: extra safe args parse harmlessly (command ignores them)', () => {
  const p = validate('again:pies:ZA:EXTRA');
  assert.ok(p);
  assert.deepStrictEqual(p.args, ['ZA', 'EXTRA']);
});

test('validate: rejects non-again ids and garbage', () => {
  assert.strictEqual(validate('menu:admin'), null);
  assert.strictEqual(validate('again:'), null);
  assert.strictEqual(validate('again::'), null);
  assert.strictEqual(validate(42), null);
  assert.strictEqual(validate(null), null);
});

test('ALLOW excludes every target-bearing command (final-judge rule)', () => {
  for (const cmd of ['ship', 'flirt', 'insult', 'compliment', 'gayrate', '8ball', 'memesearch']) {
    assert.ok(!ALLOW.has(cmd), `${cmd} must not be in the Again allowlist`);
  }
});

test('ALLOW is SFW-only for anime (NSFW typed-only permanently)', () => {
  for (const cmd of ['waifu', 'neko', 'random', 'konachan']) {
    assert.ok(ALLOW.has(cmd), `${cmd} (SFW) should be allowlisted`);
  }
  for (const cmd of ['hwaifu', 'hneko', 'milf', 'loli', 'megumin']) {
    assert.ok(!ALLOW.has(cmd), `${cmd} (NSFW) must stay typed-only`);
  }
});

test('buildExtra provides reply/fail/isGroup wired to sock', async () => {
  const sends = [];
  const sock = { async sendMessage(jid, content) { sends.push({ jid, content }); } };
  const extra = buildExtra(sock, { pushName: 'Tets' }, '120363@g.us', '999@s.whatsapp.net');

  assert.strictEqual(extra.isGroup, true);
  assert.strictEqual(extra.pushName, 'Tets');
  await extra.reply('hello');
  assert.strictEqual(sends[0].jid, '120363@g.us');
  assert.strictEqual(sends[0].content.text, 'hello');
  assert.doesNotThrow(() => extra.fail());
});

test('buildExtra: DM context reports isGroup false', () => {
  const extra = buildExtra({ sendMessage: async () => {} }, {}, '999@s.whatsapp.net', '999@s.whatsapp.net');
  assert.strictEqual(extra.isGroup, false);
});
