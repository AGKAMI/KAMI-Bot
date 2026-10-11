# HANDOFF

## Goal
Keep KAMI Bot alive on its 512MB panel box. Prior arcs: disk-full deadlock, 401 conflict-wipe cascade, adminpush silent-delivery — all fixed and live. This arc: stop every command leaking raw jid/lid into user-facing output — show display names instead (`8f11f82`).

## Current State
- **Bot: running new code, CONNECTED** on 27833882383, prefix `!`, session survives deploy restarts (401-fix held)
- Box HEAD = `8f11f82`, `bin/yt-dlp` = `-rwxr-xr-x` (exec bit tracked in git: 100644→100755)
- Prior arcs healthy: disk ~335MB/512MB (`8dd01d4`), 401 conflict-wipe fix (`27aa6e1`), adminpush audit/canary (`b178490`)
- **name-display arc (`8f11f82`, deployed)**: user reported commands leak raw jid/lid (e.g. accept flow "already accepted by @62281337557223"). THREE root causes: (1) `extra.reply(text, { mentions })` SILENTLY DROPPED the options — reply helper only took `text`, so every @tag in the codebase rendered as raw digits; (2) `mention(processed.admin)` had no mentions array + admin stored as LID → unresolvable digits; (3) raw `jid.split('@')[0]` / `@${num}` leaks in many commands
- Fix shipped: `utils/nameCache.js` learns pushName from every message (persisted `database/nameCache.json`, gitignored, capped 5000, 60s flush, `.unref()`); `mention()` returns cached name else `@digits`; `extra.reply` forwards opts; accept/deny/cancel/reroll/withdraw store+show `adminName`; swept roster/inactive/activity/demote(crew+admin)/poll/block/unblock/db/setname/setdesc/crewForms. Tests: nameCache 13/13, checkall 237/0, btn-dispatch 16/16, event/picker/ban green

**Incident timeline (this arc):**
1. User pasted console log: `.fb` → `spawn bin/yt-dlp EACCES`; `[DMBLOCKER] early check error: btnId is not defined` on every button tap; `⚠️ Session issue (401) — retry N/8` ending in crew-accept `Connection Closed` (428)
2. `database/connectionLog.log` (persistent log from `8137f93` — first real post-mortem use): first close at 11:56:43 = **`401 "Stream Errored (conflict)"`**, then 7× `401 "Connection Failure"`, `session-cleared afterRetries:8` at 12:01:34, then QR events. Bot had been up since 10:29:05 open — conflict 87 min later
3. Old box `08b6894d` deleted from panel (client API returns SPA HTML, not JSON) — ruled out. Only one deployment on bot-hosting — no second bot instance
4. Root-cause chain found and fixed (see below)

## Root Cause (401 cascade)
1. **Watchdog false-positive**: `lastActivity` only updates on `messages.upsert` + open. A 30-min-quiet group window (~11:26→11:56, matches exactly) made the watchdog `end()` a HEALTHY open socket and reconnect. Tearing down a live socket races WhatsApp's server-side close of the old connection → new socket gets `Stream Errored (conflict)`
2. **Conflict carries code 401**: Baileys `generics.js:289` — server's `node.attrs.code` OVERRIDES `CODE_MAP`, and WhatsApp sends `code=401` on conflict stream errors (not 440). So `statusCode === 401` was true for a pure conflict
3. **Wipe misclassification**: `index.js` wiped the session after 8 retries whenever `isLoggedOut` (401) — including conflict-401s where the session was still valid. Wipe → `process.exit(1)` → QR needed → owner re-scan. The "another device" was our own reconnect churn
4. **btnId bug**: `handler.js:694` referenced `btnId` (never defined in that scope) in the DM-blocker early check → ReferenceError → caught at :772 → whole early check silently aborted on every button tap (DM blocker broken for button-pressing DMs)
5. **yt-dlp EACCES**: git index had `bin/yt-dlp` as 100644; Windows `core.filemode=false` never corrects it; every Linux checkout = 644 = no exec bit. The Oct 11 10:28 mtime = last deploy's checkout

## The Fix (`27aa6e1`, pushed, deployed, verified on box)
- `index.js` wipe guard: `sessionRetryCount >= 8 && isLoggedOut && !isTransient` — conflict-401s retry forever, never wipe. Genuine logged-out (401 without conflict semantics) still wipes after 8 with backup
- `index.js` watchdog: OPEN-but-silent sockets now get `sendPresenceUpdate('available')` health-check (15s race timeout) — alive → keep + reset activity window; dead → end()+reconnect. CLOSED-ws zombie path unchanged
- `handler.js:694`: `btnId` → `isBtnTap` (same message-shape detection as line 730)
- `bin/yt-dlp`: `git update-index --chmod=+x` → 100755. Verified post-deploy: `-rwxr-xr-x`
- Tests: checkall 236/0, btn-dispatch 16/16, event 15/15, ban 17/17, kickcfg + picker green

