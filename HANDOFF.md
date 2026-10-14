# HANDOFF

## Goal
Keep KAMI Bot shipping autonomously. Completed arcs: CPM `!event` wizard lifecycle (build → post → RSVP → **auto-unpin**), `!tt` repairs, **full SAST time sweep** (`011a519`), **universal-prefix sweep** (`a52b9fd`), **production console-log bug sweep** (`fc195c5` — stale-sock timers, recruit-tier promotions, mention leak into role names), **user-reported trio** (`3a10543` — global welcome image, KSSPS/KSSMP invite swap, 256MB memory guard), and **reconnect-resilience sweep** (`6081675` — dead-socket crew-sync retry, prune-safe team-admin sync).

## Current State
- Bot CONNECTED on 27833882383 (prefix `!`) — `5cdb595` auto-pulled at restart, verified on server: `git log` = `5cdb595`, `/photo/` regex live in `commands/media/tiktok.js:94`
- HEAD = `5cdb595` (fix(tt): extract aweme id from /photo/ links…); **64/64 tests green** (`node --test --test-force-exit tests/*.test.js`, +3 extractVideoId tests)
- Memory guard + `[MEM]` telemetry live and healthy: steady **131–138MB/256MB** across reconnects (heap 57-64MB, ext 12-14MB) — was 239-254MB before `3a10543`
- SAST sweep `011a519` + console sweep `fc195c5` deployed/verified; eventWizard.js = 493 lines (500 cap)
- Concurrent session activity absorbed through `5565c8d` (tt backoff / TT_PROXY_URL)

## What Shipped
### `5cdb595` — TikTok slideshow fix (2 files, +21/−2)
User report: slideshows (photo-mode posts) always failed with "couldn't download the video, try a different link" while regular videos worked. Box logs showed the exact failure: every ID-based provider died with `could not extract video ID`, then tikwm 403 + ruhend (rides tikwm backend) invalid-JSON. Root cause: **slideshows are shared as `/photo/<id>` URLs** (photo mode) but `extractVideoId` only matched `/video/<id>` — so tikapi (primary, handles `aweme.images` as slideshow) could never even fetch the aweme. tikwm was the only no-ID slideshow source and it 403s the datacenter IP. Fix: regex now `\/(?:video|photo)\/(\d+)` (same aweme_id both shapes); exposed `extractVideoId` in `_internals` + 3 tests. Works via tikapi → sendSlideshow as before.

### `6081675` — reconnect-resilience sweep (2 files, +57/−16)
Source: user's console dump showing WhatsApp flapping (Connection Terminated + two 503s). Memory telemetry confirmed healthy (131-138MB stable). Three bugs:

1. **Crew sync burned its whole retry ladder inside one disconnect** — the 60s retry timer fired against the still-dead socket: 5× "Connection Closed", attempts 2/4→4/4 in ~3 min, then silence until the 30-min cycle. Fix in `syncCrewRosters` (index.js): (a) all-errored + **socket `ws.readyState !== 1`** → log "waiting for reconnect" and return NO retry (the next `'open'` re-schedules the boot run anyway); (b) all-errored + **all errors transient** (`CREW_SYNC_TRANSIENT` = connection closed/terminated/timed out/rate limit/stream errored/websocket) → retry at NO penalty in a separate `_transient` counter capped at 5 (same policy as the unpin sweep in `fc195c5`); (c) genuine errors still use the original `_retry < 3` ladder
2. **Team-admin sync wiped 9 admins on failed scans** — all 5 `groupMetadata` scans threw "Connection Closed" → `currentAdminsByGroup = {}` → `pruneTeamAdmins({})` kept only owner numbers → 9 real admins deleted from `globalSettings.teamAdmins`. Fix: count `scanFailures` per team; **prune only when `scanFailures === 0`** (even ONE failed group would wrongly wipe admins who are admin only there). Detection/add side stays ungated (additive = safe). Log line: "Skipping prune — N/M group scans failed". **The 9 wiped admins self-heal**: next clean scan re-adds every admin found in groups (additive `addTeamAdmin`)
3. **`.kickcfg` hint used a hardcoded dot** — autoProgression.js:455 told the owner to run `.kickcfg preview` while live prefix is `!`; now `${config.prefix || '.'}kickcfg preview`

