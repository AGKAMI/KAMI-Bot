# HANDOFF

## Goal
CPM `!event` wizard lifecycle: build → post (card + 7d pin + hidden mentions) → RSVP → **auto-unpin when the meet ends**. Wizard corrections arc (`ae1ec3b`) + unpin sweep (`95af7ab`).

## Current State
- Bot CONNECTED on 27833882383 (prefix `!`) — `95af7ab` auto-pulled, deploy verified via MCP logs (`KAMI BOT CONNECTED`, state `running`) AND `files_read` confirmed `sweepExpiredPins` is on the server
- HEAD = `95af7ab` (feat(events): auto-unpin); 49/49 tests green (`node --test --test-force-exit tests/*.test.js`)
- eventWizard.js = 499 lines (under the 500 cap after pin-persistence addition + doc trims)
- Another session landed `1aa9594` (crew boot sync delayed 60s + all-teams-errored retry) — on top of `ae1ec3b`, below this arc

## What Shipped
### `ae1ec3b` — wizard corrections (7 files)
JAPANESE server, FILIPINO F-slot, PAGE_SIZE 6, SERVER_RANGES jump overlay, host auto-RSVP, 7d pin, hidden mentions, word-first labels (ID stays `🆔:`), reply-bound capture, duration/end-time step, evrsvp id-explicit, eventRender.js/eventRsvp.js extracted. Full detail in commit message.

### `95af7ab` — auto-unpin when meet ends (4 files)
1. **eventWizard.js** publishEvent: after successful pin, persists `team.events[eventId].pinnedMsgId = cardMsg.key.id` via getTeam→mutate→updateTeam (live-cache semantics)
2. **eventRsvp.js** (159 lines): `sweepExpiredPins(sock)` — walks `getAllTeams()`, calls `getCrewEvents(gid)` (reuses the DB lazy `upcoming→completed` flip, no duplicated endAt logic), then for each `status==='completed'` evt with `pinnedMsgId` and no `unpinnedAt` (and `unpinTries < 3`): sends `{ pin: { type: 2, key: { remoteJid, id, fromMe: true } } }` (UNPIN_FOR_ALL), marks `unpinnedAt` or bumps `unpinTries`; persists via updateTeam. `startEventUnpinSweep(sock)` — self-guarding 5-min interval (`.unref()`), same once-across-reconnects pattern as crew sync
3. **index.js**: wired right after the crew-sync block, try/catch boot
4. **tests/eventWizard.test.js** (453 lines): happy-path asserts `pinnedMsgId` persisted + matches pin key id; 3 new sweep tests (unpins once + never twice, legacy record without key skipped, 3-retry cap, upcoming events untouched)

## Gotchas Hit
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

## Next Steps
- User smoke-test in a real group: `!event` → build → post → pin appears + silent mention → `evrsvp:` in/out → after `endAt` passes (or result logged), within 5 min the sweep unpins the card
- Legacy events (published before this deploy) have no `pinnedMsgId` — they will NOT auto-unpin; unpin those manually if needed
- Watch first live unpin for Baileys quirks (type 2 key shape); failures retry 3x over 15 min then give up silently (logged)

## Memory Keys
mcp__claude-flow__memory_search { query: "event wizard unpin sweep pinnedMsgId evrsvp pin", namespace: "project" }
