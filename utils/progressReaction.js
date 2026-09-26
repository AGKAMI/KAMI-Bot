/**
 * Progressive Command Reactions
 *
 * Every registered command gets staged reactions on the user's message:
 *   received  -> command accepted, handler is working on it
 *   generating -> (heavy commands only) still producing output
 *   done      -> output delivered
 *   error     -> command threw
 *
 * Each command declares its own unique trio in its module.exports:
 *   reactions: { received: '🎨', generating: '🪄', done: '🩵' }
 *
 * Light commands simply omit `generating` and get a 2-stage flow.
 *
 * Implementation notes:
 *   - Reactions are ENQUEUED on a per-invocation promise chain, never
 *     awaited inline, so they never delay command execution.
 *   - The chain preserves order (received -> generating -> done) even
 *     though the command itself runs concurrently.
 *   - `generating` is armed on a short timer and cancelled the moment
 *     execute() settles, so fast commands never flash a stage they
 *     didn't really have.
 */

const config = require('../config');

const STAGE_KEYS = new Set(['received', 'generating', 'done', 'error']);

const DEFAULTS = {
  received: '📥',
  generating: '⚙️',
  done: '✅',
  error: '❌',
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
    enqueue(spec.done);
    return result;
  } catch (err) {
    finished = true;
    if (generatingTimer) clearTimeout(generatingTimer);
    enqueue(spec.error);
    throw err;
  }
};

module.exports = {
  resolve,
  stageEmoji,
  react,
  runWithReactions,
  DEFAULTS,
  STAGE_KEYS,
  GENERATING_DELAY,
};