## What Was Tried That Failed
- `files_chmod` MCP with `path` arg → `expected string, received undefined` (schema wants `file` + `root`); retry with correct schema → 500 node_error. **Use `deployments_shell` + `chmod` instead** — shell works fine when disk is under the cap
- `deployments_searchLogs` for the conflicting connection → buffer rotated (`scanned: 59`), useless for forensics. connectionLog.log is the tool that actually solved this
- `rg` with glob `node_modules/.../Socket/*.js` on Windows → path error; quote or drop the glob

## Active Files
- `utils/nameCache.js` — pushName cache: `remember/get/who/flush`; `mention()` in `utils/format.js` delegates to it; `handler.js` remembers sender name + `extra.reply` forwards opts + `extra.who`/`extra.pushName`
- `database.js` — `trackProcessedApp` stores `adminName`/`applicantName`
- `commands/crew/{accept,deny,cancel,reroll,withdraw}.js` — store+show display names
- `index.js` — watchdog health-check (~322-350), wipe guard (~391), scheduleReconnect single-timer, logConnEvent
- `handler.js:694` — isBtnTap fix in DM-blocker early check
- `bin/yt-dlp` — mode 100755 in git index (Windows: `core.filemode=false` so never "fix" it by re-adding)
- `database/connectionLog.log` — persistent conn forensics (capped ~400 entries/96KB, gitignored via `*.log`)
- `HANDOFF.md` — this file

## Known Gotchas
- **WhatsApp sends code=401 on CONFLICT stream errors** — `statusCode===401` ≠ logged out. Always check the message for 'conflict' before treating 401 as logout (Baileys `generics.js:289`: server code overrides CODE_MAP)
- **Watchdog inactivity reconnect is dangerous on this box** — groups go quiet for hours; NEVER revert the health-check to blind end()+reconnect
- `lastActivity` only ticks on `messages.upsert` — presence pings from the watchdog itself don't count (by design, we set it manually on healthy ping)
- **`bin/yt-dlp` loses +x on every deploy if index mode regresses to 100644** — check `git ls-files -s bin/yt-dlp` shows 100755 after any re-add
- `files_chmod` MCP is broken (500) — use `deployments_shell`
- Old panel `08b6894d`/ptlc_ key now returns SPA HTML (server deleted from panel) — fully dead, stop investigating it
- `deployments_searchLogs` scans ~59 lines post-incident — rely on connectionLog.log + file mtimes
- Bot is at QR until owner scans; session backups exist as `kami_session.bak-<ts>` (newest 2) if a false-wipe ever needs manual restore
- Disk arc gotchas still apply: 512MB cap, ~335MB baseline, boot force-pass, 1-min sweep, announce caps 50MB
- **`extra.reply(text, opts)` now forwards opts** — before 8f11f82 it SILENTLY DROPPED `{mentions}` etc, so every @tag rendered as raw digits. Any code relying on the old 1-arg-only behaviour is unaffected (extra args are optional)
- **`mention()` returns the cached display name when known, else `@digits`** — the @digits form only renders as a proper WhatsApp tag when paired with a `mentions` array; alone it's a last-resort digits label. `utils/nameCache.js` learns names from every incoming message (`msg.pushName`) — `database/nameCache.json` (gitignored, capped 5000 entries, 60s flush with `.unref()`)
- **Two servers**: panel `08b6894d` ≠ live `b0665152…/u9mg7ylz` — SFTP/MCP = live, Pterodactyl API = dead box

## Next Steps
1. Ask owner to re-test the accept flow that showed `@62281337557223` — after the accepting admin has sent ANY message to the bot (warms the cache), it now shows their name; before warm-up it shows `user …223` or the digits only as last resort
2. If canary DM fails on adminpush: DM path dead → check connection (connectionLog.log) before anything else
3. Optional: `.fb` should now hit yt-dlp directly (EACCES gone) — ask owner to test a facebook link
4. Optional hardening (only if conflicts recur post-fix): add `sock.ev.process` backpressure logging; consider `DisconnectReason.restartRequired` (515) handling audit
5. Optional: kickcfg.js:263 still shows `@${k.digits}` (real phone digits, not LID) in the kick list — acceptable but could use nameCache if a jid is threaded through

## Memory Keys
mcp__claude-flow__memory_search { query: "kami nameCache pushName display name mention jid lid raw digits extra.reply forward options mentions array accept deny cancel already accepted by 401 conflict wipe watchdog health-check yt-dlp EACCES git filemode adminpush canary status ERROR lidOnly silent drop", namespace: "project" }
