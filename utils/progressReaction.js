/**
 * Progressive Command Reactions
 *
 * Every registered command gets staged reactions on the user's message:
 *   received  -> command accepted, handler is working on it
 *   generating -> (heavy commands only) still producing output
 *   done      -> output delivered (the command's own unique emoji)
 *   confirm   -> final verdict: ✅ success, ❌ failure (fires after a
 *                short beat so the unique `done` emoji is readable)
 *   error     -> command threw — this IS the ❌ verdict, `done` is skipped
 *   deny      -> request was NOT ALLOWED (permissions/restrictions) — 🚫
 *
 * Final verdict precedence (first match wins):
 *   1. denied  -> 🚫  (extra.deny(), or a ❌-reply that reads like a
 *                    permission rejection — see classifyReply)
 *   2. failed  -> ❌  (extra.fail(), a thrown error, or the last reply
 *                    started with ❌)
 *   3. else    -> ✅  (unique `done` emoji, then confirm)
 *
 * Commands that swallow their own errors should call `extra.fail()` —
 * but as a safety net the handler classifies every `extra.reply` text:
 * a leading ❌ marks failure, and permission-flavoured ❌ texts mark a
 * denial. So no command can reply `❌ ERROR …` and still end on ✅.
 *
 * Each command declares its own unique trio in its module.exports:
 *   reactions: { received: '🎨', generating: '🪄', done: '🩵' }
 *
 * Light commands simply omit `generating` and get a 2-stage flow.
 *
 * Implementation notes:
 *   - Reactions are ENQUEUED on a per-invocation promise chain, never
 *     awaited inline, so they never delay command execution. The 500ms
 *     confirm beat lives on that chain only — `runWithReactions` returns
 *     as soon as execute() settles.
 *   - The chain preserves order (received -> generating -> done -> ✅)
 *     even though the command itself runs concurrently.
 *   - `generating` is armed on a short timer and cancelled the moment
 *     execute() settles, so fast commands never flash a stage they
 *     didn't really have.
 *   - When a command's `done` is already ✅ the confirm stage is skipped
 *     (nothing left to show) — no redundant network call.
 */

const config = require('../config');

const STAGE_KEYS = new Set(['received', 'generating', 'done', 'confirm', 'error', 'deny']);

const DEFAULTS = {
  received: '📥',
  generating: '⚙️',
  done: '✅',
  confirm: '✅',
  error: '❌',
  deny: '🚫',
};

// The LAST reply wins: a ❌-leading final message marks failure, so an
// early inline warning can't poison a successful run (and a late error
// can't be hidden behind an earlier ✅). Permission-flavoured ❌ texts
// ("only KAMI…", "admins only", "not allowed"…) escalate to a denial.
const REPLY_FAIL_RE = /^\s*❌/;
const REPLY_DENY_RE = new RegExp(
  [
    'only\\s+(kami|the\\s+owner|owner|admins?|mods?)',
    'admins?\\s+only',
    'mods?\\s+only',
    'owner\\s+only',
    'not\\s+allowed',
    'not\\s+permitted',
    'forbidden',
    'no\\s+permission',
    "don'?t\\s+have\\s+permission",
    'not\\s+authori[sz]ed',
  ].join('|'),
  'i'
);

/**
 * Classify a reply/reject text for the verdict:
 *   'none'  -> doesn't signal a failure (normal output)
 *   'fail'  -> signals failure (❌-leading)        -> verdict ❌
 *   'deny'  -> signals not-allowed                -> verdict 🚫
 * Returns 'none' for anything that isn't ❌-leading, so success text
 * (✅/plain) and ⚠️-warnings stay neutral.
 */
const classifyReply = (text) => {
  if (typeof text !== 'string') return 'none';
  // A 🚫-leading reply IS a not-allowed signal — no phrase matching needed.
  if (/^\s*🚫/.test(text)) return 'deny';
  if (!REPLY_FAIL_RE.test(text)) return 'none';
  return REPLY_DENY_RE.test(text) ? 'deny' : 'fail';
};

// Fallbacks for any command that forgets to declare a stage.
const CATEGORY_DEFAULTS = {
  admin:    { received: '🛡️', done: '✅' },
  ai:       { received: '🧠', done: '✨' },
  anime:    { received: '🖼️', done: '✅' },
  crew:     { received: '🎖️', done: '✅' },
  fun:      { received: '🎉', done: '😄' },
  games:    { received: '🎮', done: '🏁' },
  general:  { received: '📋', done: '✅' },
  media:    { received: '📥', done: '✅' },
  owner:    { received: '🔑', done: '✅' },
  textmaker:{ received: '✍️', done: '✨' },
  utility:  { received: '🧰', done: '✅' },
};

