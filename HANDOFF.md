# HANDOFF

## Goal
Fix all bugs in KAMI-Bot's button code, protection system, and outputs; build cross-group add/remove commands; deploy everything.

## Current State
- ALL fixes committed (`9237344` latest) and SFTP-uploaded to the server. Bot offline — user's accounts restricted by WhatsApp (bulk-messaging, ~24h timer). User will pair main account when timer ends.
- Working: two-strike demote+kick protection, button delegation, full team names in outputs, fromMe owner detection, rate-limited activity-check DMs, mentions, CREW SYNC, session persistence.

## What Was Tried That Failed
- **Activity-check DMs to all inactive members at once** — WhatsApp restricted TWO accounts (44 + 68 cold DMs in a blast). Fixed: max 5 DMs/cycle, 60-90s spacing, dedup persisted to `database/inactiveAlerts.json`.
- **`sessionRetryCount` used but never declared** — unhandled rejection crash. Fixed: module-level `let sessionRetryCount = 0` (index.js:182).
- **In-memory `_botKicked`/alert Maps lost on restart** — re-blast/re-add loops. Fixed: persisted inactiveAlerts; _botKicked remains in-memory (5s window, acceptable).

## Active Files
- `handler.js` — protection remove-path (~1568+), fromMe owner fix (10 `isOwner: isOwner(sender) || msg.key.fromMe` sites + button checks), moderation kicks set `_botKicked`
- `commands/admin/kick.js` — two-strike kick protection; `commands/admin/demote.js` — two-strike demote protection + args-JID target
- `commands/admin/promote.js` — demote button delegates to demoteCmd.execute
- `commands/owner/addto.js` + `removefrom.js` — cross-group add/remove (owner-only, any phone format, group abbrev/name matching)
- `utils/teamName.js` — `getTeamDisplayName(teamKeyOrJid, subject)` helper
- `utils/autoProgression.js` — roles-only (no WhatsApp admin promote), DMs inactive members (capped/spaced/persisted)
- `database.js` — protection DBs + `getKickAttempts`/`incrementKickAttempts`/`resetKickAttempts`
- `config.js` — SSGENERAL renamed to "KAMI's Slammed Society CPM Crew"

## Known Gotchas
- Server's untracked `package.json` likely blocks git pull — ALWAYS SFTP upload changed files (edit `upload_sftp.py` FILES list first)
- Server runs baileys `7.0.0-rc13`; registry has BOTH `7.0.0-rc.9` (dotted) and `rc10`-`rc14` (undotted) formats
- `wa-sticker-formatter` required at `sticker.js:5`, missing locally — in package.json as ^4.4.4
- `mention()` must use digits of the JID as passed (no LID→PN mapping) or mentions break
- LID digits ≠ PN digits — protection checks must bridge via `buildComparableIds` variants
- Panel API restart 404/DNS-fails — user restarts from panel manually
- `node -e` requiring command modules hangs (database.js timers) — test scripts must `process.exit()`
- Model looping on long tasks: keep responses short, commit small, handoff often

## Next Steps
1. User pairs main account after restriction timer ends (~24h from Sep 24 12:00)
2. Test after pairing: `!dmblocker` (owner should work now — fromMe fix), `!crew inactive` in the general group (should say "KAMI's Slammed Society CPM Crew"), promote → admin presses demote button (should be blocked), `!addto`/`!removefrom`, activity-check DMs (max 5/hour)
3. Optional: make activity check post in group instead of DMs (user asked to be told the option)

## Memory Keys
mcp__claude-flow__memory_search { query: "KAMI-Bot protection buttons deployment", namespace: "project" }
