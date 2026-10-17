# HANDOFF — KAMI Bot

> Rewritten 2026-10-17 after the full-codebase audit + fix batch. Supersedes the kick-policy handoff (that work shipped and is closed).

## Goal
Keep KAMI Bot (WhatsApp, Baileys, 256MB box) healthy and shipped autonomously: commit → push → MCP restart → verify. Current phase: full audit completed and the critical/high defect batch is deployed.

## Current State
- **Shipped this checkpoint** (deployed + verified CONNECTED):
  - `7cb37ed` memory guard: non-reclaimable cgroup memory (anon+kernel+slab) at 215MB×2, last-ditch 254MB current, exit(1) so restart policies relaunch (exit(0) left the bot down once), global sharp/libvips caps at boot, store bounded at 40 chats.
  - **audit batch** (this session, see below): ~40 files of bug/dead-code/consistency/memory fixes.
- Tests: **76/79** — the 3 fails are the known pre-existing `tests/eventWizard.test.js` reds (:146/:257/:328 — Baileys v7 sendButtons + date-sensitive).
- Live prefix `!`. Live crew.json: teamMap KSSPS→`120363409819775730@g.us`, KSSMP→`120363421626159074@g.us` (fixed earlier this session).

### Audit fix batch — what changed (by area)
- **handler.js**: team-admin DM gate regex `'^\\'`→`'^'` (gate matched nothing, blocked team admins from ALL DM commands incl. accept/deny); isOwner canonicalizes like buttonHelper (config stores `083…`, jids are `2783…`); slowmode warning throttled to once/cooldown; antiflood DM only to resolved PN jids (no fake PN from LID digits); auto-react gate reads `utils/autoReact` (was dead: broken persistence + config flag never updated) and uses `config.prefix` not hardcoded `['.','/','#']`; welcome/goodbye axios get timeout 8s + 5MB cap; anti-call listener WeakSet-guarded (no stacking on re-`open`); 5-min sweep also clears jidHelper's cache; `classifyReply` strips `*`/`_`/`~` so `*❌ ERROR*` replies classify as fail.
- **index.js**: yt-dlp chmod moved below `fs`/`path` requires (was TDZ ReferenceError, never executed); ENOSPC handlers call real exports (`cleanupTempFiles`/`nukeCacheDirs` — old `cleanupOldFiles` was undefined → TypeError inside uncaughtException = fatal); `_flushAndExit` now flushes groupstats too.
- **database.js**: atomic writes (tmp+rename) everywhere; corrupt-read guard stashes `.corrupt-<ts>.bak` before falling back to `{}`; flush loop keeps path dirty on write failure; `removeApplicant` resolves by UID when first arg isn't a jid (accept.js race guard + applyInteractive orphan cleanup were passing team abbreviations → phantom crew groups, applicant never removed); `removeTeamAdminTeam` persists (old `?.length < before` after delete never fired); isTeamAdmin/addTeamAdmin/removeTeamAdmin/pruneTeamAdmins canonical-number compare; `hasPendingApplicationsForAnyTeam` checks raw+canonical keys; `getTeam` no longer writes phantom groups on miss.
- **utils**: jidHelper negative LID-cache TTL 5min + unmapped LID returns original jid (was fabricating fake PN) + PN inputs skip wrong-direction reverse-file lookup; groupstats atomic save, failed flush merges deltas back, `flushPending` exported; webp2mp4 ffmpeg falls back to system `ffmpeg` (was literal `"undefined"` in command); autoProgression flag/notice loops wrapped per-group try/catch (one failed group no longer aborts the scan); autoReact rewritten to persist `database/autoReact.json` (old code called non-existent DB API); commandLoader warns on name/alias collisions.
- **Commands**: mathquiz division answer was multiplication (broken); song.js double-decrement corrupted download counter; igs/igsc downloads capped 16MB (was Infinity — OOM on 256MB box); sticker/crop reject oversized media from metadata BEFORE download; memesearch fetches meme-api JSON then the image (old code sent raw JSON as an image — never worked); tictactoe no longer fail-reacts on start, rematch button authed to last game's players; poll results dangling "in"; help.js mojibake `âŒ`; adminHub `config.socials`→`config.social`; roster teamMap compare (object vs string) + lists members for teamMap-only groups; crew.js routes `.crew setroles`/`.crew viewroles` as documented; apply.js crew:accept owner check uses isOwnerJid; disk.js `git gc` non-aggressive; translate lang param URL-encoded + timeouts; setbotpp/setbotname dropped aliases `setpp`/`setname` (shadowed admin commands); status/groupstats/calc/memesearch dropped colliding aliases (`.stats`→crew stats, `.math`→mathquiz, `.sm`→slowmode, `.memes`→meme.js); **deleted dead files** `commands/general/translate.js` + `commands/games/polls.js` (fully shadowed duplicates); prior uncommitted improvements kept (report.js `config.contactNumber`, order.js fail-soft catalog).
- **Restored commands owners/admins thought were broken**: `.setpp` (group pp), `.setname` (group rename), `.stats` (crew stats), `.math` (quiz), `.sm` (slowmode), `.memes` (simple meme).

