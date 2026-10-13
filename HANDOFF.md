# HANDOFF

## Goal
CPM `!event` wizard lifecycle: build → post (card + 24h pin + hidden mentions) → RSVP → **auto-unpin when the meet ends**. Plus `!tt` TikTok downloader repairs. Arcs: wizard (`ae1ec3b`), unpin (`95af7ab`), pin-shape+labels+mentions+tt (`4833795`), DATE step (`6b73efb`).

## Current State
- Bot CONNECTED on 27833882383 (prefix `!`) — `6b73efb` auto-pulled, `KAMI BOT CONNECTED` + state `running` + `files_read` verified the date-step code on the server
- HEAD = `6b73efb` (feat(events): wizard DATE step); 54/54 tests green (`node --test --test-force-exit tests/*.test.js`)
- eventWizard.js = 493 lines (under the 500 cap via _arm/_expiredNotice trims)
- Concurrent session activity absorbed: `ff24bdb` (pin 7d→24h), `5b315fe`+`e74e212` (tt tikapi + placeholder md5), `83a5a1f`+`5565c8d` (tt 8s 429 backoff + TT_PROXY_URL env for metadata APIs)

## What Shipped
### `6b73efb` — wizard DATE step (7 files)
1. **DATE step [6/8]** between CAR and TIME: month buttons (12, paginated 6/page) → day buttons sized to that month's real length (28–31, 6/page, Prev/Next, back-to-months). No year picker — `resolveEventDate` resolves to the date's NEXT occurrence (Dec→JAN = next January; Feb 29 clamps to 28 non-leap); card shows the year only when ≠ current year
2. **Default = today**: `draft.eventDate` seeded at wizard start (`todayISO()`), `⏭️ Skip — today` accepts it — every event knows its date even if the host never touches the pickers
3. **Future dates require a time**: `tskip` + typed skip/now bounce back to the TIME step (no strike) — timeless endAt is now-relative and would corrupt a future meet; TIME step hides the skip button and says "scheduled meet needs a time"
4. **date-aware endAt/expiresAt**: endAt computed ON THE EVENT DATE (Friday meet ends Friday); `expiresAt = endAt + 48h` (was `now + 48h` — a next-week meet would lazily flip completed mid-week); timeless keeps now+duration, no expiresAt
5. **Surfaces**: card `*DATE* 📅: Thu 17 Oct` line (legacy no-date records unchanged); evrsvp confirm "on *<date>*"; `!events` list shows the date; `sortUpcoming` sorts by `(eventDate, time)` (legacy = today, old behavior); edit picker gains `📆 Date` row (10 buttons exactly)
6. **Helpers in cpmData.js**: `daysInMonth`, `todayISO`, `resolveEventDate`, `fmtCardDate` — ISO parsed field-by-field (new Date('YYYY-MM-DD') is UTC midnight, drifts west of UTC)
7. **Tests 54/54**: happy path + duration walk the new step; new — leap day counts, year rollover, Feb 29 clamp, future-date endAt on the date, now-now rejection, edit round-trip, date-aware sort

### Earlier arcs
- `4833795` — Baileys v7 pin shape (pin IS the message key, type top-level), caps+bold card labels, GOING attendee mentions, tt chain reorder (tikcdn demoted: serves 204/placeholder)
- `ae1ec3b` — wizard corrections (JAPANESE, jump overlay, duration step, hidden mentions, reply-bound capture)
- `95af7ab` — unpin sweep (pinnedMsgId persisted at publish; 5-min sweep flips ended events and UNPIN_FOR_ALLs, 3-retry cap, legacy records skipped)

## Gotchas Hit
- **`new Date('YYYY-MM-DD')` is UTC midnight** — drifts a day west of UTC; always parse ISO field-by-field (`new Date(y, m-1, d)`) for local dates
- **expiresAt must ride endAt, not now** — `now + 48h` lazily retires a scheduled meet mid-week; timed events use `endAt + 48h` (bare-time events fall back to `now + 48h` or they'd never retire)
- **Baileys v7 pin shape**: `{ pin: <messageKey>, type: 1|2, time? }` — pin IS the message key, type sits TOP-LEVEL. Nested `{ pin: { type, key } }` silently no-ops (no error, no pin). `senderTimestampMs` is set by the lib
- **tiktok provider rotation** (probed live from the box via `deployments_shell`): tikcdn → 204/placeholder-dead; embed → BACK (200 + signed v45 URL); tikwm → 403s datacenter IPs. Always re-probe from the box, not from local dev — IP reputation differs
- bot-hosting MCP `deployments_power` takes `action` (start|stop|restart|kill), NOT `signal`
- MCP restart can return `ok: false, reason: "A sync is already running…"` — the sync restarts the app itself; wait ~45s then check logs
- `files_get` is NOT an MCP tool — it's `files_read` (path param)
- PowerShell pipe backpressure: `Select-Object -First N` on node output stalls the child — redirect to file instead
- `node --test tests/` (directory arg) fails on Windows/Node 24 — always glob `tests/*.test.js`
- `database/crew.json` NO LONGER tracked (commit `1cb7250`) — tests self-restore via test.after
- Live-cache DB semantics: mutate the object from getTeam/getAllTeams/getCrewEvents then `updateTeam(gid, team)`; addCrewEvent spreads into a NEW record so post-hoc mutation of the local `data` object is lost

## Kill List (do NOT resurrect)
Crew dashboard, 14 admin mega-panels, WYR A/B buttons, launcher list views, setter panels, NSFW buttons, per-command Again handlers, positional RSVP buttons, silent first-event fallback.

## Active Files
- `commands/crew/eventWizard.js` — wizard orchestrator (493 lines; extract before adding more)
- `commands/crew/eventRsvp.js` — card renderer + evrsvp handler + unpin sweep
- `commands/crew/eventRender.js` — step renders (incl. date/month/day stages) + draftToRecord
- `commands/crew/cpmData.js` — 84-server table, pages, jump ranges, date helpers (daysInMonth/todayISO/resolveEventDate/fmtCardDate)
- `commands/crew/crewHelpers.js` — sortUpcoming by (eventDate, time)
- `commands/crew/attend.js` — typed attend path
- `index.js` — crew sync + unpin sweep wiring (~line 625-645)
- `tests/eventWizard.test.js` — reply-bound + sweep + date suite (54 tests)
- `utils/buttonHelper.js` — contextInfo mentions
- `commands/media/tiktok.js` — provider chain (tikapi/embed/tikwm/ruhend/tikcdn) + placeholder guards

## Next Steps
- User smoke-test in a real group: `!event` → build (note the new DATE step [6/8]: month → day, or Skip = today) → post → pin sticks + crew tagged + card shows caps labels + `*DATE*` line + GOING mentions → `evrsvp:` in/out confirms tag the person with the date → after `endAt` passes, sweep unpins within 5 min
- User smoke-test a FUTURE-date event: pick month+day → time step demands a time (no now-now) → post → `!events` sorts it after today's meets; the card shows the year when it rolls over
- User smoke-test `!tt <url>` — should deliver the real video via tikapi or embed; the ssstik placeholder can no longer ship (blocked at both hash/size and URL-fallback layers)
- Legacy events (published before these deploys) have no `pinnedMsgId`/`eventDate` — they will NOT auto-unpin and show no date line; unpin those manually if needed
- If pin still fails live, check bot is group admin — the try/catch logs `[EVWIZ] pin failed (bot admin?)` and carries on

## Memory Keys
mcp__claude-flow__memory_search { query: "event wizard DATE step month day pickers resolveEventDate endAt expiresAt Baileys v7 pin tt tikcdn", namespace: "project" }
