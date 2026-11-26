/**
 * Command smoke test — the guard that catches "every command throws".
 *
 * Drives EVERY registered command through the real handler.js with a mock
 * sock and asserts two things:
 *
 *   1. no command throws out of handleMessage (a throw means the user got
 *      the generic "Something went stukkend" reply instead of the command)
 *   2. no command pastes a raw JS message ("extra is not defined",
 *      "Cannot read properties of null", ETIMEDOUT…) into a user reply
 *
 * Background: an owner-bypass wrapper read `extra.isOwner` in handler.js,
 * where no such variable exists — every command threw
 * `ReferenceError: extra is not defined`. Reading the file did not catch
 * it; running every command through it did.
 *
 * Database files are snapshotted and restored, same convention as the
 * other suites (tests dirty the untracked JSON stores).
 *
 * Run: node --test --test-force-exit tests/commandSmoke.test.js
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CREW_DB = path.join(__dirname, '..', 'database', 'crew.json');
const CREW_SNAPSHOT = fs.existsSync(CREW_DB) ? fs.readFileSync(CREW_DB, 'utf8') : null;

// Loading handler.js registers every onButton handler at boot.
const handler = require('../handler');
const { loadCommands } = require('../utils/commandLoader');
const config = require('../config');

const OWNER = '27840820712@s.whatsapp.net';
const P = config.prefix;
const GROUP = '120363000000000001@g.us';

// Each test starts from a clean crew DB. The 467-command loop above dirties
// it (one of those commands IS `apply`, which writes an application for the
// same phone number), so without this the second test sees "already applied"
// state it did not create.
const resetCrewDb = () => {
  try {
    const database = require('../database');
    const crew = database.getCrew();
    if (!crew.groups) crew.groups = {};
    crew.groups[GROUP] = { members: {}, events: {}, applicants: {} };
    database.flushCrew();
  } catch (e) { /* a missing crew.json is fine on a clean box */ }
};

test.beforeEach(() => { resetCrewDb(); });

function mkSock() {
  const sent = [];
  return {
    sent,
    user: { id: '27833882383:1@s.whatsapp.net', lid: '123456789012345:1@lid' },
    async sendMessage(jid, content, opts) {
      sent.push({ jid, content, opts });
      return { key: { id: 'm' + sent.length, remoteJid: jid } };
    },
    async relayMessage(jid, message) {
      sent.push({ jid, message });
      return { key: { id: 'r' + sent.length } };
    },
    async groupMetadata(jid) {
      if (String(jid).endsWith('@g.us')) {
        return {
          id: jid, subject: 'SSRS',
          participants: [
            { id: '27833882383@s.whatsapp.net', admin: 'superadmin' },
            { id: OWNER, admin: 'superadmin' },
          ],
        };
      }
      throw new Error('not a group');
    },
    async groupInviteCode() { return 'TESTCODE'; },
    async groupParticipantsUpdate() { return [{ status: 200 }]; },
    async updateBlockStatus() {},
    async sendPresenceUpdate() {},
    async fetchBlocklist() { return []; },
    async profilePictureUrl() { throw new Error('no pp'); },
    async onWhatsApp() { return [['27633551226', { exists: true, jid: '27633551226@s.whatsapp.net' }]]; },
    ev: { on() {}, off() {}, emit() {} },
    ws: { readyState: 1 },
    logger: {},
  };
}

// A reply/reaction pair that proves the command got past its own try/catch.
function textOf(s) {
  const c = s.content || {};
  return String(c.text || c.caption || '');
}
const RAW_JS = /is not defined|is not a function|TypeError|ReferenceError|Cannot read propert|Cannot read prop|ETIMEDOUT|ENOTFOUND|at Object\.|at async/;

test('!apply <team> <number> completes end-to-end as the owner', async () => {
  // The live regression that started this: `!apply ssrs <number>` returned
  // "Ag no man — extra is not defined" because the owner-bypass gate read
  // a variable that does not exist in that scope.
  const LRM = '\u200E';
  const teamKey = Object.keys(config.crewTeams || {})[0];
  assert.ok(teamKey, 'config.crewTeams must have at least one team');
  const msg = {
    key: { remoteJid: OWNER, fromMe: false, id: 'SMOKE-APPLY' },
    message: { extendedTextMessage: { text: `${P}apply ${teamKey} ${LRM}+27 63 355 1226` } },
    pushName: 'KAMI',
  };
  const sock = mkSock();
  await handler.handleMessage(sock, msg);

  const texts = sock.sent.map(textOf).join('\n');
  // The regression: this line produced ZERO replies, because the gate threw
  // before the command ran and the outer catch answered "extra is not defined".
  assert.ok(!/is not defined/i.test(texts), 'no ReferenceError reached the user');
  assert.ok(texts.trim().length > 0, 'the command produced an actual reply');
  assert.match(texts, /APPLICATION|already/i, 'a themed apply reply, not a generic error');
});

test('every command runs through handler.js without throwing', async (t) => {
  const cmds = loadCommands();
  const seen = new Set();
  const threw = [];
  const leaked = [];

  for (const [name, cmd] of cmds) {
    if (seen.has(name)) continue;
    seen.add(name);
    if (typeof cmd.execute !== 'function') continue;

    const msg = {
      key: { remoteJid: OWNER, fromMe: false, id: 'SMOKE-' + name },
      message: { extendedTextMessage: { text: `${P}${name}` } },
      pushName: 'KAMI',
    };
    const sock = mkSock();
    try {
      await handler.handleMessage(sock, msg);
      const bad = sock.sent.filter(s => RAW_JS.test(textOf(s)));
      for (const b of bad) leaked.push(`${name}: ${textOf(b).slice(0, 120)}`);
    } catch (e) {
      threw.push(`${name}: ${e.message}`);
    }
  }

  // Report every offender at once — one line per bug is far more useful
  // than a single failing assert on the first one.
  assert.deepStrictEqual(threw, [], 'commands that threw (user saw a generic error):');
  assert.deepStrictEqual(leaked, [], 'commands that leaked raw JS into the reply:');
});

test.after(() => {
  if (CREW_SNAPSHOT !== null) fs.writeFileSync(CREW_DB, CREW_SNAPSHOT);
  else if (fs.existsSync(CREW_DB)) fs.unlinkSync(CREW_DB);
});