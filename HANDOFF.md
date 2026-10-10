# HANDOFF

## Goal
KAMI Bot auto-kick: customizable by the owner via button UI (`.kickcfg`) — inactivity window, grace, min messages, notice cooldown, per-group overrides, with edge-case guards. SHIPPED this session (commit after this HANDOFF); verify live boot + tell user how to use it.

## Current State
**Working / verified:**
- Yesterday's backdated kicks CONFIRMED by user ("it did kick them all those inactive for more than 14 days") — the two-server saga is closed.
- Deploy pipeline fully live: push → workflow → MCP `deployments_power` on `b0665152-…` (bhk_ key) → auto-pull. Zombie fixes (reconnect backoff, readyState===3 watchdog, 15s version-fetch timeout) running on live since `4913c16`.
- **New this session — `.kickcfg` (alias `.autokick`, ownerOnly, category admin):**
  - `utils/kickSettings.js` — hot-reloaded settings in `database/kickConfig.json` (gitignored): global + per-group overrides {enabled, inactiveWindow, gracePeriod, minMessages, noticeCooldown} + global-only maxKicksPerCycle; parse `25d/6w/1m/1y`; all-or-nothing validation; firstSeen store with 90d prune
  - `utils/autoProgression.js` — inactive scan + kick pass use effective per-group settings every pass; `minMessages` counts window msgs via new `database.getMessagesInWindow`; first-seen guard (kick-eligible only after firstSeen + window, seeded from earliest groupStats activity); mass-kill guard (≥10 due → kicks held until owner runs Preview, ack 12h); maxKicksPerCycle cap; notice/kick texts interpolate real values; `runKickPreview` (dry run, acks mass guard), `getKickStateSummary`, `purgeKickFlags`, `isCrewGroupJid` exports
  - `commands/admin/kickcfg.js` — dashboard + preset submenu buttons (nativeFlow via buttonHelper), scope toggle global↔this-group, Custom button → type `.kickcfg set window 25d`, Preview (DMs owner, fallback chat), Purge, Reset; every button double-gated `isOwner(sender)||fromMe` via lazy `require('../../handler')`
  - `database.js` — `getMessagesInWindow()` + `firstActive` added to `getMemberActivity`
  - Defaults unchanged from old behavior: 30d window · 14d grace · 1 msg · 7d cooldown · cap 10/cycle
  - Verified: node --check, checkall 236 files 0 failed, 23/23 unit asserts (`%TEMP%\opencode\test-kickcfg.js`), runtime-smoke errors 0

**Pending:**
- Live boot verify after the deploy push (MCP logs: KAMI BOT CONNECTED; engine `[AUTO-PROGRESSION] Engine started`)
- User hasn't seen `.kickcfg` yet — explain usage in final reply
- Oct 16 17:07+: notice cooldown expires — confirm no duplicate notices / new flags behave with the new engine

## What Was Tried That Failed
- Restarting the stale panel box `08b6894d`/ptlc_ key — dead June–Sep server; live = `b0665152-…` via MCP/bhk_ only
- Disk-editing `inactiveAlerts.json` while bot runs — invisible until restart (in-memory cache); kick failures KEEP flags, terminal states DELETE
- `bhk_` key against `control.bot-hosting.net/api/client` — 401; correct endpoint `bot-hosting.net/api/mcp`
- Recovering old console lines — panel log buffer ~16–100 lines, verify from state files instead
- Test expectations: `fmtDuration(14d)` = "2 weeks" (even division); kickSettings.update is all-or-nothing (mixed valid+invalid batch rejected entirely) — both by design

## Active Files
- `utils/kickSettings.js`, `utils/autoProgression.js`, `commands/admin/kickcfg.js`, `database.js` — this feature
- `commands/admin/antiflood.js`, `utils/buttonHelper.js`, `utils/commandLoader.js` — reference patterns (buttons, settings, lazy handler require)
- `HANDOFF.md`, `AGENTS.md` — docs; workflow `.github/workflows/deploy-bot-hosting.yml` — MCP restart (working)
- Host: `database/kickConfig.json` (created on live at first engine scan), `database/inactiveAlerts.json` (8 flags @17:07 grace Oct 23, groups cooldown to Oct 16)

## Known Gotchas
- TWO SERVERS + MCP/bhk_ vs ptlc_ + tiny log buffer + kick-pass flag semantics + boot-cache — see AGENTS.md gotchas
- Command files must require `handler.js` LAZILY inside functions (loader runs during handler init → partial module / cycle)
- `buttonHelper.js` has a module-level `setInterval` — scripts that require it need `process.exit()`
- `kickSettings.update` rejects the whole batch on any invalid key; `maxKicksPerCycle` is global-only
- Mass-kill guard: Preview grants 12h ack; cap still limits per-cycle removals
- firstSeen seeds new members at first roster sighting (hint: earliest groupStats activity) — members seen before this deploy get first≈their earliest activity or now

## Next Steps
1. After push: MCP `deployments_logs` — confirm boot + engine start, no [KICKCFG]/[INACTIVE-CHECK] errors on the 5-min first scan.
2. Tell user: `.kickcfg` opens the panel (owner only, works in DM or any crew group); `.kickcfg preview` dry-runs; group scope via the 👥 button or `.kickcfg set g grace 7d`.
3. Oct 16+: watch first post-cooldown scan — flags/notices should follow the new settings (defaults = old behavior).
4. Optional: wire `.kickcfg` shortcut into the owner menu buttons (`commands/general/owner.js`).

## Memory Keys
mcp__claude-flow__memory_search { query: "kami kickcfg auto-kick settings buttons firstSeen mass guard", namespace: "project" }
