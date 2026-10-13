# HANDOFF

## Goal
CPM `!event` wizard lifecycle: build → post (card + 24h pin + hidden mentions) → RSVP → **auto-unpin when the meet ends**. Plus `!tt` TikTok downloader repairs. Plus **full SAST time sweep** (bot lives in South Africa, container runs UTC). Arcs: wizard (`ae1ec3b`), unpin (`95af7ab`), pin-shape+labels+mentions+tt (`4833795`), DATE step (`6b73efb`), **SAST sweep (`011a519`)**.

## Current State
- Bot CONNECTED on 27833882383 (prefix `!`) — `011a519` auto-pulled at restart, `KAMI BOT CONNECTED` + state `running` + `files_read` verified `index.js` TZ line and full `utils/sast.js` (with `isoMonthsAgo`) on the server
- HEAD = `011a519` (feat(time): full SAST sweep); **61/61 tests green** (`node --test --test-force-exit tests/*.test.js` — 54 eventWizard + 7 sast + tiktok/picker/button suites)
- eventWizard.js = 493 lines (under the 500 cap via _arm/_expiredNotice trims)
- Concurrent session activity absorbed: `ff24bdb` (pin 7d→24h), `5b315fe`+`e74e212` (tt tikapi + placeholder md5), `83a5a1f`+`5565c8d` (tt 8s 429 backoff + TT_PROXY_URL env for metadata APIs)

## What Shipped
### `011a519` — full SAST sweep (32 files, +339/−97)
1. **NEW `utils/sast.js`** (131 lines) — single source of time truth. TZ-independent epoch math (pure UTC+2, no ICU/container TZ): `parts` (SAST wall-clock parts), `todayISO`, `clock`, `epochOf(iso, hhmm)` (inverse — a host typing 20:30 means SA 20:30), `minutesUntil`, `dateLabel`, `stamp`, `isoDaysAgo`/`isoMonthsAgo` (clamped calendar shifts); display helpers `fmtDate`/`fmtTime`/`fmtDateTime` force `timeZone: 'Africa/Johannesburg'` via Intl with manual +2h fallback (giveaway.js pattern), all pass opts+locale through
2. **Event epoch math rewired**: `eventRender.draftToRecord` → `epochOf(eventDate, time/endTime)` (was local `setHours` on the UTC container = endAt/unpin 2h late); `minsUntil` → sast `minutesUntil`; `resolveYearForMonth` + cpmData `resolveEventDate` use `parts().year` (SAST year); cpmData `todayISO`/`fmtCardDate` are now thin re-exports of sast (`cpmData.todayISO === sast.todayISO` asserted in tests)
3. **~24 display sites** rewired to `fmtDate`/`fmtTime`/`fmtDateTime` (were rendering 2h behind SA): crew accept/deny/history/activity/add/applicants/pending/inactive/stats/result, admin kickcfg/report/rules/setdesc/setname/snipe/warnings, general members/groupinfo, owner db/newsletter, handler.js welcome/goodbye (5 sites), utils/format welcome clock, autoProgression auto-kick notice. Left alone: giveaway.js + applyHelper.js (already SAST), github/newsletter number formatting, `toISOString()` storage stamps
4. **groupStats date/hour keys are SAST now**: `utils/groupstats.js` writes `todayISO()`/`parts().hours` buckets (was UTC `toISOString().slice(0,10)` + container `getHours()` — mid-evening SA messages filed under the wrong day); **leaderboard.js cutoffs** (`today`/`isoDaysAgo(7)`/`isoMonthsAgo(1)`) match the new keys — `toISOString()` bypasses TZ so this pair had to move together
5. **`index.js` TZ backstop**: `process.env.TZ = 'Africa/Johannesburg'` set before any require — covers unaudited local-time code (verified live on the box: honored, prints GMT+0200); Windows dev/tests ignore it, hence the TZ-independent helpers
6. **Tests 61/61**: new `tests/sast.test.js` (7): SAST parts/clock in the 00:00–01:59 window where UTC disagrees, epochOf inverse, dateLabel year rule, Intl forcing + en-US pass-through, iso shift clamping, minutesUntil, cpmData delegation; eventWizard date-flow endAt expectation now `Date.UTC(...) - 2h`

### Earlier arcs
- `6b73efb` — wizard DATE step [6/8]: month/day pickers, default=today, future date demands time, date-aware endAt/expiresAt=endAt+48h, sortUpcoming by (date,time), edit date row
- `4833795` — Baileys v7 pin shape (pin IS the message key, type top-level), caps+bold card labels, GOING attendee mentions, tt chain reorder (tikcdn demoted: serves 204/placeholder)
- `ae1ec3b` — wizard corrections (JAPANESE, jump overlay, duration step, hidden mentions, reply-bound capture)
- `95af7ab` — unpin sweep (pinnedMsgId persisted at publish; 5-min sweep flips ended events and UNPIN_FOR_ALLs, 3-retry cap, legacy records skipped)

