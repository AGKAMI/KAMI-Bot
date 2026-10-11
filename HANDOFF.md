# HANDOFF

## Goal
Hybrid button-ification of ALL command categories — minimize typing, maximize buttons ("go ahead and finish it all"). Three judge agents + final judge locked the plan (score 7.5/10). All 5 batches shipped: `34cfd69` (buttons) + `3291267` (carryover apply/start work).

## Current State
- Bot was CONNECTED on 27833882383 (prefix `!`) at last verify; this commit triggers auto-pull deploy — **confirm `KAMI BOT CONNECTED` in MCP logs after ~90s**
- HEAD = `3291267`; prior arcs healthy (name-cache `8f11f82`, 401-fix `27aa6e1`, disk `8dd01d4`)
- 204/204 command load sweep green; 17/17 unit tests (`tests/buttonHelper.test.js`, `tests/againDispatch.test.js`); syntax-clean on 22 touched files
- **Soak SKIPPED** (judges recommended 48h after batch 1; owner chose single ship) — watch for: button-tap storms (500ms/chat rate limit), again: replay loops on external APIs (joke/truth/dare hit APIs every tap; 2s/chat cooldown in dispatcher mitigates), ownerHub config.js string-replace races

## What Shipped (all 5 batches)
1. **Infra**: longest-prefix button dispatch + overlap boot warning (`utils/buttonHelper.js`); `requireOwner`/`isOwnerJid` shared owner gate; generic `again:` replay dispatcher (`utils/againDispatch.js`, allowlist + gate re-checks + 2s/chat cooldown); `.unref()` on buttonHelper cleanup + database.js flush intervals; group-guard sweep (11 admin files); F6 live-prefix (`menu.js getMainText()`)
2. **Games/fun/anime**: rps chooser buttons (`games:rps:play:<choice>`); truth/dare no-arg chooser + alternating result row (`games:tod:play:`); dice/coinflip/slots/wyr result rows via `again:` ids; fun another-buttons (joke/truth/dare/meme/pies — pies encodes country in id); SFW anime cross-launcher (`utils/sfwAnime.js`: another+siblings+menu) — **NSFW anime typed-only permanently** (judge unanimity: consent/liability)
3. **Owner**: `commands/owner/ownerHub.js` — `.ohub` + panels for anticall/mode/autoreact/dmblocker; handlers delegate to real execute() with swallowed reply → panel re-render, confirmation in header (F7); dmblocker on/off mutates DB directly (its execute sends unswallowable messages); approve/disapprove stays typed; every handler self-gates `isOwnerJid`
4. **Admin**: `commands/admin/adminHub.js` — `.ahub` paginated router (3 pages, PAGE 9+nav), routes via `cmd.execute([], buildExtra)` to existing surfaces (no panel rebuilds); p3 = cta_url grouplink (live invite code) + GitHub + routed promote/demote/rules/groupstatus/uptime/help; admin-gated globally via existing `requireAdmin('admin')` on `admin:` prefix
5. **Crew**: events list shows Attend buttons (`again:attend:<n>`, max 7 + refresh); attend toggle result has change-mind/all-events row; `events`+`attend` added to again ALLOW

Menu integration: owner view → [🎛️ Owner Hub], admin view → [🛡️ Admin Hub] (both above Back).

## Edge Register (judge-locked, 22 items) — key ones
- Forged-tap security: global owner/admin gates in handleButtonResponse + every ownerHub handler self-gates
- **Dispatcher re-checks groupOnly/adminOnly/ownerOnly** (edge #22, final-judge catch) — programmatic execute() bypasses handler.js gates
- Arg-loss on replay: args encoded in button id + `^[a-z0-9]{1,20}$` whitelist
- Stale/concurrent taps: 500ms/chat limiter + idempotent SET-ids
- DM phantom rows: dmblocker panel reads live DB per render

## Kill List (per judges — do NOT resurrect)
Crew dashboard (Attend shortcut only), 14 admin mega-panels, WYR A/B buttons, launcher list views, setter panels, NSFW buttons, per-command Again handlers (generic dispatcher instead).

## Active Files
- `utils/againDispatch.js` — ALLOW set (dice coinflip slots truthordare wouldyourather joke meme truth dare pies waifu neko random konachan events attend); adding a command = add to ALLOW + attach button row inside execute (so dispatcher re-invoke keeps buttons)
- `utils/sfwAnime.js` — sendSfw/sfwRow for the 4 SFW anime commands
- `commands/owner/ownerHub.js` — hub + 15 handlers (all `owner:hub:*`)
- `commands/admin/adminHub.js` — 3-page router (`admin:hub*`, LABELS map, PAGE1/PAGE2 arrays)
- `commands/general/menu.js` — special-cased owner/admin category views, getMainText()
- `tests/{buttonHelper,againDispatch}.test.js` — extend when adding ALLOW entries

## Known Gotchas (this arc)
- `node --test tests/` DIRECTORY ARG FAILS on Windows/Node 24 → npm test = explicit file list
- Non-unref'd intervals hang test runs — kill stray node procs before rerunning
- ownerHub overlap warnings on boot are EXPECTED (longest match wins) — ~25 lines, informational
- anticall/mode rewrite config.js + bust require cache → ownerHub re-requires config per render (freshConfig)
- attend "first event" fallback bakes `1` into the replay button — correct only while sort order stable (time-of-day sort, deterministic)
- Never-commit: `__pycache__/`, `app.json`, `check.js`, `check_disk.py`, `upload_*.py`; restore `database/crew.json` before commit if test-ban.js ran

## Next Steps
1. Verify MCP deploy: logs show `KAMI BOT CONNECTED`, state running (~90s after push)
2. Live smoke (owner): `.ohub` → tap anticall On → panel shows ON; `.menu` → 👑 Owner → 🎛️ Owner Hub; `.menu` → 🛡️ Admin → Admin Hub → antilink; `.events` → Attend 1 → tapped again → out
3. Watch 24h for again: API-multiplication (joke/truth/dare external calls) — if abused, tighten dispatcher cooldown 2s→5s
4. If dispatcher misfires: `validate()` rejects are silent by design (non-allowlist taps do nothing)

## Memory Keys
- `project/buttons` — hybrid button-ification arc: allowlist dispatcher + hubs
- `project/identity` — stack, entry points, deploy flow
