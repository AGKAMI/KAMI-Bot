/**
 * Group action helper — honest outcomes for groupParticipantsUpdate.
 *
 * Baileys returns a per-participant status code AND can throw; the
 * commands used to ignore both and reply "✅ SUCCESS" unconditionally
 * (privacy-blocked adds reported as added, kicks that failed reported
 * as kicked). This helper normalises the codes:
 *
 *   200/201  → ok
 *   408      → already in the group (add: goal state reached)
 *   407/404  → not in the group (remove: goal state reached)
 *   403      → forbidden — privacy settings / bot lacks permission
 *   other    → failed
 *
 * `candidateJids`: try each jid variant until a definitive result —
 * LID/PN mismatches reject some variants but not others.
 */

const OK_CODES = new Set(['200', '201']);
// codes that mean "the goal state already holds" per action
const ALREADY_CODES = {
  add: new Set(['408']),            // already in the group
  remove: new Set(['403', '404', '407']), // not in the group / gone
  promote: new Set(['408']),        // already admin (WA uses 408 for no-op-ish)
  demote: new Set(['408']),
};

async function groupAction(sock, groupJid, candidateJids, action) {
  const result = { ok: false, code: null, error: null, alreadyDone: false };
  const jids = Array.isArray(candidateJids) ? candidateJids : [candidateJids];
  let lastError = 'no candidates';

  for (const jid of jids) {
    if (!jid) continue;
    try {
      const res = await sock.groupParticipantsUpdate(groupJid, [jid], action);
      const raw = res && (res[0] || (Array.isArray(res) && res.find(Boolean)));
      const code = String((raw && (raw.status ?? raw.code)) ?? '');
      result.code = code || null;
      if (OK_CODES.has(code)) {
        result.ok = true;
        result.error = null;
        return result;
      }
      if (ALREADY_CODES[action] && ALREADY_CODES[action].has(code)) {
        result.ok = true;
        result.alreadyDone = true;
        result.error = null;
        return result;
      }
      lastError = 'status ' + (code || 'unknown');
    } catch (e) {
      lastError = e.message;
      result.code = null;
    }
  }
  result.error = lastError;
  return result;
}

module.exports = { groupAction };
