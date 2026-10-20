# HANDOFF — KAMI Bot

> Rewritten 2026-10-20. Supersedes the audit-batch handoff (that work shipped and is closed).

## Goal
Keep KAMI Bot (WhatsApp, Baileys, 256MB box) healthy and shipped autonomously: commit → push → MCP apply → verify box HEAD + CONNECTED. Current phase: join-gate landed, outage fixed, `.fb` memory hardening shipped, protection re-add converted to a button-offer flow.

## Current State
- **Live box** = deployment `b0665152-9b54-4ede-a11f-45c4a6641704`, HEAD = **`f1ccf31`**, CONNECTED, ~96/256MB. Prefix `!`.
- **Shipped since previous checkpoint** (all deployed + verified):
  - `24f7473` + `914fa34` **join gate** (landed from a parallel session, NOT this one — read `utils/joinGate.js` before touching): security groups (SSRS/KSSPS/KSSMP/KSSMS, not SSGENERAL) are bot-door-only — ledger `database/joinLedger.json` (seed-grandfathered), `evaluateJoin` on add events (bot-actor / pending application / accepted pass; strangers kicked + DM'd with apply/cancel buttons), 48h grace (`database/joinGrace.json`, two-button menu, T-30min warning, block at expiry), sweep self-heals seeding every pass until all watched groups grandfathered.
  - `5039041` **outage fix**: `utils/eventReminders.js` required `'./database'` from `utils/` → module-load crash loop, bot was DOWN. Fixed to `'../database'`, started via MCP, CONNECTED.
  - `2610b4e` **`.fb` memory hardening**: `commands/media/facebook.js` now streams to a 16MB-capped temp file and sends `video: { url: tmpFile.path }` (was uncapped `video: { url }` which ballooned Node heap on a 256MB box — the 294MB guard trip during `.fb` was the outage's trigger). Deployed.
  - `abb21a8` + `754e955` **grace-funnel demo** `docs/security-grace-demo.html` (single-file interactive 3-panel sim; logic verified headlessly 23/23 — fixed unreachable `'grace'` status + T-30min off-by-one) + **feature-viz skill** at `C:\Users\ojuni\.agents\skills\feature-viz\` (+ `/feature-viz` command in `C:\Users\ojuni\.config\opencode\commands\feature-viz.md`). Restart opencode to register.
  - `f1ccf31` **protection re-add → button offer** (THIS session): new `utils/protectionDm.js` + `handler.js` remove branch. Protected member kicked by a human admin via native WhatsApp UI → DM'd a two-button offer (`protect:back:<nonce>` / `protect:pass:<nonce>`, persisted `database/protectionOffers.json`, 7-day TTL, one live offer per group+member, nonce ids, LID-safe `sameMember`, invite-link fallback on add failure). **Voluntary leave (author undefined) no longer re-adds** — the previously-dead left-tracker block now fires and notifies the owner. Bot-command kicks (`_botKicked`) and owner kicks (protection cleared) unchanged. Owner-protection (owner themselves kicked) still re-adds instantly.
- Tests: **76/79** after `f1ccf31` — the 3 fails are the known pre-existing `tests/eventWizard.test.js` reds (:146/:257/:328). Plus a 10/10 headless harness for protectionDm (`C:\Users\ojuni\AppData\Local\Temp\opencode\prot_dm_test.js`) exercising offer + both buttons through the real `handleButtonResponse` route.

## What Was Tried That Failed
- (this session) ProtectionDm harness asserted button-flow results immediately after `handleButtonResponse()` — it dispatches handlers **fire-and-forget** (`lastHandlerPromise`); fixed by `await getLastHandlerPromise()` in the harness. Real handler.js code is unaffected (production awaits nothing here; taps just resolve async).
- Known, undecided: `commands/media/instagram.js:142` + `commands/media/tiktok.js:154` still use uncapped `video: { url }` — same OOM pattern fixed in facebook.js. Offered the fix; KAMI never decided. Apply the `downloadToTempFile` pattern if it comes up.

## Active Files
- `utils/protectionDm.js` — offer store + both button handlers (statically required by handler.js so taps route from boot).
- `handler.js` :2087+ — remove branch exit-method split (`!author` = voluntary leave; else offer flow). Left-tracker block ~:2189 now reachable.
- `utils/joinGate.js` — join gate implementation (parallel session; ledger/grace/kick-DM).
- `docs/security-grace-demo.html` — committed funnel simulator.
- `HANDOFF.md` — this file.

## Known Gotchas
- **TWO SERVERS**: live = `b0665152-…` / SFTP `u9mg7ylz`; panel `08b6894d` is DEAD. `bhk_` keys → `POST https://bot-hosting.net/api/mcp` (JSON-RPC `tools/call`, param `id`); `deployments_apply` = pull+restart (this is what "deploy" means now); waitSeconds ≤ 45; "A sync is already running" → wait ~52s retry.
- Panel console buffer ~16-100 lines — verify from box `git rev-parse HEAD` via `deployments_shell`, state files, or boot logs in the apply response, not live logs.
- **buttonHelper dispatch is fire-and-forget** — tests MUST `await getLastHandlerPromise()` after `handleButtonResponse` or async handler assertions race.
- **PS 5.1 `>` writes UTF-16** — `rg`/plain-text tooling sees nothing; read such files with `Get-Content`. Node's spec reporter prints `ℹ pass N` (not TAP `# pass`) — match accordingly.
- Tests: `node --test --test-force-exit tests\*.test.js`; snapshot `database/crew.json` before/after (verified unchanged this session); known 3 eventWizard reds — do NOT "fix" silently.
- `database/*.json` is gitignored (joinLedger, joinGrace, protectionOffers, audit) — local copies never deploy; the box keeps its own.
- Memory guard: non-reclaim ≥215MB×2 or current ≥254MB×2 → flush + `exit(1)`. Uncapped `video: { url }` sends are the known tripwire — cap them.
- Chrome broken on the dev machine (`chrome.dll` missing) — verify HTML demos with a Node DOM-stub harness, not playwright.
- PowerShell 5.1: no `&&`; git push stderr shows NativeCommandError but succeeds — verify via `…main -> main`.
- Never-commit list: `__pycache__/`, `app.json`, `check.js`, `check_disk.py`, `upload_*.py` — stage explicit paths only.

## Next Steps
1. Watch the first real protection kick on the live box: expected sequence = `[MEMBER PROTECTION] … sending re-add offer` in boot log, `database/protectionOffers.json` entry on the box, member receives the 2-button DM. If the DM fails (blocked/privacy) the owner gets "Couldn't DM them the offer" — protection stays armed either way.
2. (KAMI decision pending) Apply the `facebook.js` temp-file capping pattern to `instagram.js:142` + `tiktok.js:154`.
3. Restart opencode so `/feature-viz` + the feature-viz skill register.
4. (optional, not urgent) Remaining MEDIUM/LOW audit items: `isBotAdmin` cached-metadata staleness, `.loli` name reputation, dead files (`utils/helpers.js`/`confirm.js`/`channelInfo.js`/`utils/tictactoe.js`), pies.js dead API, `igs`/`igsc` fork merge, owner-hub button-id overlap debt.

## Memory Keys
- mcp__claude-flow__memory_search { query: "KAMI protection offer join gate outage eventReminders facebook hardening", namespace: "project" }
