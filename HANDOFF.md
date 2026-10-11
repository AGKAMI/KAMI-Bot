# HANDOFF

## Goal
Keep KAMI Bot alive on its 512MB panel box. Prior arc: disk-full deadlock (fixed, live-verified). This arc: 401 session-kill cascade root-caused and fixed (`27aa6e1`) — bot is now sitting at QR awaiting the owner's re-scan.

## Current State
- **Bot: running new code, showing QR** — the false 401-wipe already cleared the session before the fix landed; owner must re-scan (console QR or `qr.png` in panel Files tab)
- Box HEAD = `27aa6e1`, `bin/yt-dlp` = `-rwxr-xr-x` (exec bit now tracked in git: mode 100644→100755)
- Prior arc still healthy: disk ~335MB/512MB, cleanup force-pass + 1-min sweep live (`8dd01d4`)

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

## Next Steps
1. **Tell owner: re-scan the QR** (console or panel Files → qr.png). Bot is otherwise healthy
2. After re-scan: confirm `KAMI BOT CONNECTED` + connectionLog gets an `open` event; watch next 401 (if any) — with the fix it must NOT wipe, and a healthy-ping watchdog must NOT churn quiet periods
3. Optional: `.fb` should now hit yt-dlp directly (EACCES gone) — ask owner to test a facebook link
4. Optional hardening (only if conflicts recur post-fix): add `sock.ev.process` backpressure logging; consider `DisconnectReason.restartRequired` (515) handling audit

## Memory Keys
mcp__claude-flow__memory_search { query: "kami 401 conflict wipe watchdog health-check sendPresenceUpdate btnId dmblocker yt-dlp EACCES git filemode 100755 connectionLog baileys generics node.attrs.code", namespace: "project" }
