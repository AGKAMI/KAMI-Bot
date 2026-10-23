# HANDOFF — KAMI Bot

> Rewritten 2026-10-20 (honesty batch shipped). Updated 2026-10-24 (quote-everything sweep shipped as `c31d7ff`). Supersedes the join-gate/protection handoff — that work shipped and is closed.

## Goal
Keep KAMI Bot (WhatsApp, Baileys, 256MB box) healthy and shipped autonomously: commit → push → MCP apply → verify box HEAD + CONNECTED. Completed phases: (1) every participant-op reply is truthful — no success copy for refused WhatsApp API calls, no command names in user-facing DM copy, join-gate/protection/add interplay fixed; (2) **every bot reply quotes the message that triggered it** (commands, button taps, wizard steps, moderation notices — KAMI's directive: e.g. the antigroupmention status-tag reply quotes the status-mention message).

## Current State
- **Live box** = deployment `b0665152-9b54-4ede-a11f-45c4a6641704`, HEAD = **`c31d7ff`** (verified via `deployments_shell`), CONNECTED, 98/256MB. Prefix `!`.
- **`c31d7ff` quote-everything sweep** (37 files, +246/−245): every same-chat reply now carries `{ quoted: msg }`. Sweep rules: quote when the reply lands in the SAME chat as the trigger and a trigger message exists; SKIP cross-chat DMs (add/kick/demote target+owner DMs, report admin DMs, applicant DMs, protectionDm owner/member pings, joinGate/anticall DMs), broadcasts (announce/adminpush/broadcast), welcome/goodbye/anticall/kickban notices (join/leave/call EVENTS — no trigger message), `{ delete:`/`{ pin:`/`{ react:` ops, `edit:` progress sends (edits can't quote), and timer-driven messages (poll end, reminders, eventReminders, autoProgression scans). Timer closures (giveaway) intentionally quote the ORIGINAL command message.
- Coverage: handler.js (DM-blocker nudges, AFK, badword, flood, slowmode, antilink, antigroupmention); all admin panels/buttons (warn/ban/kick/demote/antifamily panels/autosticker/slowmode/lock/mute/welcome/goodbye/warnings/setteamimage/giveaway+kickcfg); crew (apply/applyInteractive wizard Qs+review+confirm thread `msg` through `sendCurrentQuestion/sendReview/sendQuestionPicker/getSessionOrExpired/submitApplication/runBotReview`, attend/events/result/eventRsvp, eventWizard `_expiredNotice/publishEvent` threaded); general (menu — `sendCategoryView/sendMorePage` threaded + admin/owner refusals, start, poll, order, owner, teaminfo); media (lyrics, tiktok slideshow first image); utils (joinGate grace buttons, protectionDm offer buttons, sendButtons `sendSfw` already ok). Verified with an AST-ish scanner (60-line window, counts `, msg)`/`, quoted)` as quoting, excludes delete/react/pin/edit): **zero unclassified same-chat sends remain** — everything left is a classified skip category.
- Git chain: `f62022f` → `e0baf01` → `003f956` → `bb8eaf9` → `18dfcfe` (HANDOFF checkpoint) → **`c31d7ff`** (quote sweep). `18dfcfe` re-applied the HANDOFF after an external checkout/clean reset the tree (nothing of code lost; if it recurs, re-apply doc edits).
- **`bb8eaf9` apply number-parsing fix** (after KAMI's live bug report: `!crew apply kssmp +27 64 932 7419` → "You're already in the Metro Police group, ne" — about the SENDER; bare `!apply <number>` → usage dump): pasted numbers carry invisible/bidi/fullwidth junk that failed `resolveUser`'s strict token regex → target resolved to nobody → silent SELF-apply. `cleanPhoneToken` sanitizes before token tests; apply.js has-team path replies real errors (never silent self-apply) with a `[APPLY] unresolved …` diag log of the raw args; bot-own-number gets an honest answer in both paths.
- The honesty batch shipped as TWO commits: `f62022f` (parallel agent's layer: `utils/groupActions.js`, status-gated replies) + `e0baf01` (variant-aware loop semantics, add-failure 403→privacy+invite DM, protection gating, joinGate truthful kick + owner/bot exemptions).
- Tests: **76/79** (exact baseline — the 3 fails are the known `tests/eventWizard.test.js` reds :146/:257/:328 — note the :328 test's assertion failure line is :344, "UNPIN-TARGET-1"; do NOT "fix"). `database/crew.json` gitignored — snapshot/restore locally, never commits.
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
0. Watch KAMI test the quoting on the live box: any command reply / button confirmation / wizard step should now carry the quoted trigger. If a reply DOESN'T quote, grep the file for its send — skip categories are documented in Current State (cross-chat DMs, events, edits, timers are deliberate).
1. Watch the first REAL privacy-blocked `!add` (403) on the live box: expected = honest ❌ refused copy + invite-DM flow (only on 403); 404/406 → "not on WhatsApp" with no DM; 425 → rate-limit reply. First admin-UI kick of a protected member: offer flow still intact + kick only claims success when the API said 200. Also watch the next `!apply` — pasted numbers must resolve; if not, grep logs for `[APPLY] unresolved`.
2. (KAMI decision pending) Apply the `facebook.js` temp-file capping pattern to `instagram.js:142` + `tiktok.js:154`.
3. Restart opencode so `/feature-viz` + the feature-viz skill register (if not done).
4. (optional, not urgent) Audit debt: `isBotAdmin` cached-metadata staleness, `.loli` name reputation, dead files (`utils/helpers.js`/`confirm.js`/`channelInfo.js`/`utils/tictactoe.js`), pies.js dead API, `igs`/`igsc` fork merge, owner-hub button-id overlap debt.

## Memory Keys
- mcp__claude-flow__memory_search { query: "KAMI groupActions truthful replies join gate protection variant jid 403 425", namespace: "project" }