## What Was Tried That Failed
- (this session) Nothing — all fixes verified by syntax check, 76/79 tests, boot smoke test (460 commands load, autoReact persist round-trip, jidHelper/groupstats exports).

## Active Files
- `HANDOFF.md` — this file.
- Everything in the audit batch above — read the git log for the exact commit(s).

## Known Gotchas
- **TWO SERVERS**: live = `b0665152-9b54-4ede-a11f-45c4a6641704` / SFTP `u9mg7ylz`; panel `08b6894d` is DEAD.
- **MCP restart**: `POST https://bot-hosting.net/api/mcp` Bearer `bhk_b77e82b54bfb19ebe8be6391d3833e514af2614e1478d0e8`, JSON-RPC `tools/call`, param `id`, actions start|stop|restart|kill, waitSeconds ≤ 45; "A sync is already running" → wait ~52s retry. `bhk_` keys do NOT work on control.bot-hosting.net.
- Panel console buffer ~16-100 lines — verify from state files / `git log` on box, not logs.
- Tests: `node --test --test-force-exit tests\*.test.js`; snapshot `database/crew.json` before/after (tests dirty it); known 3 eventWizard reds — do NOT "fix" silently.
- Live-data edits: MCP `stop` (bot flushes DB on stop) → `files_edit` → validate → `start` (auto-pull). Never deploy local `database/*`.
- `database/` untracked; never-commit list: `__pycache__/`, `app.json`, `check.js`, `check_disk.py`, `upload_*.py` — stage explicit paths only.
- Memory telemetry: `[MEM] non-reclaim XMB | current YMB/256MB | rss | heap | ext` every 30min. Guard trips on non-reclaim ≥215MB ×2 OR current ≥254MB ×2 → exit(1).
- Prefix: live `!`; idioms `config.prefix || '.'`; NEVER `extra.prefix`.
- PowerShell 5.1: no `&&`; push stderr shows as NativeCommandError but succeeds.

## Next Steps
1. (optional, not urgent) Remaining MEDIUM/LOW audit items not yet fixed: game session Maps without TTL (tictactoe/hangman/wordchain etc.), `isBotAdmin` ignoring cached metadata (rate-limit contributor), LID-keyed activity stats vs roster keys (wrongful-kick risk when minMessages>1), NSFW flag `config.groups[].nsfw` still unread, `.loli` command name reputation risk, `utils/helpers.js`+`confirm.js`+`channelInfo.js`+`utils/tictactoe.js` dead files, pies.js still hits a non-existent API, duplicate `igs.js`/`igsc.js` fork (make igsc a wrapper), crew stats thresholds inconsistent with autoProgression requirements, gracePeriod:0 notice path dead, owner-hub button id overlap debt (29 warnings, longest-match works).
2. Feature ideas if KAMI asks: persist reminders, LRU nameCache, per-group NSFW toggle wiring, loader collision test in CI.

## Memory Keys
- mcp__claude-flow__memory_search { query: "KAMI audit fixes memory guard owner canonical lid", namespace: "project" }
