# HANDOFF

## Goal
CPM `!event` wizard lifecycle: build → post (card + 24h pin + hidden mentions) → RSVP → **auto-unpin when the meet ends**. Plus `!tt` TikTok downloader repairs. Arcs: wizard (`ae1ec3b`), unpin (`95af7ab`), pin-shape+labels+mentions+tt (`4833795`).

## Current State
- Bot CONNECTED on 27833882383 (prefix `!`) — `4833795` auto-pulled, restart `ok:true` + `KAMI BOT CONNECTED` + `files_read` verified every fix on the server
- HEAD = `4833795` (fix(events,tt)); 49/49 tests green (`node --test --test-force-exit tests/*.test.js`)
- eventWizard.js = exactly 500 lines
- Concurrent session activity this arc: `ff24bdb` (pin 7d→24h), `5b315fe`+`e74e212` (tt mobile-feed API `tikapi` + new placeholder md5) — all absorbed

## What Shipped
### `4833795` — pin shape fix, card labels, attendee mentions, tt chain (5 files)
1. **eventWizard.js** publishEvent pin: Baileys v7 expects `{ pin: <messageKey>, type: 1, time }` — pin IS the key, type sits TOP-LEVEL. The old nested `{ pin: { type, time, key } }` silently no-ops (that's why the message never pinned). Same fix in **eventRsvp.js** unpin sweep (`{ pin: key, type: 2 }`)
2. **eventRsvp.js** renderEventCard: labels now `*HOST* 👤:`, `*ID* 🆔:`, `*SERVER* 🌐:`, `*CARS* 🚗:`, `*TIME* ⏰:` (ALL-CAPS bold). GOING line = `👥 *GOING (N):* @name @name` with live mentions (mention() from format.js). RSVP in/out confirms also tag the tapper with mentions array
3. **events.js** list: per-event GOING line tags attendees, mentions array passed to sendButtons
4. **media/tiktok.js**: chain reordered `tikapi → embed → tikwm → ruhend → tikcdn`. Embed page is BACK (200 + signed v45 CDN URL — verified live from the box via shell); tikcdn is DEAD (204 empty, was serving the "THIS APP IS OFFLINE" placeholder). Placeholder rejection hardened (md5 set + exact-size backstop 4089113/2882204); unchecked Baileys URL-send fallback blocked for tikcdn hosts (that's how the promo clip shipped)
5. **tests/eventWizard.test.js**: updated for new labels/pin shape/GOING line/RSVP confirm format

### Earlier arcs
- `ae1ec3b` — wizard corrections (JAPANESE, jump overlay, duration step, hidden mentions, reply-bound capture)
- `95af7ab` — unpin sweep (pinnedMsgId persisted at publish; 5-min sweep flips ended events and UNPIN_FOR_ALLs, 3-retry cap, legacy records skipped)

## Gotchas Hit
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
- `commands/crew/eventWizard.js` — wizard orchestrator (499 lines; extract before adding more)
- `commands/crew/eventRsvp.js` — card renderer + evrsvp handler + unpin sweep
- `commands/crew/eventRender.js` — step renders + draftToRecord
- `commands/crew/cpmData.js` — 84-server table, pages, jump ranges
- `commands/crew/attend.js` — typed attend path
- `index.js` — crew sync + unpin sweep wiring (~line 625-645)
- `tests/eventWizard.test.js` — reply-bound + sweep suite
- `utils/buttonHelper.js` — contextInfo mentions
- `commands/media/tiktok.js` — provider chain (tikapi/embed/tikwm/ruhend/tikcdn) + placeholder guards

## Next Steps
- User smoke-test in a real group: `!event` → build → post → **pin now actually sticks** (v7 shape fixed) + crew tagged + card shows caps labels + GOING line → `evrsvp:` in/out confirms tag the person → after `endAt` passes, sweep unpins within 5 min
- User smoke-test `!tt <url>` — should deliver the real video via tikapi or embed; the ssstik placeholder can no longer ship (blocked at both hash/size and URL-fallback layers)
- Legacy events (published before this deploy) have no `pinnedMsgId` — they will NOT auto-unpin; unpin those manually if needed
- If pin still fails live, check bot is group admin — the try/catch logs `[EVWIZ] pin failed (bot admin?)` and carries on

## Memory Keys
mcp__claude-flow__memory_search { query: "event wizard pin Baileys v7 shape unpin sweep GOING mentions tt tikcdn placeholder embed", namespace: "project" }
