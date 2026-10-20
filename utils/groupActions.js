/**
 * Group action helper — honest outcomes for groupParticipantsUpdate.
 *
 * Baileys returns a per-participant status code AND can throw; the
 * commands used to ignore both and reply "✅ SUCCESS" unconditionally
 * (privacy-blocked adds reported as added, kicks that failed reported
 * as kicked). This helper normalises the codes:
 *
 *   200/201  → ok
 *   408/409  → add: already in the group (goal state reached)
 *   404      → remove: not in the group — only when EVERY candidate
 *              variant says so (see below)
 *   403      → forbidden — privacy settings / bot lacks permission
 *   425      → rate-limited — stop trying, retry later
 *   other    → failed
 *
 * `candidateJids` are IDENTITY variants of ONE person (device-strip →
 * LID → PN → original). Variant-dependent refusals are real: an exact
 * PN jid can 403/404 while the LID form succeeds — so the loop only
 * stops early on definitive answers (200, already-in, rate-limited)
 * and tries the next variant otherwise. Loop-end rules:
 *   remove + all-404 → alreadyDone (they're provably gone)
 *   any 403 seen     → code '403' (a reachable identity refused —
 *                      add.js's privacy+invite-DM flow keys off this)
 *   add + all-404    → failed with 404 (nobody home on WhatsApp)
 *
 * Rule: prefer a FALSE FAILURE over a FALSE SUCCESS — never report ok
 * unless WhatsApp said 200/201 (or the goal state provably holds).
 */

const OK_CODES = new Set(['200', '201']);
// Definitive "goal state held" codes for add (identity-level conflict —
// a wrong variant would have 404'd, not conflicted).
// promote/demote deliberately have NONE: metadata pre-checks cover the
// real already-admin case, everything else must report honestly.
const ADD_ALREADY_CODES = new Set(['408', '409']);

async function groupAction(sock, groupJid, candidateJids, action) {
  const result = { ok: false, code: null, error: null, alreadyDone: false };
  const jids = (Array.isArray(candidateJids) ? candidateJids : [candidateJids]).filter(Boolean);
  if (!jids.length) {
    result.error = 'no candidates';
    return result;
  }

  let lastError = 'no answer from WhatsApp';
  let saw403 = false;
  let rateLimited = false;
  let all404 = true;      // every parsed answer was 404
  let sawAnyCode = false; // at least one status code was parsed

  for (const jid of jids) {
    try {
      const res = await sock.groupParticipantsUpdate(groupJid, [jid], action);
      const raw = res && (Array.isArray(res) ? res[0] : res);
      const code = String((raw && (raw.status ?? raw.code)) ?? '');
      if (code) {
        sawAnyCode = true;
        result.code = code;
        if (code !== '404') all404 = false;
        if (code === '403') saw403 = true;
      } else {
        all404 = false;
      }

      if (OK_CODES.has(code)) {
        result.ok = true;
        result.error = null;
        return result;
      }
      if (action === 'add' && ADD_ALREADY_CODES.has(code)) {
        result.ok = true;
        result.alreadyDone = true;
        result.error = null;
        return result;
      }
      if (code === '425') {
        rateLimited = true;
        lastError = 'rate-limited (425) — try again in a bit';
        break; // hammering variants makes the rate limit worse
      }
      lastError = 'status ' + (code || 'unknown');
    } catch (e) {
      lastError = e.message;
      all404 = false;
    }
  }

  // ── loop-end rules ─────────────────────────────────────────
  if (action === 'remove' && sawAnyCode && all404) {
    // every identity form says "not in the group" — goal state holds
    result.ok = true;
    result.alreadyDone = true;
    result.error = null;
    return result;
  }
  if (saw403) {
    result.code = '403';
    result.error = action === 'add'
      ? 'status 403 (blocked — privacy settings or permission)'
      : 'status 403 (not allowed)';
    return result;
  }
  if (rateLimited) {
    result.code = '425';
    result.error = lastError;
    return result;
  }
  if (action === 'add' && sawAnyCode && all404) {
    result.code = '404';
    result.error = 'status 404 (not on WhatsApp, or not reachable)';
    return result;
  }
  result.error = lastError;
  return result;
}

module.exports = { groupAction };
