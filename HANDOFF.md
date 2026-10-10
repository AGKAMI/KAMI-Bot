# HANDOFF

## Goal
KAMI Bot: (1) welcome/goodbye image text must scale to the background image size (group PPs are often 640px — old fonts overflowed) with trimmed defaults; (2) kick-ban protection — members kicked by the owner via `!kick` can only be re-added by the owner; anyone else re-adding them gets them kicked straight back out; owner-added members only kickable by the owner. Both implemented this session, uncommitted — commit/push/boot-verify pending.

## Current State
**Working / verified locally:**
- **Image text scaling** (`utils/imageText.js buildImage`): `scale = clamp(0.4, (w||1600)/1600, 1)` applied to padding, avatarSize (floor 60), bg padding, per-line font sizes (floor 14). 1600px look unchanged; 640px/1080px now scale down. Render test 6/6 (640/1080/1600/no-avatar/320-floor all render, dimensions preserved).
- **Welcome/goodbye defaults trimmed**: handler.js welcome+goodbye defaults `72/44/32 → 56/36/26`; setwelcomestyle/setgoodbyestyle displayed defaults updated to match. avatarSize 150/180 unchanged (scaled internally).
- **Kick-ban system** (owner-kicked → only owner re-adds):
  - `database.js`: `kickBans.json` (gitignored runtime data) — `banMember(gid, jid, byJid)`, `unbanMember`, `isBanned` (normalize-digit match across variants); `_readAudit` fixed (see Failed section)
  - `commands/admin/kick.js`: owner kick path bans every target + clears old protection; kick success message appends ban notice; `admin:readd` button blocked for non-owners on banned targets; owner re-add unban BEFORE the add call (event-race), then `addOwnerAddedMember` + "Ban lifted" line
  - `commands/admin/add.js`: non-owner blocked from adding banned (NAH BRU); owner unban-before-add + protect-after + "Protected" line
  - `handler.js handleGroupUpdate`: destructure `author`; 'add' event → banned + non-owner author = kicked back out (group NAH BRU msg + owner DM + logProtection, `bannedKicked` Set, skip crew sync); banned + owner author = unban + protect; NOT banned + owner author = native-add protection. 'remove' event → owner-actor removes of protected members = no re-add, protection cleared (respect owner); non-owner = existing re-add flow. Welcome loop skips `bannedKicked`
  - `commands/crew/remove.js`: non-owner blocked from removing owner-protected members
  - `crew/add.js`, `crew/accept.js`, `owner/addto.js`: unban alongside `addOwnerAddedMember`
  - `commands/admin/warn.js`: warn-threshold + `admin:kick` button skip protected members
- Verified: node --check all 12 touched files, checkall 236/0, test-kickcfg 25/25, test-btn-dispatch 16/16, test-event 15/15, test-picker 45/45, **test-ban 17/17** (`%TEMP%\opencode\test-ban.js`: DB roundtrip/group-scope/variants, enforcement kick + NAH BRU msg + owner DM, owner re-add lift+protect, native-add protection, external kick re-add, owner remove no-re-add+clear, random no re-add), **test-imagetext 6/6**
- `database/crew.json` restored (`git checkout`) after picker test pollution

**Pending:**
- Commit (2 commits planned: `fix(welcome)` image scaling; `feat(protection)` kick-ban + audit fix) → push → gh workflow ~12s → sleep 90 → MCP `deployments_logs` verify boot (`state: running`, `KAMI BOT CONNECTED`, no new errors)
- Tell user: ban system live (owner kicks ban; only owner re-adds; auto-kickback), image text scales to background now
- Oct 16 17:07+: first post-cooldown notice scan with new engine (watch flags)