// How long to wait before showing `generating` for a command that
// declared one. Kept deliberately low so the progression feels instant;
// anything that finishes faster than this never shows the stage at all.
const GENERATING_DELAY = 150;

// Beat between the command's unique `done` emoji and the final ✅ verdict,
// so the tick reads as a confirmation instead of the same frame.
const CONFIRM_DELAY = 500;

/**
 * Merge a command's declared reactions over its category defaults over
 * the global defaults. Returns null when the feature is switched off.
 */
const resolve = (command) => {
  if (!config.progressReactions) return null;

  const merged = {
    ...DEFAULTS,
    ...(CATEGORY_DEFAULTS[command?.category] || {}),
    ...(command?.reactions || {}),
  };

  // 2-stage commands don't declare `generating` — strip any inherited one
  // so the timer is never armed for them.
  if (!command?.reactions?.generating) delete merged.generating;

  return merged;
};

/**
 * Resolve a stage name (or a literal emoji) to the emoji a command
 * should show. Used by `extra.stage()`.
 */
const stageEmoji = (command, nameOrEmoji) => {
  if (STAGE_KEYS.has(nameOrEmoji)) {
    const spec = resolve(command) || DEFAULTS;
    return spec[nameOrEmoji] || DEFAULTS[nameOrEmoji];
  }
  return nameOrEmoji;
};

const react = async (ctx, emoji) => {
  if (!emoji || !ctx?.sock || !ctx?.msg?.key) return;
  try {
    await ctx.sock.sendMessage(ctx.from, { react: { text: emoji, key: ctx.msg.key } });
  } catch (err) {
    console.error('[PROGRESS-REACT] react failed:', err.message);
  }
};

/**
 * Run a command wrapped in its reaction lifecycle.
 * Returns whatever the command returns; re-throws its errors unchanged.
 */
const runWithReactions = async (command, ctx, executeFn) => {
  const spec = resolve(command);
  if (!spec) return executeFn();

  // Serialises stage emissions so they always land in order, without
  // ever blocking the command on a network round trip.
  let chain = Promise.resolve();
  const enqueue = (emoji) => {
    if (!emoji) return;
    chain = chain.then(() => react(ctx, emoji)).catch(() => {});
  };
  // Same, but waits `ms` first — used for the final ✅ verdict.
  const enqueueAfter = (emoji, ms) => {
    if (!emoji) return;
    chain = chain
      .then(() => new Promise((resolve) => setTimeout(resolve, ms)))
      .then(() => react(ctx, emoji))
      .catch(() => {});
  };

  let finished = false;
  let generatingTimer = null;

  enqueue(spec.received);

  if (spec.generating) {
    generatingTimer = setTimeout(() => {
      if (!finished) enqueue(spec.generating);
    }, GENERATING_DELAY);
  }

  try {
    const result = await executeFn();
    finished = true;
    if (generatingTimer) clearTimeout(generatingTimer);
    // Verdict precedence: not-allowed (🚫) beats failure (❌) beats success.
    // `denied`/`failed` are set explicitly via extra.deny()/extra.fail();
    // `replyVerdict` is the safety net from classifying the last reply.
    const outcome = ctx.outcome || {};
    const denied = outcome.denied === true || outcome.replyVerdict === 'deny';
    const failed = outcome.failed === true || outcome.replyVerdict === 'fail';
    if (denied) {
      enqueue(spec.deny || DEFAULTS.deny);
    } else if (failed) {
      // Failure path never gets ✅ — ❌ is the verdict.
      enqueue(spec.error);
    } else {
      enqueue(spec.done);
      // Failure path never gets here, so ✅ is unambiguous. Skipped when the
      // command already finished on ✅ itself.
      if (spec.confirm && spec.confirm !== spec.done) {
        enqueueAfter(spec.confirm, CONFIRM_DELAY);
      }
    }
    return result;
  } catch (err) {
    finished = true;
    if (generatingTimer) clearTimeout(generatingTimer);
    // No `done` on failure — ❌ is the verdict (a throw means the command
    // broke, even if it had denied earlier).
    enqueue(spec.error);
    throw err;
  }
};

module.exports = {
  resolve,
  stageEmoji,
  react,
  runWithReactions,
  classifyReply,
  DEFAULTS,
  STAGE_KEYS,
  GENERATING_DELAY,
  CONFIRM_DELAY,
};
