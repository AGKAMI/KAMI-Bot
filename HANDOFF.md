# HANDOFF

## Goal
CPM `!event` wizard corrections (final-judge synthesis + user's 5 rulings + 5 new requirements): JAPANESE server, host auto-RSVP, Jump overlay, duration/end-time step, 7-day pin, hidden mentions, word-first card labels, reply-bound capture, evrsvp id-explicit RSVP.

## Current State
- Bot CONNECTED on 27833882383 (prefix `!`) — `ae1ec3b` auto-pulled, deploy verified via MCP restart logs (state `running`)
- HEAD = `ae1ec3b` (feat(events): wizard corrections); 46/46 tests green (`node --test --test-force-exit tests/*.test.js`)
- eventWizard.js trimmed to exactly 500 lines (header doc condensed after the 510-line overage)
- Temp debug files cleaned (`_repro.js` deleted, DBG lines removed from eventWizard.js)
- Known quirk: suite intermittently appeared to hang during debugging — was entangled with in-flight DBG instrumentation edits; clean tree passes repro 3/3 and full suite 46/46

## What Shipped (`ae1ec3b`, 7 files)
1. **cpmData.js**: JAPANESE (🇯🇵) inserted JAMAICAN→JAPANESE→JORDANIAN; FILIPINO moved to F-slot (FAROESE→FILIPINO→FINNISH); PAGE_SIZE 7→6; SERVER_RANGES (6 jump ranges), pageForKey(), fmtDuration(); 84 servers, 14 pages, strict A–Z (locked by test)
2. **eventRsvp.js** (NEW, 109 lines): renderEventCard (word-first labels, ID stays `🆔:` emoji-only, time-range line, `👥 N going so far`), resolveEventById (cross-group), evrsvp onButton (LID-deduped, idempotent in/out)
3. **eventRender.js** (NEW, 306 lines): sendStep (M3 sync-reserve debounce + lastStepId capture), step renders [1/7]–[7/7] incl. renderJumpStep/renderDurationStep, renderEditPicker (has Duration row), draftToRecord (endTime/durationMins/endAt/expiresAt), recomputeEndTime, minsUntil
4. **eventWizard.js** (REWRITTEN, 500 lines): sessions/lookup/TTL sweep, startWizard (lastStepId seeded), publishEvent (host auto-RSVP `attendees=[hostJid]` → card w/ hidden mentions → pin 7d `PIN_SECONDS=604800` → EVENT LIVE confirm), captureText reply-bound (`stanzaId === s.lastStepId`; endtime branch; strikes; window re-arm), ewiz: onButton (jumps/jump/jumpb, dur/durc/dskip, tskip→duration, editf:duration, tplc/carc update lastStepId)
5. **attend.js** (REWRITTEN): case-insensitive EV-id match, unmatched arg → ERROR (no silent first-event fallback), buildComparableIds LID dedupe, buttons re-encoded to `evrsvp:in/out:<id>`
6. **buttonHelper.js**: interactiveMsg now carries `contextInfo: { mentionedJid }` when mentions passed (commented with revert note); sendButtons already returned the sent message + accepted mentions on text paths
7. **tests/eventWizard.test.js** (REWRITTEN, 388 lines): reply-bound textMsg helper, mentions/pin/duration/jump/cpmData-lock/full-build/duration-flow/jump-overlay/strikes/legacy tests; snapshots+restores crew.json in test.after

## Gotchas Hit This Session
- `database/crew.json` is NO LONGER tracked (commit `1cb7250` untracked live DB files — git auto-pull was wiping the crew roster) — `git checkout -- database/crew.json` now errors with pathspec; tests self-restore via test.after instead
- bot-hosting MCP `deployments_power` takes `action` (start|stop|restart|kill), NOT `signal`
- PowerShell pipe backpressure: `Select-Object -First N` on node output stalls the child — redirect to file instead
- `node --test tests/` (directory arg) fails on Windows/Node 24 — always glob `tests/*.test.js`
- Debugging note: a hang-at-publish symptom during instrumented runs did NOT reproduce on clean tree (repro 3/3, suite 46/46) — if it resurfaces, suspect timer interactions with DBG probes, not publishEvent itself

## Kill List (do NOT resurrect)
Crew dashboard, 14 admin mega-panels, WYR A/B buttons, launcher list views, setter panels, NSFW buttons, per-command Again handlers, positional RSVP buttons (`again:attend:1/2`), silent first-event fallback in attend.js.

## Active Files
- `commands/crew/eventWizard.js` — wizard orchestrator (exactly 500 lines; do not add without extracting)
- `commands/crew/eventRender.js` — all step renders + draftToRecord
- `commands/crew/eventRsvp.js` — card renderer + evrsvp handler
- `commands/crew/cpmData.js` — 84-server table, pages, jump ranges, TIME_RE, normalizeCpmId
- `commands/crew/attend.js` — typed attend path (evrsvp buttons)
- `utils/buttonHelper.js` — contextInfo mentions edit (line ~250)
- `tests/eventWizard.test.js` — reply-bound suite
- `tests/buttonAudit.test.js` — Phase A auto-scans sources; `evrsvp:` resolves via registration, `again:attend:*` probes still valid

## Next Steps
- User smoke-test in a real group: `!event` → build → post → verify card pin appears, crew got silent mention, buttons render, `evrsvp:` in/out works, `!attend EV-XXXXX` works
- Watch first live publish for Baileys pin-API quirks (`sock.sendMessage(jid, { pin: { type:1, time, key } })` — v7 has no pinMessage method)
- If pin fails in production (bot not admin), the try/catch warns and carries on — expected behavior, not a bug

## Memory Keys
mcp__claude-flow__memory_search { query: "event wizard cpm eventRsvp evrsvp pin mentions", namespace: "project" }
