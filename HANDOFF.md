# HANDOFF

## Goal
Fix all bugs in KAMI-Bot's button code, protection system, and outputs; build cross-group add/remove commands; make inactive DMs multi-group; deploy everything.

## Current State
- ALL prior fixes committed (`9237344` + handoff `11b7d18`) and SFTP-uploaded. Bot offline — user's accounts restricted by WhatsApp (bulk-messaging, ~24h timer from Sep 24 12:00). User will pair main account when timer ends.
- COMMITTED + DEPLOYED (`fee70e6` MiMo's consolidation, `0c5e0c0` audit fixes on top): `utils/autoProgression.js` inactive check is now member-centric — one DM lists EVERY crew group the person is quiet in (full names, days inactive, messages per group, total across groups, still-active-elsewhere note, never-posted case). LID/PN identity merged via `buildComparableIds`; cooldown is per-person across all groups; max 5 DMs/cycle + 60-90s spacing kept; max 8 groups per DM; LID DM falls back to PN. Membership check added (leavers not nudged).
- Working: two-strike demote+kick protection, button delegation, full team names in outputs, fromMe owner detection, rate-limited activity-check DMs, mentions, CREW SYNC, session persistence.

## What Was Tried That Failed
- **Activity-check DMs to all inactive members at once** — WhatsApp restricted TWO accounts (44 + 68 cold DMs in a blast). Fixed: max 5 DMs/cycle, 60-90s spacing, dedup persisted to `database/inactiveAlerts.json`.
- **Per-group inactive loop** — DM only mentioned the first team scanned; person inactive in 3 groups got a message about 1. Fixed: aggregate all teams first, one DM per person.
- **`sessionRetryCount` used but never declared** — unhandled rejection crash. Fixed: module-level `let sessionRetryCount = 0` (index.js:182).
- **In-memory `_botKicked`/alert Maps lost on restart** — re-blast/re-add loops. Fixed: persisted inactiveAlerts; _botKicked remains in-memory (5s window, acceptable).

## Active Files
- `utils/autoProgression.js` — cross-group inactive DM (`runInactiveCheck`), roles-only progression, capped/spaced/persisted alerts
- `handler.js` — protection remove-path (~1568+), fromMe owner fix (10 `isOwner: isOwner(sender) || msg.key.fromMe` sites + button checks), moderation kicks set `_botKicked`
- `commands/admin/kick.js` — two-strike kick protection; `commands/admin/demote.js` — two-strike demote protection + args-JID target
- `commands/admin/promote.js` — demote button delegates to demoteCmd.execute
- `commands/owner/addto.js` + `removefrom.js` — cross-group add/remove (owner-only, any phone format, group abbrev/name matching)
- `utils/teamName.js` — `getTeamDisplayName(teamKeyOrJid, subject)` helper
- `database.js` — protection DBs + `getKickAttempts`/`incrementKickAttempts`/`resetKickAttempts` + `getInactiveMembers`/`getMemberActivity`
- `config.js` — SSGENERAL renamed to "KAMI's Slammed Society CPM Crew"

## Known Gotchas
- Server's untracked `package.json` likely blocks git pull — ALWAYS SFTP upload changed files (edit `upload_sftp.py` FILES list first)
- Server runs baileys `7.0.0-rc13`; registry has BOTH `7.0.0-rc.9` (dotted) and `rc10`-`rc14` (undotted) formats
- `wa-sticker-formatter` required at `sticker.js:5`, missing locally — in package.json as ^4.4.4
- `mention()` must use digits of the JID as passed (no LID→PN mapping) or mentions break
- LID digits ≠ PN digits — protection checks must bridge via `buildComparableIds` variants; inactive alerts mark cooldown on ALL variants
- Same crew JID can appear under both `teamMap` and `config.crewTeams` — merge dedupes by JID
- Panel API restart 404/DNS-fails — user restarts from panel manually
- `node -e` requiring command modules hangs (database.js timers) — test scripts must `process.exit()`
- Local `database/crew.json` is empty (0 members) — real roster/stats live on the server; local inactive tests need synthetic data
- Model looping on long tasks: keep responses short, commit small, handoff often

## Next Steps
1. Commit + push + SFTP `utils/autoProgression.js` (add to `upload_sftp.py` FILES), restart from panel
2. User pairs main account after restriction timer ends (~24h from Sep 24 12:00)
3. Test after pairing: `!dmblocker`, `!crew inactive`, demote-button block, `!addto`/`!removefrom`, activity-check DMs (max 5/cycle — should list all quiet groups in ONE message)
4. Optional: make activity check post in group instead of DMs (user asked to be told the option)

## Memory Keys
mcp__claude-flow__memory_search { query: "KAMI-Bot protection buttons deployment inactive multi-group", namespace: "project" }