## Gotchas Hit
- **Container clock = UTC** (verified: `date` → UTC, Intl → 'UTC'); South Africa is fixed **UTC+2, no DST** — every wall-clock must go through `utils/sast.js` or pass `timeZone`, else it renders 2h behind; `process.env.TZ` at index.js boot is honored on the box but NOT on Windows dev/tests
- **`toISOString()` bypasses `process.env.TZ`** — always UTC. Anything writing date KEYS (`groupStats` buckets) or comparing date strings must use `todayISO()`, not `toISOString().slice(0,10)`; readers of those keys must shift in SAST too (leaderboard)
- **`new Date('YYYY-MM-DD')` is UTC midnight** — drifts a day west of UTC; parse ISO field-by-field or use sast helpers
- **expiresAt must ride endAt, not now** — `now + 48h` lazily retires a scheduled meet mid-week; timed events use `endAt + 48h` (bare-time events fall back to `now + 48h` or they'd never retire)
- **Baileys v7 pin shape**: `{ pin: <messageKey>, type: 1|2, time? }` — pin IS the message key, type sits TOP-LEVEL. Nested `{ pin: { type, key } }` silently no-ops (no error, no pin). `senderTimestampMs` is set by the lib
- **tiktok provider rotation** (probed live from the box via `deployments_shell`): tikcdn → 204/placeholder-dead; embed → BACK (200 + signed v45 URL); tikwm → 403s datacenter IPs. Always re-probe from the box, not from local dev — IP reputation differs
- bot-hosting MCP `deployments_power` takes `action` (start|stop|restart|kill), NOT `signal`; **param is `id`, not `deployment_id`** (wrong key → `invalid_input: expected string, received undefined`)
- MCP restart can return `ok: false, reason: "A sync is already running…"` — the sync restarts the app itself; wait ~45s then check logs
- `files_get` is NOT an MCP tool — it's `files_read` (path param)
- PowerShell pipe backpressure: `Select-Object -First N` on node output stalls the child — redirect to file instead
- `node --test tests/` (directory arg) fails on Windows/Node 24 — always glob `tests/*.test.js`
- `database/crew.json` NO LONGER tracked (commit `1cb7250`) — tests self-restore via test.after
- Live-cache DB semantics: mutate the object from getTeam/getAllTeams/getCrewEvents then `updateTeam(gid, team)`; addCrewEvent spreads into a NEW record so post-hoc mutation of the local `data` object is lost
- Database readers (`getMemberActivity`/`getMessagesInWindow`) parse bucket keys as `new Date('YYYY-MM-DD')` = UTC midnight — ±2h tolerance on day boundaries, acceptable for "last N days" heuristics, do NOT "fix" into displays

## Kill List (do NOT resurrect)
Crew dashboard, 14 admin mega-panels, WYR A/B buttons, launcher list views, setter panels, NSFW buttons, per-command Again handlers, positional RSVP buttons, silent first-event fallback.

## Active Files
- **`utils/sast.js`** — SAST epoch math + Intl display helpers (new files: route ANY time code through here)
- **`index.js:21`** — `process.env.TZ = 'Africa/Johannesburg'` backstop (before all requires)
- **`utils/groupstats.js` + `commands/general/leaderboard.js`** — paired SAST date keys/cutoffs (change one → change both)
- `commands/crew/eventWizard.js` — wizard orchestrator (493 lines; extract before adding more)
- `commands/crew/eventRsvp.js` — card renderer + evrsvp handler + unpin sweep
- `commands/crew/eventRender.js` — step renders (incl. date/month/day stages) + draftToRecord (epochOf)
- `commands/crew/cpmData.js` — 84-server table, pages, jump ranges; date helpers delegate to utils/sast
- `commands/crew/crewHelpers.js` — sortUpcoming by (eventDate, time)
- `commands/crew/attend.js` — typed attend path
- `index.js` — crew sync + unpin sweep wiring (~line 625-645)
- `tests/eventWizard.test.js` — reply-bound + sweep + date suite (54 tests); `tests/sast.test.js` (7)
- `utils/buttonHelper.js` — contextInfo mentions
- `commands/media/tiktok.js` — provider chain (tikapi/embed/tikwm/ruhend/tikcdn) + placeholder guards

## Next Steps
- User smoke-test in a real group: `!event` → build (DATE step: month → day, or Skip = today) → post → pin sticks + crew tagged + `*DATE*` line + GOING mentions → `evrsvp:` in/out tags with the date → after `endAt` passes, sweep unpins within 5 min — **endAt now = SA wall time, so a 22:30 meet unpins ~22:30 SAST (was 00:30 SAST before this sweep)**
- User smoke-test a FUTURE-date event: pick month+day → time step demands a time → post → `!events` sorts it after today's; card shows the year on rollover
- User smoke-test `!tt <url>` — should deliver the real video via tikapi or embed
- Spot-check a time display between 00:00–02:00 SAST (e.g. `.warnings`, `.crew history`, `!leaderboard today`) — should show SA dates, not yesterday's UTC
- Legacy events (published before these deploys) have no `pinnedMsgId`/`eventDate` — they will NOT auto-unpin and show no date line; unpin manually if needed
- If pin still fails live, check bot is group admin — the try/catch logs `[EVWIZ] pin failed (bot admin?)` and carries on

## Memory Keys
mcp__claude-flow__memory_search { query: "SAST sweep utils/sast epochOf todayISO groupStats keys leaderboard cutoff TZ backstop event wizard DATE step Baileys v7 pin tt tikcdn", namespace: "project" }
