# HANDOFF

## Goal
Progressive "unique per-command reaction" system for KAMI Bot: the user's command message gets staged reactions — `received` → `generating` (heavy commands only) → `done`, with a unique emoji trio per command, plus `❌` on failure. Never allowed to slow command execution.

## Current State
- DONE + COMMITTED (`bf63bc7`, 179 files) and locally verified. Not pushed, not deployed.
- `utils/progressReaction.js` — `resolve`, `stageEmoji`, `react`, `runWithReactions`, `DEFAULTS` (`📥/⚙️/✅/❌`), `CATEGORY_DEFAULTS`, `STAGE_KEYS`, `GENERATING_DELAY = 150`. Reactions are **enqueued on a per-invocation promise chain, never awaited inline** — order is serialised but the command never waits on the network. `generating` is armed on a 150ms timer and cleared the instant `execute()` settles (no flicker for fast commands).
- `config.js` → `progressReactions: true`.
- `handler.js:1431-1480` — `commandExtra` (incl. `extra.stage(nameOrEmoji)` → `stageEmoji`) built inside the existing `try`, then `await runWithReactions(command, {sock, from, msg}, () => command.execute(...))`. Errors rethrow into the pre-existing catch, so logging/reply behaviour is unchanged.
- `handler.js:744-752` — autoReact `bot` mode now skips its generic ⏳ when the typed command is known to `commands` (avoids double-reacting). `all` mode untouched.
- All **176** registered command files carry `reactions: { received, generating?, done }` right after `name:` — **67 heavy (3-stage)**, **109 light (2-stage)**, zero with `received === done`.
- 11 redundant in-command reactions removed: `tiktok.js` (🔄/✅/❌×2), `video.js` (🔄/✅/❌), `announce.js` (⏳), `facebook.js` (raw 🔄 + unused `reactOk`), `igs.js`, `igsc.js`, `instagram.js`, `pinterest.js`, `ssweb.js` (raw 📥), `report.js` (raw 🚨).
- Verification: `node --check` clean on every modified file; `loadCommands()` loads all 176 with 0 missing `reactions`; behaviour test confirmed 📱→⬇️→🎞️, 2-stage flow, and `["A","❌"]` on throw with the error still propagating.

## What Was Tried That Failed
- **First `reactions:` insertion pass put a stray blank line in 88/176 files.** Cause: with the `m` flag, JS `^` also matches *after* `\r`, so on CRLF files `^(\s+)name:` captured `"\n  "` as "indent" — the inserted line then began with an extra `\n`. Fix: `.replace(/[\r\n]/g, '')` on the captured indent, then `git checkout -- commands` and re-run. Verify with the blank-line scan (now `blank-before=0 clean=176`).
- **Error-stage reaction looked missing in a unit test** — test artifact: the chain is intentionally floating, and `process.exit(0)` immediately after the catch killed it. Re-tested with a 250ms wait → `["A","❌"]`. No code change needed.
- **Inline `node -e "..."` one-liners kept breaking** under PowerShell (quote/`$` mangling). Wrote scripts to `%TEMP%\opencode\*.js` and ran those instead.
- `node -e "loadCommands()..."` **hangs past 120s** — some command module keeps the event loop alive. Always `console.log` results then `process.exit(0)` (already noted last session).

## Active Files
- `utils/progressReaction.js` — the stage engine (new, committed).
- `handler.js` — wrap at `:1478`, `extra.stage` at `:1468`, autoReact skip at `:744`.
- `config.js` — `progressReactions` flag.
- `commands/**` (176 files) — `reactions:` metadata only.
- `%TEMP%\opencode\apply-reactions.js` — byte-level (latin1) inserter with the full emoji table `T`; idempotent (`already` counter). Reuse it for any new command file.
- `%TEMP%\opencode\check-dup.js`, `check-registry.js` — coverage/uniqueness audits.
- Left over from the previous session: `upload_sftp.py` (still untracked).

## Known Gotchas
- **CRLF + regex `^`** — never trust `(\s+)` after a `^...` anchor in this repo; files are CRLF in the working tree with autocrlf normalising to LF in git (`LF will be replaced by CRLF` warnings are expected).
- **Reactions are fire-and-forget** — `done` may land *after* the command's reply. That is intentional (never delay the user).
- **Pre-existing duplicate command names**: `poll` (`games/polls.js` + `general/poll.js`) and `translate` (`general/translate.js` + `utility/translate.js`) → 176 files, 174 unique names. Loader keeps both objects via aliases. Not touched.
- **Stages bypassed on non-handler paths**: button routes (`handler.js` ~`:818/:838/:858`), sticker/bomb/warn auto flows (~`:1010/:1042/:1217`), and internal dispatchers (`commands/crew/crew.js:180`, `commands/admin/promote.js:116`, apply flow) call `.execute()` directly.
- `commands/games/giveaway.js:279` reaction is **intentional** — it reacts to the giveaway post with `sent.key`, not the command message.
- Commands that catch their own errors and `return extra.reply(...)` count as **success** (`done` fires, not `❌`) — documented v1 limitation.
- Unknown commands + `progressReactions` on still get the generic autoReact ⏳ (only *known* commands are exempt).

## Next Steps
1. Smoke-test on WhatsApp (no test suite): heavy → `.tt <tiktok url>` expect 📱 → ⬇️ → 🎞️; light → a 2-stage command expect its two emojis; force a failure (bad permission/owner command) → expect ❌ after the received emoji.
2. Deploy when ready: `git push origin main` → restart from the bot-hosting panel (GitHub auto-pull). Nothing is pushed yet.
3. Optional follow-up: wire stages into the button routes + internal dispatchers listed under Gotchas so those paths also progress.
4. Decide whether to commit the stale `upload_sftp.py` (previous session's deploy script, still untracked).

## Memory Keys
mcp__claude-flow__memory_search { query: "KAMI-Bot progressive reactions progressReaction handler stage CRLF indent", namespace: "project" }