## What Was Tried That Failed
- **`_readAudit` empty-object cache bug**: `_loadToCache(AUDIT_DB)` caches `{}` when audit.json missing (fresh install / fresh test env) → `_readAudit` cache-hits `{}` (no entries array) → `audit.entries.push` throws → exception swallowed by handler.js outer catch (logged "[CREW SYNC] Error") → protection DMs silently skipped. Fixed: `_readAudit` re-validates cache entry has `entries` array, falls back to `{entries:[]}` and re-caches. This bug would have broken ALL audit logging (logCommand/logProtection/logAdminAction) on a fresh deploy — same fix applies to any `_loadToCache` user that assumes shape
- Test expectation `YOU GOOD` DM: passed only after audit fix; symptom was PASS on re-add call but zero DMs in `sent` — always assert sends, not just API calls
- Inline `node -e` for multi-statement tests — quoting mangles on Windows PowerShell; write scripts to `$env:TEMP\opencode\` via file-writer
- `voice.say('protected')` returns undefined (harmless in template literal, becomes "undefined" text — cosmetic, not fixed)

## Active Files
- `utils/imageText.js` — buildImage scaling factor
- `handler.js` — welcome/goodby defaults (56/36/26); handleGroupUpdate ban enforcement (add branch before crew sync, remove-branch owner-actor check, welcome skip bannedKicked)
- `database.js` — KICK_BANS_DB + banMember/unbanMember/isBanned + exports; `_readAudit` cache-shape fix
- `commands/admin/kick.js` — owner-kick ban recording + readd-button gate + unban-before-add
- `commands/admin/add.js` — ban check + owner unban-before-add + protect
- `commands/admin/warn.js` — protected-member skip (threshold + admin:kick btn)
- `commands/crew/remove.js` — non-owner block on protected targets
- `commands/crew/add.js`, `commands/crew/accept.js`, `commands/owner/addto.js` — unban alongside protect
- `commands/admin/setwelcomestyle.js`, `setgoodbyestyle.js` — displayed defaults 56/36
- `utils/jidHelper.js` — buildComparableIds/normalizeJidWithLid (variant matching for bans/protection)
- Test scripts: `%TEMP%\opencode\test-ban.js` (17 asserts, real handleGroupUpdate + fake sock, surgical db cleanup for fake group `120363400000099999@g.us`), `test-imagetext.js` (6 asserts, sharp render 320-1600px), `test-picker.js`, `test-event.js`, `test-btn-dispatch.js`, `test-kickcfg.js`, `checkall.js` — all need `process.exit()`
- `HANDOFF.md` — this file; `AGENTS.md` — two-server/MCP gotchas
- Host: `database/kickBans.json` (created on first ban, gitignored), `database/audit.json` (now auto-creates correctly)

## Known Gotchas
- `_loadToCache` caches `{}` on missing/invalid file — any consumer assuming a shape (e.g. `entries`) must validate, don't trust cache presence
- `handleGroupUpdate` 'add' ban-enforcement: unban happens BEFORE `groupParticipantsUpdate(... 'add')` in command paths (kick.js readd btn, add.js owner path) — reversing that order races the group-participants event (author=bot, not owner) and the joiner gets kicked straight back out
- Author = undefined (invite-link join) → treated as non-owner → ban enforced (correct: unknown actor can't lift ban)
- `_botKicked` TTL 5s Set — enforcement adds variants then removes after 5s; bot's own command-path kicks rely on it to skip re-add loop
- `bannedKicked` Set is per-event-scope — welcome loop skips those JIDs; separate from `_botKicked`
- `database/crew.json` TRACKED — picker/ban tests must restore surgically or `git checkout -- database/crew.json`
- `database.js` in-memory cache — disk edits invisible until restart; ban functions update cache correctly (use the functions, not disk writes)
- `handleButtonResponse` fire-and-forget — settle 150-250ms in tests before asserting sends
- NEVER-COMMIT: `__pycache__/`, `app.json`, `check.js`, `check_disk.py`, `kami_session/`, `upload_*.py`
- TWO SERVERS: live `b0665152-…` via MCP/bhk_; panel `08b6894d`/ptlc_ dead — see AGENTS.md
- Deploy: push → gh workflow ~12s → sleep 90 → MCP `deployments_logs {id: 'b0665152-9b54-4ede-a11f-45c4a6641704', size: 50}` (size ≥25); log buffer tiny — verify from state files too

## Next Steps
1. Commit in 2 commits: (a) `fix(welcome): scale image text to background size + trim defaults` — utils/imageText.js, handler.js welcome/goodby sections, setwelcomestyle.js, setgoodbyestyle.js; (b) `feat(protection): kick-ban — only owner re-adds kicked members + audit cache fix` — database.js, kick.js, add.js, warn.js, crew/remove.js, crew/add.js, crew/accept.js, addto.js, handler.js ban-enforcement sections. (handler.js has both — if splitting is messy, one combined `feat(welcome+protection)` commit is fine)
2. Push to `main`; sleep 90; MCP `deployments_logs` on `b0665152-…` — confirm `state: running`, `KAMI BOT CONNECTED`, no new errors.
3. Tell user: image text now scales to background size (smaller groups get smaller text — no more overflow); `!kick` by owner now BANS the target (only owner can re-add — via native UI, `!add`, or the re-add button; anyone else's re-add gets them kicked straight back out with a group message + owner DM); owner-added members can only be removed by the owner (`!crew remove`, native UI); warn-kicks skip protected members.
4. Optional: wire `.kickcfg` shortcut into owner menu buttons.

## Memory Keys
mcp__claude-flow__memory_search { query: "kami kickban protection banMember unban isBanned author authorIsOwner ban-enforce imageText scale _readAudit cache entries", namespace: "project" }