### `3a10543` — user-reported trio (5 files, +60/−11)
1. **Welcome image now GLOBAL** — `!setwelcomeimage` saved to `utils/images/welcome/<groupJid>.jpg` (per-group), but the welcome flow only reads that file for the ONE group it was set in; every other non-crew group fell through to the tracked `utils/welcome_image.jpg` (owner's old pic). Fix: setter now writes `utils/images/welcome/global.jpg`; handler.js chain for non-crew groups = **global.jpg > per-group legacy file > utils/welcome_image.jpg > group PP > Picsart PNG**. Crew (security) groups unchanged — always group PP. The owner's image set at 14:35 today was promoted to `global.jpg` on the box (no re-set needed). Startup `git clean` does NOT touch these files (verified: survived restart)
2. **KSSPS/KSSMP invite swap (root cause found)** — commit `921ab6e` ("verified via invite link resolution") had swapped the two entries' jid+invite pairs; accepting a KSSPS applicant DM'd them the METRO POLICE invite. **Verified live** by fetching the invite pages: `Ls0VolQePSk1kSlV5scXpD` → group titled "Private Security Team", `D6LGiNbZaSEAm4KS2kErwx` → group titled "METRO POLICE". Swapped back to original (`2d5979f`) pairing: KSSPS = jid `120363409819775730` + `Ls0Vol…`, KSSMP = jid `120363421626159074` + `D6LGiN…`. jid+invite pairing had moved together through every swap (bdbaa5a → 136729f → 921ab6e), so BOTH jids moved back too — auto-add now targets the right group as well
3. **Memory (256MB box)** — panel limit 268,435,456B; was at **239MB (93%) after ~3h**, peak VmHWM 310MB → constant OOM-kill risk. Not an active runaway (flat over 5-min samples) — high steady-state. Fixes: (a) `utils/imageText.js` caps libvips (`sharp.cache({memory:8, files:2, items:60})` + `sharp.concurrency(1)` — config is process-global); (b) `index.js` memory guard samples `/sys/fs/cgroup/memory.current` every 5min — ≥245MB twice in a row logs `🛑 MEMORY CRITICAL` and `process.exit(0)` (PID1 = `tini -g -- /entrypoint.sh` → container restart policy relaunches it fresh; safe because restarts pull auth state from disk); (c) `[MEM] …` telemetry line every 30min (rss/heap/external) for trend watching. Fresh boot after deploy = **118MB**

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
- **TikTok slideshows share `/photo/<id>` URLs, not `/video/<id>`** — same aweme_id, same feed API; any ID-extraction regex must match both (`/\/(?:video|photo)\/(\d+)/`). tikwm/ruhend (the no-ID slideshow fallbacks) 403 the datacenter IP, so tikapi is the ONLY working slideshow source from the box
- **Destructive syncs must never run on partial/empty scan data** — `pruneTeamAdmins({})` after failed `groupMetadata` scans deleted 9 admins in one flap; gate ANY destructive reconcile on `scanFailures === 0`, keep the additive side ungated
- **Retry timers against a dead socket just torch the ladder** — check `sock.ws?.readyState === 1` before scheduling crew-sync retries; the next `'open'` event re-runs the boot sync anyway. Transient network errors get their own no-penalty counter (`CREW_SYNC_TRANSIENT`), capped separately from real failures
- **WhatsApp flaps 503/Terminated for minutes at a time** — reconnects re-run the full boot path each 'open' (unblock 9, engine start, store clean, crew boot sync +60s); the error walls during flaps were retry storms, not new bugs — after `6081675` a dead socket logs ONE "waiting for reconnect" line
- **Invite links are verifiable offline** — `https://chat.whatsapp.com/<code>` page text includes the group's display name (webfetch, no login). Use this to verify any jid↔invite↔team-name mapping before trusting config history; `921ab6e`'s "verified" claim was wrong and the user's complaint was right
- **Welcome images on the box are untracked** — `utils/images/welcome/*.jpg` + `global.jpg` survive restarts (panel auto-pull does NOT `git clean`); `utils/welcome_image.jpg` IS tracked (repo default). setgoodbyeimage is still per-group (user never complained — don't fix unprompted)
- **Box = 256MB panel limit / 294MB cgroup / PID1 tini+restart policy** — in-process `process.exit(0)` is the safe OOM dodge (panel relaunches); memory telemetry = `[MEM]` lines every 30min, critical threshold 245MB ×2 samples
- **Baileys reconnect = NEW sock object** — any timer registered once across reconnects must read a module-level live sock ref (`_crewSyncSock`/`_unpinSock` pattern), never close over the boot sock. autoProgression already did this via clear+re-register; the two timers above did not
- **Retry caps must not burn on transient network errors** — a 3-try window during one disconnect stranded the event pin forever; classify `connection closed|timed out|socket|rate limit` as no-penalty retries
- **Ranks vs roles**: crew sync writes `role: 'member'` for everyone; config ladders (except SSGENERAL) start at their first REAL rank — 'member' is the implicit recruit tier (index -1 → ranks[0]). `PROMOTION_THRESHOLDS[-1]` is undefined and falls through to the TOP threshold — always clamp index ≥ 0
- **WhatsApp mention tokens stay in message text** — `@123456` appears as a literal arg; any command joining leftover args into stored text (role names etc.) must strip `/^@\d{4,}$/` first (`resolveUser` now does)
- **`cmd.usage` has exactly ONE consumer** — `help.js:64`. `menu`/`list` render `${prefix}${name}` themselves
- **`extra`/`ctx` NEVER carries `prefix`** — **use `config.prefix || '.'`**
- **`config.js:108 invalidCommand` is DEAD** — unknown commands just get a ❌ reaction
- **Container clock = UTC**, SA is fixed **UTC+2 no DST** — time code goes through `utils/sast.js`
- bot-hosting MCP `deployments_power` takes `action` (NOT `signal`), param `id` (NOT `deployment_id`); restart can return `ok:false "A sync is already running"` → wait ~45s; `files_get` doesn't exist — it's `files_read`; `deployments_setAutoPull` arg is `autoPull` (boolean)
- `node --test tests/` (directory) fails on Windows/Node 24 — glob `tests*.test.js`; kill stray node procs first; redirect output to file (pipe stalls)
- `database/crew.json` NO LONGER tracked — tests self-restore
- PowerShell: build MCP bodies as hashtables → `ConvertTo-Json -Depth 6 -Compress` → ASCII `WriteAllText` → `curl.exe --data "@file"`

## Kill List (do NOT resurrect)
Crew dashboard, 14 admin mega-panels, WYR A/B buttons, launcher list views, setter panels, NSFW buttons, per-command Again handlers, positional RSVP buttons, silent first-event fallback.

## Active Files
- **`config.js`** — KSSPS/KSSMP jid+invite (live-verified 2026-10-14), crewTeams source of truth
- **`commands/admin/setwelcomeimage.js`** — writes `utils/images/welcome/global.jpg`; **`handler.js` ~2368** — non-crew welcome chain global > per-group > default > group PP > Picsart
- **`index.js`** — memory guard + `[MEM]` telemetry (~line 134); `_crewSyncSock` live ref + `CREW_SYNC_TRANSIENT` retry policy (~line 282); team-admin prune gated on clean scans (~line 711); `_crewSyncSock` refresh (line ~243)
- **`utils/imageText.js`** — sharp cache/concurrency caps (process-global, loaded via handler.js at boot)
- **`utils/autoProgression.js`** — `_roleIndex` (recruit tier), `getThresholds` clamp, CHECK/held-log noise gates
- **`commands/crew/eventRsvp.js`** — `_unpinSock` live ref + transient-error unpin handling
- **`commands/crew/crewHelpers.js`** — `resolveUser` mention-token strip; **`commands/crew/role.js`** lowercases roles
- `commands/crew/eventWizard.js` (493 lines, extract before adding) / `eventRender.js` / `cpmData.js`
- `commands/general/help.js` — usage renderer; `utils/sast.js` + `index.js:21` (TZ)
- `commands/media/tiktok.js` — provider chain + placeholder guards
- Any NEW reply with a command example must use `config.prefix || '.'`, never a literal `.`

## Next Steps
- Smoke: `!tt <slideshow link>` (a `/photo/` URL) must now deliver images via tikapi→sendSlideshow; regular `/video/` links unchanged
- After the next reconnect flap: crew sync must log either success or ONE "socket not open — waiting for reconnect" line (no more 5× Connection Closed walls / attempt 2/4→4/4 storms); team-admin sync must log "Skipping prune — N/M group scans failed" instead of pruning
- The 9 pruned team admins (from the pre-fix flap) self-heal on the next clean scan — confirm `[TEAM ADMIN SYNC] Auto-detected N team admins` re-appears after a stable reconnect; if not, owner re-runs a manual team-admin add
- Watch `[MEM]` telemetry over the next day — steady ~131-138MB so far; guard fires only at ≥245MB×2 samples (panel relaunches); if restarts fire often, profile the real grower (Baileys stores vs external buffers) before raising thresholds
- Owner action: run `!kickcfg preview` once — releases the 39-member mass-kill hold (kicks were HELD by design every cycle)
- Owner: re-set the 4 junk KSSMS roles (`!crew role @user <role>`) — pre-fix entries still contain `@jid` prefixes and won't match any ladder (now logged as one "custom role not in ladder" line per team)
- Smoke: KSSPS apply → accept now DMs `Ls0Vol…` (Private Security Team) link and auto-adds to jid `120363409819775730`; a non-crew group join shows the promoted global.jpg welcome
- Smoke: after the next reconnect, `[CREW SYNC]` periodic runs must succeed (no more all-teams "Connection Closed"); an ended pinned event must unpin on the first sweep after reconnect
- Progression: members with ≥100 msgs/36d in SSRS/KSSPS/KSSMP/KSSMS should now promote into `ranks[0]` (was impossible before)
- Prior arcs' smoke tests still open: `!event` wizard → pin → auto-unpin at SA wall time; `!tt <url>` delivers real video; time displays 00:00–02:00 SAST show SA dates
- Legacy events (pre-`011a519`) have no `pinnedMsgId`/`eventDate` — will NOT auto-unpin

## Memory Keys
mcp__claude-flow__memory_search { query: "stale sock reconnect timers crew sync unpin sweep recruit tier roleIndex mention token strip roles mass kill guard kickcfg preview", namespace: "project" }
mcp__claude-flow__memory_search { query: "KSSPS KSSMP invite swap jid verification global welcome image sharp cache memory guard cgroup 256MB", namespace: "project" }
mcp__claude-flow__memory_search { query: "team admin prune failed scans connection closed retry ladder dead socket readyState transient no penalty 503 flap", namespace: "project" }
mcp__claude-flow__memory_search { query: "tiktok slideshow photo mode /photo/ url aweme id extraction tikapi tikwm 403 datacenter", namespace: "project" }
