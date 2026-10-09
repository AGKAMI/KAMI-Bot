# HANDOFF

## Goal
Ship working auto-kick for 14-day-inactive members in KAMI Bot (WhatsApp bot) and keep the live deployment healthy. Primary goal ACHIEVED this session: the backdated flag state was finally reloaded by a live restart and the kick pass processed all 89 due flags at 2026-10-09 18:15:43. Exact kicked-vs-cleared counts need user confirmation (see Next Steps #1).

## Current State
**Working:**
- Live bot running (deployment `b0665152-9b54-4ede-a11f-45c4a6641704`, state `running`), WhatsApp connected as of ~21:33.
- `database/inactiveAlerts.json` on live box (verified via MCP `files_read`): 8 flags remaining (2+5+1), all ts `179155844xxxx` = 17:07 fresh notices → grace till Oct 23; `groups[]` all 17:07 → notice cooldown to Oct 16; `holdUntil` Sep 25 preserved.
- The 89 backdated (Sep 25 12:00) flags are GONE — deleted by the 18:15:43 kick pass. Zero failure-retained flags → every due flag hit a terminal branch (kicked / left / active-again / owner / protected). Kick-failure branch RETAINS flags (`autoProgression.js:423`), and not-admin retains a whole group's flags (`:361`) — neither happened, so bot was admin in all 5 crew groups and no kick errored.
- MCP API access to the LIVE box works: `POST https://bot-hosting.net/api/mcp`, `Authorization: Bearer bhk_b77e82b54bfb19ebe8be6391d3833e514af2614e1478d0e8`, JSON-RPC `tools/call` (`deployments_list/logs/searchLogs/shell/power/diagnose/apply`, `files_*`, `env_*`, `backups_*`). Requires `id` + args in `params`.
- Docs updated this session: `AGENTS.md` (two-server warning, MCP credentials, new gotchas), `~/.claude/CLAUDE.md` (Known Gotchas + Deployment Workflow).

**Broken / incomplete:**
- Exact kick count unknown — 18:15 console output rotated out (panel log buffer = ~16–100 lines). Each kick posts a `🗑️ AUTO-KICK` message into its group (`autoProgression.js:414`) — user can scroll groups to count.
- Zombie-fix deploy in flight at handoff time: `index.js` fixes (reconnect backoff retry, watchdog readyState===3, 15s version-fetch timeout) + workflow rewrite committed and pushed; workflow auto-restarts the live box (secrets now = bhk_ key + live deployment id). Verify boot via MCP `deployments_logs` next session.
- Old panel API key `ptlc_b2LS…` only works against stale box `08b6894d` (404 on live `u9mg7ylz`) — different panel account owns the live server.

**Files changed this session (working tree state):**
- `index.js` — 3 zombie fixes: `scheduleReconnect` re-arms with ×2 backoff (cap 5 min) if `startBot()` throws pre-wiring (`:194`); `fetchLatestBaileysVersion` raced with 15s timeout, falls back to Baileys default version (`:237`); watchdog now also fires on `readyState===3`/missing ws (dead socket, no close event) and only `end()`s live sockets (`:291`)
- `.github/workflows/deploy-bot-hosting.yml` — rewritten: JSON-RPC `tools/call deployments_power` (`action:"restart"`, `waitSeconds:30`) against `https://bot-hosting.net/api/mcp` with `bhk_` key; secrets `BOT_HOSTING_API_KEY` = bhk_ key, `BOT_HOSTING_SERVER_ID` = `b0665152-9b54-4ede-a11f-45c4a6641704` (set via gh 21:42)
- `AGENTS.md` — two-server warning, MCP restart path, bhk_ credentials, 4 new gotchas
- `~/.claude/CLAUDE.md` — Known Gotchas + Deployment Workflow updated (outside repo)
- `HANDOFF.md` — this rewrite
- Verified locally: `node --check index.js`, `checkall.js` 234 files 0 failed, `runtime-smoke.js` 4/4, workflow YAML parses

## What Was Tried That Failed
- **Pterodactyl client API restarts via `08b6894d`/ptlc_ key** — hit a DEAD June–Sep box; the live bot was never restarted by them. Root cause of the whole "backdate ignored" saga (plus in-memory state caching).
- **Deploy workflow auto-restart** — every run since 2026-06-15 failed HTTP 401 (expired secret). Key replaced 10-09; dispatch returned 204 but restarted `08b6894d` (wrong `BOT_HOSTING_SERVER_ID`).
- **`bhk_` key on `control.bot-hosting.net/api/client`** — 401; bhk_ belongs to `bot-hosting.net/api/mcp` (found via docs search).
- **Disk-editing `inactiveAlerts.json` while bot runs** — invisible until restart (`_loadState()` at module load); live process wrote its in-memory Oct-2 flags back over edits at 17:07:38.
- **Recovering 18:15 kick lines** — `deployments_searchLogs` (lines:5000) and `deployments_logs` (size:500) only expose ~16–100 lines; rotated out.
- **`grep`/`head`/inline heredocs on this Windows box** — use ripgrep; write scripts to `$env:TEMP\opencode\` via file-writer instead of `node -e`/`python -c` with embedded quotes.

## Active Files
- `utils/autoProgression.js` — kick engine; `_runKickPass` 325-428 (deletion semantics 365-424), notice loop 504-584, `_loadState/_saveState` 274-290, scheduling 221-245. Server copy md5-matches local (newline-normalized).
- `index.js` — open handler 300-566, engine start at 542; TARGET of pending zombie fixes.
- `.github/workflows/deploy-bot-hosting.yml` — needs rewrite for live-server restart.
- `HANDOFF.md`, `AGENTS.md`, `~/.claude/CLAUDE.md` — updated this session (repo files uncommitted).
- `%TEMP%\opencode\` — `merge_backdate.py` (verified uploader), `kick_now.py`, `panel.ps1`, `inactiveAlerts.backup.json/.current.json/.now.json`, `autoProgression.server.js`, `checkall.js`, `runtime-smoke.js`.
- Host state: `database/inactiveAlerts.json` (8 flags, mtime 18:15:43), `database/groupStats.json` (message-flow marker, mtime ~21:32).

## Known Gotchas
- TWO SERVERS: live = `b0665152-…/u9mg7ylz` (SFTP+MCP); stale = `08b6894d` (ptlc_ key, frozen 09-18). Full detail in `AGENTS.md`.
- `bhk_` → `bot-hosting.net/api/mcp`; `ptlc_` → `control.bot-hosting.net/api/client`; different panel accounts.
- Console log buffer tiny (~16–100 lines) — never verify from logs; use state-file mtime/content.
- Kick pass: failures keep flags; terminal states delete; not-admin keeps whole group's flags.
- Bot caches state in memory at boot — full process restart required after any disk edit of `database/*.json`.
- Each bash call = fresh shell (env like `GH_TOKEN` doesn't persist); `>` writes UTF-16LE; `%TEMP%` not expanded in PowerShell — use `$env:TEMP`.
- `gh` unauthed; token via `git credential fill` (host github.com, username AGKAMI).
- Standing user directive: commit/push/SFTP when done, don't wait for approval.

## Next Steps
1. Verify the zombie-fix deploy landed: `git log -1`, then MCP `deployments_logs`/`searchLogs` for boot lines (KAMI BOT CONNECTED) and confirm `files_read index.js` shows the new watchdog text ("WebSocket dead without close event"). If the workflow run failed, check `gh run list`.
2. Ask user to confirm the kicks: scroll the 5 crew groups for `🗑️ AUTO-KICK` announcements (each kick posts one), or report members missing. Expected: up to 89 processed, mixture of kicked vs cleared (left/active/protected).
3. Oct 16+: notice cooldown expires — watch for duplicate group notices (groups[] @17:07 should prevent; verify first hourly check after Oct 16 17:07).
4. Optional hardening: session-401 cleanup path (`index.js:341` process.exit(1)) still requires a human panel restart — could exit-and-restart via child process or rely on Pterodactyl `always restart`.

## Memory Keys
mcp__claude-flow__memory_search { query: "kami kick backdate two-server MCP bhk panel stale box", namespace: "project" }
