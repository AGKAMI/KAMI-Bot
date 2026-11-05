# Agent Handoff Protocol

This file is the **single source of truth** for every agent working in this project.
Read it before making any edits. Append to the **Agent Activity Log** after completing work.

## Project Context

| Item | Value |
|------|-------|
| Project | KAMI-Bot — WhatsApp crew management bot (KSSCPMS) |
| Location | `C:/Users/ojuni/Downloads/KAMI-Bot-main` |
| Tech stack | Node.js v24, Baileys (WhatsApp MD), Turso (@libsql/client), Express, GitHub |
| Panel API | `https://bot-hosting.net/api/v1` (deploy/sync/power via bearer key in `C:/Users/ojuni/AppData/Local/hermes/keys/KAMI_BOT_PANEL_API_KEY.txt`) |
| Bot number | 27683993925 (KAMI Bot Mini) |
| Owner number | AG KAMI |
| Prefix | `!` |
| Crew teams | SSRS (Metro Police), KSSPS, KSSMP, KSSMS |

## Current State

| Area | Status |
|------|--------|
| Apply system | Interactive button wizard (6 questions), bot auto-grades: 50%+ = auto-hired, <50% = reject with issues, ≥3 skipped = reject outright. No human tap required. Variant-aware JID lookup (PN ↔ LID) so button taps don't die. Hired DM uses configured team image file (not group profile pic). |
| Agent logging | `database/bot.log` NDJSON — command verdicts, errors, DB changes, JID resolution. Owner pulls via `.crew logs` (sends log as WhatsApp document). |
| Bot connection | Connected clean on startup, no errors. Memory ~135MB/256MB. |
| Apply button fix | Variant-aware session lookup in `getSessionOrExpired` — taps arriving from LID jid find PN-stored session (and vice versa). |
| Hired image fix | Reads `config.crewTeams[teamKey].image` file instead of `sock.profilePictureUrl(group)`. |
| Auto-approve threshold | 50%+ passes, <50% rejects, ≥3 skips rejects. Removed 50–69% "borderline → admins review" path. |
| Stale session on restart | `startWizard` tells user their old incomplete app was cleared, starts fresh, removes orphaned DB record. |

## Strict Edit Protocol (MANDATORY)

1. **Read** this file and the target file before editing
2. **Make** targeted edits — small diffs, one concern per patch
3. **Syntax-check** with `node --check <file>` before committing
4. **Commit** with descriptive message
5. **Push** to `origin main`
6. **Sync + restart** via panel API (`sync` then `power: start`)
7. **Log** your entry in the Activity Log below
8. Verify bot connects clean (no `ReferenceError`, no `Connection Failure` loops)

## Panel API commands (for agent deploy/sync/restart)

```bash
KEY=$(cat "C:/Users/ojuni/AppData/Local/hermes/keys/KAMI_BOT_PANEL_API_KEY.txt" | tr -d '[:space:]')
DEPLOY="b0665152-9b54-4ede-a11f-45c4a6641704"

# Sync latest commit from GitHub
curl -s -X POST -H "Authorization: Bearer $KEY" "https://bot-hosting.net/api/v1/deployments/$DEPLOY/sync"

# Restart the bot
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"action":"start"}' "https://bot-hosting.net/api/v1/deployments/$DEPLOY/power"

# Pull live logs
curl -s -X GET -H "Authorization: Bearer $KEY" "https://bot-hosting.net/api/v1/deployments/$DEPLOY/logs"
```

## Log diagnostics (agent-facing)

`database/bot.log` — structured NDJSON. Grep for:
```
grep CREW_CHECK_FALSE_POSITIVE_RISK database/bot.log   # false-positive "already in crew" matches
grep '"type":"error"' database/bot.log | tail -20       # recent errors with stack + context
grep '"type":"command"' database/bot.log | grep apply   # apply verdicts + durations
```

Each error entry has `inputJid`, `matchedVariant`, `storedOriginalJid`, `teamKey`, `teamGroupJid` — enough to diagnose why a number "not on WhatsApp" matches a crew entry (usually stale `@lid` variant collapsing to same `_storageKey` as `@s.whatsapp.net`).

## Agent Activity Log

### 2026-11-05 — Hermes Agent "Kermes" (nemotron-3.5-super-vl-120b-a12b)
**What:** Apply system overhaul: variant-aware session lookup, auto-approve at 50%+, correct team image in hired DM, stale-session feedback, agent-structured logging, `.crew logs` command
**Where:** `commands/crew/applyInteractive.js` (session lookup, thresholds, hired image, stale session message), `commands/crew/applyHelper.js` (crew-check false-positive diagnostics + JID resolution logging), `commands/crew/apply.js` (structured command/error logging, owner-invite path logging), `commands/crew/logs.js` (NEW — owner-only log pull command)
**Why:** KAMI reported: (1) apply answer buttons didn't work (taps silently died), (2) hired DM showed wrong team's group profile pic, (3) bot still required human admin approval for borderline apps, (4) no agent-visible logs — agents had to ask KAMI to trace issues
**Errors introduced:** 0 | **Errors fixed:** 4
**Gate:** `node --check commands/crew/apply.js` / `applyHelper.js` / `applyInteractive.js` / `logs.js` — all pass; panel sync + restart; bot connected as 27683993925 with zero errors
**Judge verdict:** PASS — zero runtime errors on restart, clean startup log
**Summarized explanation:** Fixed the apply flow end-to-end: button taps now work across PN/LID JID variants, the bot auto-hires at 50%+ with no human tap, the hired DM uses the correct configured team image, old incomplete sessions are cleared with feedback on restart, and every command/error/DB change is logged to `database/bot.log` with a `.crew logs` owner command to pull it.

## Format

```
### <date> — <agent-type> "<agent-name>" (<model-id>)
**What:** <change>
**Where:** <files>
**Why:** <reason>
**Errors introduced:** <N> | **Errors fixed:** <N>
**Gate:** <command> — pass / fail
**Judge verdict:** <PASS/FAIL> — <summary>
**Summarized explanation:** <2-3 sentence plain-language summary>
```

- **agent-type**: e.g. `Hermes Agent`, `OpenCode Agent`
- **agent-name**: e.g. `Kermes`
- **model-id**: full model identifier

## Red Lines

- Never commit `.env*`, tokens, or secrets (panel key stays in `AppData/Local/hermes/keys/`, never in repo)
- Never skip `node --check` before committing
- Never deploy without verifying bot connects clean (zero `ReferenceError`, zero `Connection Failure` loops)
- Never change the DM model pin — crons run model=null, inherit config.yaml

## Onboarding

New agents: read this file, run `node --check` on any file you plan to touch, check `database/bot.log` for recent errors, then start editing.
