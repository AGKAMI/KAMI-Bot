# HANDOFF

## Goal
Keep KAMI Bot shipping autonomously. Completed arcs: CPM `!event` wizard lifecycle (build → post → RSVP → **auto-unpin**), `!tt` repairs, **full SAST time sweep** (`011a519`), **universal-prefix sweep** (`a52b9fd`), and **production console-log bug sweep** (`fc195c5` — stale-sock timers, recruit-tier promotions, mention leak into role names).

## Current State
- Bot CONNECTED on 27833882383 (prefix `!`) — `fc195c5` auto-pulled at restart, `KAMI BOT CONNECTED` + state `running` + `files_read` verified `_roleIndex`/`_lastHoldCount` in `utils/autoProgression.js` and `_crewSyncSock` in `index.js` on the server
- HEAD = `fc195c5` (fix(crew): live-sock refresh…); **61/61 tests green** (`node --test --test-force-exit tests/*.test.js`)
- SAST sweep `011a519` fully deployed/verified earlier; eventWizard.js = 493 lines (500 cap)
- Concurrent session activity absorbed through `5565c8d` (tt backoff / TT_PROXY_URL)

## What Shipped
### `fc195c5` — production console-log bug sweep (5 files, +71/−19)
Source: `C:\Users\ojuni\Downloads\probs_to_fix.txt` (user's console dump). Four real bugs:

1. **Stale-sock timers (the "Connection Closed" wall)** — `index.js` `_crewSyncTimer` and `eventRsvp.js` `_unpinTimer` are registered ONCE but their closures captured the FIRST `sock`; every reconnect builds a NEW socket object → after any reconnect, the 30-min crew sync and 5-min unpin sweep called a dead socket FOREVER (all 5 teams error → 4-retry ladder → repeat hourly; unpin burned 3/3 tries then stranded the pin permanently). Fixes: module-level `_crewSyncSock` (index.js) / `_unpinSock` (eventRsvp.js) refreshed on every `connection === 'open'` re-entry, intervals read the live ref; unpin ALSO no longer counts transient errors (`connection closed|timed out|socket|rate limit`) toward `UNPIN_MAX_TRIES` — retried next sweep with no penalty
2. **Recruit-tier promotions** — crew sync adds everyone as `role: 'member'`, but only SSGENERAL's ladder lists 'member'; SSRS/KSSPS/KSSMP/KSSMS members were ALL skipped ("role member not in ranks") every cycle — auto-promotion was dead in 4/5 teams. New `_roleIndex()` in `autoProgression.js`: 'member'/empty on a ladder without 'member' = index **-1 (recruit tier)** → promotes into `ranks[0]` at threshold[0] (100 msgs/36d); `getThresholds` clamps `Math.max(0, index)` (old code: `PROMOTION_THRESHOLDS[-1]` → undefined → silently used the TOP threshold). Unknown custom roles = -2, counted per-team in ONE summary line instead of per-member SKIP spam
3. **`@mention` token leaked into role names** — WhatsApp keeps the raw `@123456` token in message text; `crewHelpers.resolveUser` mention branch returned args untouched, so `.crew role @user Constable/recruit` STORED `"@182631220146418 Constable/recruit"` as the role (visible in the log). Fix: strip leading `/^@\d{4,}$/` tokens from args in the mention branch (promote.js iterates args for valid role words — strip helps it too; demote/remove/apply never read args). `role.js` also lowercases now (matches setroles convention)
4. **Noise** — CHECK lines only log members ≥½ way to either threshold (~50 lines/cycle → ~5); mass-kill ⚠️ re-logs only when the due count changes (`_lastHoldCount`)

NOT bugs (by design, no code change): mass-kill guard holding 39 kicks until owner runs `!kickcfg preview`; TT `tikapi: empty aweme_list` → embed fallback succeeds; panel console buffer replaying identical blocks on reconnect; `[!] Console auth failed` (panel-side, recovered).

### `a52b9fd` — universal prefix in all examples/usage (26 files, +59/−42)
1. **`commands/general/help.js` (sole renderer of `cmd.usage`)** — old code `.replace(/^\./, prefix)` replaced only the FIRST dot, so multi-example usages rendered mixed `!`/`.`. New: `rawUsage.replace(/(^|[\s|(])\./g, (m, p) => p + prefix)` (function replacement = `$`-safe), then bare usages get prefixed
2. **25 command files' inline replies** switched to `${config.prefix || '.'}` / in-scope `${prefix}` — 12 gained `const config = require('../../config');`
3. **`extra.prefix` removed as a concept** — never in `commandExtra`; attp had an operator-precedence bug too
4. **`disapprove.js`** description reworded

### `011a519` — full SAST sweep (32 files, +339/−97)
- **NEW `utils/sast.js`** — TZ-independent epoch math + Intl display (force `Africa/Johannesburg`). Route ALL new time code through here

### Earlier arcs
`6b73efb` wizard DATE step · `4833795` Baileys v7 pin shape + labels/mentions/tt · `ae1ec3b` wizard corrections · `95af7ab` unpin sweep

## Gotchas Hit
- **Baileys reconnect = NEW sock object** — any timer registered once across reconnects must read a module-level live sock ref (`_crewSyncSock`/`_unpinSock` pattern), never close over the boot sock. autoProgression already did this via clear+re-register; the two timers above did not
- **Retry caps must not burn on transient network errors** — a 3-try window during one disconnect stranded the event pin forever; classify `connection closed|timed out|socket|rate limit` as no-penalty retries
- **Ranks vs roles**: crew sync writes `role: 'member'` for everyone; config ladders (except SSGENERAL) start at their first REAL rank — 'member' is the implicit recruit tier (index -1 → ranks[0]). `PROMOTION_THRESHOLDS[-1]` is undefined and falls through to the TOP threshold — always clamp index ≥ 0
- **WhatsApp mention tokens stay in message text** — `@123456` appears as a literal arg; any command joining leftover args into stored text (role names etc.) must strip `/^@\d{4,}$/` first (`resolveUser` now does)
- **`cmd.usage` has exactly ONE consumer** — `help.js:64`. `menu`/`list` render `${prefix}${name}` themselves
- **`extra`/`ctx` NEVER carries `prefix`** — **use `config.prefix || '.'`**
- **`config.js:108 invalidCommand` is DEAD** — unknown commands just get a ❌ reaction
- **Container clock = UTC**, SA is fixed **UTC+2 no DST** — time code goes through `utils/sast.js`
- bot-hosting MCP `deployments_power` takes `action` (NOT `signal`), param `id` (NOT `deployment_id`); restart can return `ok:false "A sync is already running"` → wait ~45s; `files_get` doesn't exist — it's `files_read`
- `node --test tests/` (directory) fails on Windows/Node 24 — glob `tests*.test.js`; kill stray node procs first; redirect output to file (pipe stalls)
- `database/crew.json` NO LONGER tracked — tests self-restore
- PowerShell: build MCP bodies as hashtables → `ConvertTo-Json -Depth 6 -Compress` → ASCII `WriteAllText` → `curl.exe --data "@file"`

## Kill List (do NOT resurrect)
Crew dashboard, 14 admin mega-panels, WYR A/B buttons, launcher list views, setter panels, NSFW buttons, per-command Again handlers, positional RSVP buttons, silent first-event fallback.

## Active Files
- **`utils/autoProgression.js`** — `_roleIndex` (recruit tier), `getThresholds` clamp, CHECK/held-log noise gates
- **`index.js`** — `_crewSyncSock` live ref (line ~243); crew sync interval reads it
- **`commands/crew/eventRsvp.js`** — `_unpinSock` live ref + transient-error unpin handling
- **`commands/crew/crewHelpers.js`** — `resolveUser` mention-token strip; **`commands/crew/role.js`** lowercases roles
- `commands/crew/eventWizard.js` (493 lines, extract before adding) / `eventRender.js` / `cpmData.js`
- `commands/general/help.js` — usage renderer; `utils/sast.js` + `index.js:21` (TZ)
- `commands/media/tiktok.js` — provider chain + placeholder guards
- Any NEW reply with a command example must use `config.prefix || '.'`, never a literal `.`

## Next Steps
- Owner action: run `!kickcfg preview` once — releases the 39-member mass-kill hold (kicks were HELD by design every cycle)
- Owner: re-set the 4 junk KSSMS roles (`!crew role @user <role>`) — pre-fix entries still contain `@jid` prefixes and won't match any ladder (now logged as one "custom role not in ladder" line per team)
- Smoke: after the next reconnect, `[CREW SYNC]` periodic runs must succeed (no more all-teams "Connection Closed"); an ended pinned event must unpin on the first sweep after reconnect
- Progression: members with ≥100 msgs/36d in SSRS/KSSPS/KSSMP/KSSMS should now promote into `ranks[0]` (was impossible before)
- Prior arcs' smoke tests still open: `!event` wizard → pin → auto-unpin at SA wall time; `!tt <url>` delivers real video; time displays 00:00–02:00 SAST show SA dates
- Legacy events (pre-`011a519`) have no `pinnedMsgId`/`eventDate` — will NOT auto-unpin

## Memory Keys
mcp__claude-flow__memory_search { query: "stale sock reconnect timers crew sync unpin sweep recruit tier roleIndex mention token strip roles mass kill guard kickcfg preview", namespace: "project" }
