const { test } = require('node:test');
const assert = require('node:assert');
const { ALLOW, validate, buildExtra, buildRunButtons } = require('../utils/againDispatch');
const { loadCommands } = require('../utils/commandLoader');

const CMD = loadCommands();

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

test('buildRunButtons: anime view = SFW tap-to-run only, NSFW excluded', () => {
  const btns = buildRunButtons('anime', 1);
  const ids = btns.map(b => b.id).sort();
  assert.deepStrictEqual(ids, ['again:konachan', 'again:neko', 'again:random', 'again:waifu']);
  for (const b of btns) {
    assert.ok(b.text.startsWith('▶️ '), b.text);
    assert.ok(validate(b.id), `${b.id} must be a routable again: id`);
  }
});

test('buildRunButtons: respects reserved slots so run+nav stays within the 10 cap', () => {
  // fun has 5 allowlisted commands; reserved=8 → only 2 fit (10-8)
  const btns = buildRunButtons('fun', 8);
  assert.strictEqual(btns.length, 2);
  // reserved=10 → none fit
  assert.strictEqual(buildRunButtons('fun', 10).length, 0);
});

test('buildRunButtons: categories with no allowlisted commands return empty', () => {
  assert.deepStrictEqual(buildRunButtons('utility', 1), []);
  assert.deepStrictEqual(buildRunButtons('media', 1), []); // tt needs a URL arg
});

test('buildRunButtons: every generated id is zero-arg (no half-specified taps)', () => {
  for (const cat of ['anime', 'fun', 'games', 'crew']) {
    for (const b of buildRunButtons(cat, 1)) {
      assert.strictEqual(b.id.split(':').length, 2, `${b.id} must carry no args`);
    }
  }
});
