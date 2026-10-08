/**
 * Bounded promises for download commands.
 *
 * Some remote calls in this bot have NO timeout of their own: node-fetch
 * inside ruhend-scraper (igdl/ttdl/fbdl), Baileys' {url} media sends
 * (axios default timeout = 0 = infinite), and raw stream collects. A
 * stall used to leave execute() pending forever — reactions froze on the
 * ⬇️ generating stage with no ❌ and no error text, because
 * runWithReactions only enqueues the verdict AFTER execute settles.
 *
 * Wrap every unbounded await in withTimeout(promise, ms, label), and
 * give the whole command a watchdog race — see commands/media/tiktok.js
 * for the pattern (run body + abort flag + outer catch reporting ❌,
 * env-seam WATCHDOG_MS for tests).
 */

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms
    );
  });
  // A timed-out promise keeps running in the background — swallow its
  // eventual rejection so it never becomes an unhandled rejection.
  promise.catch(() => {});
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = { withTimeout };
