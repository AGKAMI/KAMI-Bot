/**
 * Bot Agent Logger — centralized structured event tracking for developers/agents.
 *
 * Every command execution, database mutation, JID resolution, and error is
 * logged as a single-line JSON object (NDJSON) to database/bot.log, plus a
 * ring buffer in memory for fast querying by agents.
 *
 * Usage:
 *   const { logCommand, logError, logDbChange, logJidResolution, getLogs,
 *           getRecentErrors, init } = require('../utils/botLogger');
 *   init();                              // call once at startup
 *   logCommand('apply', sender, from, args, result, durationMs);
 *   logError(new Error('...'), { command: 'apply', jid: '...' });
 *   logDbChange('crew_member', 'add', jid, teamKey, before, after, adminJid);
 *   logJidResolution(inputJid, resolvedJid, variants, matchReason, source);
 *
 * All timestamps are ISO-8601 UTC. Fields are nested under `type` so agents
 * can grep/filter: `grep '"type":"error"' database/bot.log`
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'database');
const LOG_FILE = path.join(LOG_DIR, 'bot.log');
const MAX_MEMORY = 2000;      // recent entries kept in memory for querying
let writeStream = null;
let memoryBuffer = [];

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) {
    try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (e) {}
  }
}

function init() {
  ensureDir();
  try {
    writeStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  } catch (e) {
    // If we can't open the log file, silently fall back to memory-only.
    writeStream = null;
  }
}

function _write(entry) {
  const line = JSON.stringify(entry) + '\n';
  if (writeStream) {
    try { writeStream.write(line); } catch (e) {}
  }
  memoryBuffer.push(entry);
  if (memoryBuffer.length > MAX_MEMORY) memoryBuffer.shift();
}

function _entry(type, data) {
  return { timestamp: new Date().toISOString(), type, ...data };
}

/**
 * Log a command execution.
 * @param {string} command — command name (e.g. 'apply', 'accept', 'song')
 * @param {string} sender — sender JID
 * @param {string} from — chat JID
 * @param {object|undefined} args — parsed arguments
 * @param {object|undefined} result — command result object { ok, error, ... }
 * @param {number} durationMs — execution duration
 */
function logCommand(command, sender, from, args, result, durationMs) {
  _write(_entry('command', {
    command, sender, from,
    args: args !== undefined ? JSON.stringify(args) : null,
    result: result !== undefined
      ? (result.ok !== undefined ? (result.ok ? 'OK' : result.error || 'fail') : 'sent')
      : 'sent',
    durationMs: durationMs !== undefined ? durationMs : null
  }));
}

/**
 * Log an error with full context for agent debugging.
 * @param {Error} error — the Error object
 * @param {object} context — arbitrary context (command, jid, teamKey, input, etc.)
 */
function logError(error, context = {}) {
  _write(_entry('error', {
    message: error && error.message ? error.message : String(error),
    stack: error && error.stack ? error.stack : null,
    context: context !== undefined ? JSON.stringify(context) : null
  }));
}

/**
 * Log a database state change (crew member add/remove, app accept/deny, etc.)
 * @param {string} entity — 'crew_member' | 'applicant' | 'processed_app' | 'team_admin'
 * @param {string} action — 'add' | 'remove' | 'update' | 'accept' | 'deny' | 'create'
 * @param {string} jid — affected JID
 * @param {string} teamKey — team abbreviation (e.g. 'KSSMP')
 * @param {object|undefined} before — state before change
 * @param {object|undefined} after — state after change
 * @param {string} adminJid — JID of admin who triggered the change (or 'bot' / 'system')
 */
function logDbChange(entity, action, jid, teamKey, before, after, adminJid) {
  _write(_entry('db_change', {
    entity, action, jid, teamKey,
    before: before !== undefined ? JSON.stringify(before) : null,
    after: after !== undefined ? JSON.stringify(after) : null,
    adminJid: adminJid || null
  }));
}

/**
 * Log a JID resolution decision (PN/LID matching) so agents can debug
 * why a particular JID matched a crew member or applicant.
 * @param {string} inputJid — JID as provided by the user/command
 * @param {string|undefined} resolvedJid — JID after normalization/resolution
 * @param {string[]|undefined} variants — all comparable JID variants generated
 * @param {string} matchReason — 'exact' | 'variant' | 'lid-to-pn' | 'pn-to-lid' | 'none'
 * @param {string} source — calling context (e.g. 'apply.createApplication', 'accept')
 */
function logJidResolution(inputJid, resolvedJid, variants, matchReason, source) {
  _write(_entry('jid_resolution', {
    inputJid,
    resolvedJid: resolvedJid || null,
    variants: variants !== undefined ? JSON.stringify(variants) : null,
    matchReason,
    source: source || null
  }));
}

/**
 * Log a generic agent-relevant event.
 * @param {string} eventType — free-form event name
 * @param {object} data — arbitrary structured data
 */
function logEvent(eventType, data = {}) {
  _write(_entry(eventType, data));
}

/**
 * Query recent logs from the in-memory ring buffer.
 * @param {object} filter — { type, command, sender, jid, from, since, until }
 * @param {number} limit — max entries to return
 * @returns {array}
 */
function getLogs(filter = {}, limit = 100) {
  let results = memoryBuffer;
  if (filter.type) results = results.filter(e => e.type === filter.type);
  if (filter.command) results = results.filter(e => e.command === filter.command);
  if (filter.sender) results = results.filter(e => e.sender === filter.sender);
  if (filter.jid) {
    results = results.filter(e =>
      e.jid === filter.jid || e.inputJid === filter.jid ||
      e.resolvedJid === filter.jid ||
      (e.context && e.context.includes(filter.jid))
    );
  }
  if (filter.from) results = results.filter(e => e.from === filter.from);
  if (filter.since) results = results.filter(e => new Date(e.timestamp) >= new Date(filter.since));
  if (filter.until) results = results.filter(e => new Date(e.timestamp) <= new Date(filter.until));
  return results.slice(-limit);
}

/**
 * Get recent error entries for agent debugging.
 * @param {number} limit
 * @returns {array}
 */
function getRecentErrors(limit = 50) {
  return memoryBuffer.filter(e => e.type === 'error').slice(-limit);
}

/**
 * Get JID resolution lookups for a specific JID (helps debug false-positive
 * "already in crew" matches).
 * @param {string} jid
 * @param {number} limit
 * @returns {array}
 */
function getCrewMemberLookups(jid, limit = 50) {
  return memoryBuffer
    .filter(e => e.type === 'jid_resolution' &&
      (e.inputJid === jid || e.resolvedJid === jid ||
       (e.variants && e.variants.includes(jid))))
    .slice(-limit);
}

module.exports = { init, logCommand, logError, logDbChange, logJidResolution, logEvent, getLogs, getRecentErrors, getCrewMemberLookups };
