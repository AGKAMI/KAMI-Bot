# HANDOFF

## Goal
Restriction-proof inactivity system: group notices only (no cold DMs), one notice per group every 7 days, ALL inactive members mentioned in one message (no cap), auto-kick members still inactive 14 days after their notice.

## Current State
- DONE + TESTED (20/20 synthetic): `utils/autoProgression.js` activity check v3:
  - No mention cap — every inactive member in a group listed + mentioned in ONE message; "...and N more" truncation removed
  - Per-GROUP 7-day notice cooldown (replaces per-person cooldown), persisted in `database/inactiveAlerts.json` v2 (`{groups, flagged, holdUntil}`)
  - Auto-kick: member flagged by a notice who stays inactive 14 days → removed from that group. Skips owner, bot, owner-protected, groups where bot isn't admin. Sets `handler._botKicked` (5s, same pattern as kick.js), posts `🗑️ AUTO-KICK` group message with mention. Flag cleared if member left/went active; kept if kick failed (retry next cycle). Earliest flag wins — re-notices can't delay a kick
  - Unchanged: max 5 group notices/cycle, 3s spacing, 30-day threshold, hourly cycle, owner/bot/leaver exclusion
  - Effective timeline: inactive 30d → group notice → 14d grace → kicked (~44d)
- `upload_sftp.py`: `REMOTE_BASE` fixed `"/home/container"` → `"/"` + md5 verify-after-upload
- NOT committed/deployed yet. Deployed server code is still `599f524` (group notices, 10-mention cap, per-person cooldown, no kicks)
- Verified server state read-only: SFTP root IS the bot dir (config.js, package.json, node_modules present)

## What Was Tried That Failed
- **Cold DMs for inactivity at ANY rate** — restricted all three accounts (5/cycle + 60-90s spacing + 7-day cooldown still hit on 3rd restriction). Final: group notices only
- **Per-person 7-day cooldown** — groups could be re-noticed far too often; replaced with per-group cooldown
- **SFTP `REMOTE_BASE="/home/container"`** — SFTP chroot already IS the bot dir, so uploads nested into a stale `home/container/` subtree and went nowhere; deploys only worked via GitHub auto-pull. Fixed to `"/"`
- **10-mention cap** — user wants every inactive member mentioned (removed)
- Panel API restart — 404/HTML fallback; user restarts from panel manually
- `node -e` requiring command modules hangs (database.js timers) — test scripts must `process.exit()`

## Active Files
- `utils/autoProgression.js` — v3 notices + `_runKickPass` (auto-kick); state file `database/inactiveAlerts.json`
- `upload_sftp.py` — deploy list (currently `["utils/autoProgression.js"]`) + md5 verify
- `handler.js` — exports `_botKicked`, `isBotAdmin(sock, gid, meta=null)`; autoProgression lazily requires it inside `_runKickPass` (no circular import — handler never requires autoProgression)
- `database.js` — `getInactiveMembers(groupJid, days)`, `isOwnerProtected(groupJid, variant)`
- Test: `C:\Users\ojuni\AppData\Local\Temp\opencode\test_inactive_v3.js` (20 asserts, patches database/config, cleans up state file)

## Known Gotchas
- **SFTP chroot = bot dir** — remote paths are relative to ROOT (`/`), NOT `/home/container` (a stale nested copy exists there; ignore it)
- Old v1 `inactiveAlerts.json` (`{jid: ts}`) auto-migrates to `holdUntil=now` — no group gets a notice within 7 days of deploy; kicks start 14 days after the first v2 notice
- Local `database/crew.json` is empty — tests must patch `database.getInactiveMembers`/`getTeamMap`/`isOwnerProtected` + `config.crewTeams`/`ownerNumber`
- LID≠PN — kick resolves the ACTUAL participant id from groupMetadata via digit→id map, never guesses
- Server's untracked package.json can block git pull — SFTP fallback with md5 verify
- Kicks silently pause if bot isn't admin in a group — check bot admin status after deploy
- SFTP password needs `.strip()` (trailing newline fails auth)

## Next Steps
1. User says "commit" → commit + push `utils/autoProgression.js` + `upload_sftp.py`
2. Deploy: `python upload_sftp.py` (md5-verifies) and/or GitHub auto-pull at restart → user restarts from panel
3. After restart: watch first hourly `[INACTIVE-CHECK]` log — expect "N group(s) in 7-day cooldown" from v1 migration
4. Confirm bot is admin in every crew group (else AUTO-KICK "paused — bot is not admin")

## Memory Keys
mcp__claude-flow__memory_search { query: "KAMI-Bot inactive notice auto-kick SFTP REMOTE_BASE restriction", namespace: "project" }
