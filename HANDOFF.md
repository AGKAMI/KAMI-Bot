# HANDOFF — KAMI Bot

> Rewritten 2026-10-20 (honesty batch shipped). Supersedes the join-gate/protection handoff — that work shipped and is closed.

## Goal
Keep KAMI Bot (WhatsApp, Baileys, 256MB box) healthy and shipped autonomously: commit → push → MCP apply → verify box HEAD + CONNECTED. Completed phase: **every participant-op reply is now truthful** — no success copy for refused WhatsApp API calls (the `!add` bug family), no command names in user-facing DM copy, join-gate/protection/add interplay fixed so bot- or owner-authored adds never gate-kick.

## Current State
- **Live box** = deployment `b0665152-9b54-4ede-a11f-45c4a6641704`, HEAD = **`bb8eaf9`** (verified via `deployments_shell`), CONNECTED, ~97/256MB. Prefix `!`.
- **`bb8eaf9` apply number-parsing fix** (after KAMI's live bug report: `!crew apply kssmp +27 64 932 7419` → "You're already in the Metro Police group, ne" — about the SENDER; bare `!apply <number>` → usage dump): pasted numbers carry invisible/bidi/fullwidth junk that failed `resolveUser`'s strict token regex → target resolved to nobody → silent SELF-apply. `cleanPhoneToken` sanitizes before token tests; apply.js has-team path replies real errors (never silent self-apply) with a `[APPLY] unresolved …` diag log of the raw args; bot-own-number gets an honest answer in both paths; usage example no longer shows the bot's own number. Verified 16/16 token cases + 10/10 e2e harness + 76/79 suite. NOTE: an external `git checkout`/`git clean` reset the local tree at 02:10:50 (HANDOFF edit lost, ft11.txt removed) — the commit was already pushed/deployed, nothing of code was lost; if it happens again, just re-apply doc edits.
- **The honesty batch shipped as TWO commits**:
  - `f62022f` (parallel agent's layer): `utils/groupActions.js` created; status-gated replies in add/kick/promote/demote/warn(×2)/crew-add/crew-remove/crew-accept/owner-addto; `tests/memberPicker.test.js` mock returns `{status,jid}` arrays.
  - `e0baf01` (this session's layer): variant-aware loop semantics in `groupActions`, add-failure code branches (403-only → privacy+invite DM), protection-path demotes gated (kick.js/demote.js), `removefrom` converted, `crew/remove` scope bug fixed, `crew/add` ledger only on ok, joinGate truthful kick + owner/bot author exemptions + `KAMI didn't add you either` copy, protectionDm gated re-add, handler 10 moderated-action kick sites gated, autoProgression throw-on-refusal (flags kept).
- Tests: **76/79** (exact baseline — the 3 fails are the known `tests/eventWizard.test.js` reds :146/:257/:328; do NOT "fix"). `database/crew.json` gitignored — snapshot/restore locally, never commits.
- Bot ops verified live: boot log shows `💀 KAMI BOT CONNECTED 💀`, prefix `!`.

## What Was Tried That Failed
- **First `groupActions` loop returned on the FIRST candidate's code** — candidates are identity variants of one person (device-strip → LID → PN → original) and variant-dependent refusals are REAL (exact-PN jid can 403/404 while LID form succeeds). Fixed in `e0baf01`: stop only on 200/already-in/425; 403/404/throws continue to next variant; loop-end rules: remove+all-404 = already gone, any-403 = code `403`, add+all-404 = not on WhatsApp.
- **A second agent worked the SAME task list in the same working tree** (06:27–07:32). Mitigation: polled file mtimes until 180s quiet, took over, let it land its own commit (`f62022f`) instead of racing. If writes to commands/utils/handler.js resume (check mtimes), stop and re-coordinate.
- Long `edit` oldStrings containing emoji failed on `demote.js` — split into smaller ASCII-heavy edits; watch trailing space in `await sock.sendMessage(from, { `.
- Known, undecided: `commands/media/instagram.js:142` + `commands/media/tiktok.js:154` still uncapped `video: { url }` — same OOM pattern fixed in facebook.js. KAMI never decided; apply `downloadToTempFile` pattern if it comes up.

## Active Files
- `utils/groupActions.js` — core helper; loop-end rules documented in its header. Read before changing.
- `utils/joinGate.js` — kickAndGrace gated, owner-actor pass, LID-safe `isBotActor`, `markBotAdded` export (only ledger when `addOutcome.ok`).
- `utils/protectionDm.js` — `tryReadd` gated + `markBotAdded` belt on button success.
- `utils/autoProgression.js` — both kick passes throw on refusal → catch keeps flags (policy: failures keep flags).
- `handler.js` — top-level `groupAction` require; gated sites: antitag, badword, flood, kickban, auto-repromote, tryAddOwner, owner/admin re-promote audit, antilink-warn, antigroupmention, groudptag-warn. Deliberately left: antilink `action==='kick'` branch (~:2683) — its message only claims "Link removed" (the delete that succeeded), kick result unclaimed → no lie.
- `commands/admin/{add,kick,demote,promote,warn}.js`, `commands/crew/{add,remove,accept}.js`, `commands/owner/{addto,removefrom}.js` — converted.
- `HANDOFF.md` — this file.

## Known Gotchas
- **Baileys 7.0.0-rc13**: `groupParticipantsUpdate` returns `{status: p.attrs.error || '200', jid}[]`, resolves on refusal, never throws; Baileys source has NO canonical mapping for 407/408/409 (raw server attr). Mapping rule: **prefer a FALSE FAILURE over a FALSE SUCCESS** — never report ok unless WhatsApp said 200/201 (or goal state provably holds).
- Codes: 200 ok / 403 refused (privacy or bot-not-admin) / 404 not-on-WA or not-in-group / 409 conflict / 425 rate-limited. `remove`+403 is NOT "already gone".
- **TWO SERVERS**: live = `b0665152-…` / SFTP `u9mg7ylz`; panel `08b6894d` is DEAD. `bhk_` keys → `POST https://bot-hosting.net/api/mcp` (JSON-RPC `tools/call`, param `id`); `deployments_apply` = pull+restart; "A sync is already running" → wait ~52s retry; verify HEAD with `deployments_shell {command: "git -C /home/container log --oneline -1"}`.
- Panel console buffer ~16-100 lines — verify from box HEAD / state files / apply-response boot logs, not live logs.
- **buttonHelper dispatch is fire-and-forget** — tests MUST `await getLastHandlerPromise()` after `handleButtonResponse`.
- Scoping rule when adding `const { groupAction } = …`: nested block consts shadow later ancestor-scope consts (legal); two consts in the SAME scope = SyntaxError → `handler.js` uses ONE top-level require. `crew/remove.js` had `buildComparableIds` referenced outside its `if` block → ReferenceError swallowed by catch → every kick falsely "couldn't kick" (fixed in `e0baf01`).
- PS 5.1: no `&&`; `>` writes UTF-16 (use `cmd /c "git diff > %TEMP%\f.txt"`); git push shows spurious NativeCommandError — verify `…main -> main`.
- Tests: `node --test --test-force-exit tests\*.test.js` (kill stray node procs first); known 3 eventWizard reds.
- `database/*.json` gitignored — local copies never deploy; box keeps its own.
- Memory guard: non-reclaim ≥215MB×2 or current ≥254MB×2 → flush + `exit(1)`. Uncapped `video: { url }` sends are the tripwire.
- Chrome broken — verify HTML demos with the Node DOM-stub harness.
- Never-commit list: `__pycache__/`, `app.json`, `check.js`, `check_disk.py`, `upload_*.py`, **`ft11.txt` (new stray button-audit log)** — stage explicit paths only. Box also has untracked `.bh-history/` + `commands/general/qr.js` (box-local, don't touch).

## Next Steps
0. Watch KAMI's next `!apply` / `!crew apply <team> <number>` attempt — pasted numbers must now resolve (bare `!apply <number>` → invite cards; team path targets the NUMBER → "@<number> is already chilling" if they're already in). If anything still misbehaves, grep logs for `[APPLY] unresolved` — it prints the exact raw args WhatsApp delivered.
1. Watch the first REAL privacy-blocked `!add` (403) on the live box: expected = honest ❌ refused copy + invite-DM flow (only on 403); 404/406 → "not on WhatsApp" with no DM; 425 → rate-limit reply. First admin-UI kick of a protected member: offer flow still intact + kick only claims success when the API said 200.
2. (KAMI decision pending) Apply the `facebook.js` temp-file capping pattern to `instagram.js:142` + `tiktok.js:154`.
3. Restart opencode so `/feature-viz` + the feature-viz skill register (if not done).
4. (optional, not urgent) Audit debt: `isBotAdmin` cached-metadata staleness, `.loli` name reputation, dead files (`utils/helpers.js`/`confirm.js`/`channelInfo.js`/`utils/tictactoe.js`), pies.js dead API, `igs`/`igsc` fork merge, owner-hub button-id overlap debt.

## Memory Keys
- mcp__claude-flow__memory_search { query: "KAMI groupActions truthful replies join gate protection variant jid 403 425", namespace: "project" }
