# HANDOFF

## Goal
Keep KAMI Bot shipping autonomously. Completed arcs: CPM `!event` wizard lifecycle (build → post → RSVP → **auto-unpin**), `!tt` repairs, **full SAST time sweep** (`011a519`), and **universal-prefix sweep** (`a52b9fd` — every user-visible command example/usage renders the live prefix instead of a hardcoded `.`).

## Current State
- Bot CONNECTED on 27833882383 (prefix `!`) — `a52b9fd` auto-pulled at restart, `KAMI BOT CONNECTED` + state `running` + `files_read` verified `commands/general/help.js` contains the new `usageText` renderer on the server
- HEAD = `a52b9fd` (fix(prefix): render live prefix…); **61/61 tests green** (`node --test --test-force-exit tests/*.test.js`)
- SAST sweep `011a519` fully deployed/verified earlier; eventWizard.js = 493 lines (500 cap)
- Concurrent session activity absorbed through `5565c8d` (tt backoff / TT_PROXY_URL)

## What Shipped
### `a52b9fd` — universal prefix in all examples/usage (26 files, +59/−42)
1. **`commands/general/help.js` (sole renderer of `cmd.usage`)** — old code `.replace(/^\./, prefix)` replaced only the FIRST dot, so multi-example usages (`'.afk [reason] | .afk list'`, `'.crew … | .crew …'`, giveaway's `\n.giveaway reroll`) rendered mixed `!`/`.`. New: `rawUsage.replace(/(^|[\s|(])\./g, (m, p) => p + prefix)` (function replacement = `$`-safe if prefix ever contains `$`), then bare usages get prefixed (`'dare'` → `!dare`; `'<text>'` → `!attp <text>`)
2. **25 command files' inline replies** switched to `${config.prefix || '.'}` / in-scope `${prefix}`: antilink(53,77) demote(62-63) welcome(28) goodbye(28) kickcfg(312, template literal now) setgrouppp(50) newsletter(81,87) unblock(53) facebook(149) tiktok(422) igs(456) igsc(456) gptimage(29,31,41) attp(22) ssweb(19) pies(46) 1917(24) translate(47,48,51) polls 8ball ludohelper(13,17,24,43) groupguess(14,21,23) numberguess(14,21,23) wordchain(14,26,28) — 12 of them gained a `const config = require('../../config');`
3. **`extra.prefix` removed as a concept** — it was NEVER in `commandExtra`; gptimage/attp always rendered `.`. Now both read `config.prefix`. attp also had an operator-precedence bug: `extra.prefix || '.' + 'attp …'` (would have printed just `!` if prefix ever existed)
4. **`disapprove.js` description** reworded (help renders descriptions raw; it was the only dot-bearing description)
- Verified: `node --check` 26/26, module-load smoke 26/26, renderer unit-sanity via `node -e`, re-audit greps clean, 61/61 tests, MCP restart ok → `files_read` on box

### `011a519` — full SAST sweep (32 files, +339/−97)
- **NEW `utils/sast.js`** — TZ-independent epoch math (`parts`, `todayISO`, `clock`, `epochOf(iso,hhmm)`, `minutesUntil`, `dateLabel`, `isoDaysAgo`/`isoMonthsAgo` clamped) + Intl display (`fmtDate`/`fmtTime`/`fmtDateTime` force `Africa/Johannesburg`, manual +2h fallback). Route ALL new time code through here
- Event epoch math rewired (`draftToRecord` → `epochOf`; `resolveYearForMonth` → `parts().year`); ~24 display sites → fmt helpers; `utils/groupstats.js` SAST keys + `leaderboard.js` cutoffs (paired unit); `index.js` `process.env.TZ = 'Africa/Johannesburg'` backstop (honored on box, ignored on Windows dev)

### Earlier arcs
`6b73efb` wizard DATE step · `4833795` Baileys v7 pin shape + labels/mentions/tt · `ae1ec3b` wizard corrections · `95af7ab` unpin sweep

## Gotchas Hit
- **`cmd.usage` has exactly ONE consumer** — `help.js:64`. `menu`/`list` render `${prefix}${name}` themselves. Changing the renderer fixes ALL ~100 `usage:` metadata fields at once
- **`extra`/`ctx` NEVER carries `prefix`** — `commandExtra` (handler.js:1630) doesn't define it, and ~15 alternate `execute()` call sites build their own extra (handler button shortcuts ~984-1400, `againDispatch.buildExtra`, ownerHub `swallowExtra`, `memberPicker`, `adminHub`, apply.js internals, crew.js patchedExtra). **For prefix in replies use `config.prefix || '.'`** — config is live-mutated by `!setprefix` so it's always current
- **Grep blind spots when auditing literal dots**: (a) lookbehind `(?<![\w$])` misses `\n.cmd` (the escape's `n` is a word char) — separately search `\\[nrt]\.`; (b) line-level noise filters like `\.join(` eat REAL hits (pies.js:46 vanished that way) — filter by match token, not line content; (c) filtering lines containing `usage:` hides inline replies that quote the word "usage:"; (d) `name:` extraction must be anchored `^\s*name:` — unanchored matches `filename:` and poisons the alternation with JS methods
- **`config.js:108 invalidCommand` is DEAD** (never referenced anywhere) — unknown commands just get a ❌ reaction (`handler.js:1475-1478`); left untouched
- **Out-of-scope leftovers (intentional)**: `newsletter.js:84` input-side strip regex `^\.(newsletter|nl|…)` still only matches a dot (args fallback covers `!` for input); `autoProgression.js:425` `.kickcfg` in a server console log; comments/JSDoc `Usage: .crew …` lines; `database.js`/`disk.js` property access and `.git` paths
- **Container clock = UTC**, SA is fixed **UTC+2 no DST** — time code goes through `utils/sast.js`; `toISOString()` bypasses TZ
- bot-hosting MCP `deployments_power` takes `action` (NOT `signal`), param `id` (NOT `deployment_id`); restart can return `ok:false "A sync is already running"` → wait ~45s; `files_get` doesn't exist — it's `files_read`
- `node --test tests/` (directory) fails on Windows/Node 24 — glob `tests*.test.js`; kill stray node procs first; redirect output to file (pipe stalls)
- `database/crew.json` NO LONGER tracked — tests self-restore
- PowerShell: build MCP bodies as hashtables → `ConvertTo-Json -Depth 6 -Compress` → ASCII `WriteAllText` → `curl.exe --data "@file"`

## Kill List (do NOT resurrect)
Crew dashboard, 14 admin mega-panels, WYR A/B buttons, launcher list views, setter panels, NSFW buttons, per-command Again handlers, positional RSVP buttons, silent first-event fallback.

## Active Files
- **`commands/general/help.js`** — usage/description renderer (the one place usage metadata is shown)
- **`utils/sast.js` + `index.js:21` (TZ) + `utils/groupstats.js`/`leaderboard.js` (paired keys)** — time truth
- `commands/crew/eventWizard.js` (493 lines, extract before adding) / `eventRsvp.js` / `eventRender.js` / `cpmData.js`
- `commands/media/tiktok.js` — provider chain + placeholder guards
- The 26 files touched by `a52b9fd` (see What Shipped) — any NEW reply containing a command example must use `config.prefix || '.'`, never a literal `.`

## Next Steps
- User smoke-test in a real group: `!help 8ball` (usage shows `!8ball …`), `!help crew` (multi-example all `!`), `!help attp` (bare usage → `!attp <text>`), `!pies` no-arg, `!ludo`, `!welcome` status card, `!translate` no-arg — all examples should print `!`
- Change prefix (`!setprefix #`) then re-check one of the above — examples must follow
- Prior arcs' smoke tests still open: `!event` wizard → pin → auto-unpin at SA wall time; `!tt <url>` delivers real video; time displays between 00:00–02:00 SAST show SA dates
- Legacy events (pre-`011a519`) have no `pinnedMsgId`/`eventDate` — will NOT auto-unpin

## Memory Keys
mcp__claude-flow__memory_search { query: "universal prefix help usage renderer config.prefix extra.prefix absent alternate execute paths SAST sweep utils/sast event wizard pin unpin tt tiktok", namespace: "project" }
