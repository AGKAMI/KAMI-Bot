# HANDOFF

## Goal
"Full SA voice everywhere" for KAMI Bot — pan-SA mix (Joburg kasi + Cape Town kaaps + Durban) across **every** user-visible string, not just the slang slots. Three phases: (1) reaction system ✅, (2) position-aware `voice.*` library + migrate all `pick(SLANG.*)` ✅, (3) rewrite every hardcoded English literal — including crew/game question content — in full-strength kasi/kaaps register (in progress, this session).

## Current State
- **Pushed**: `cea1d92` (progressive ✅/❌ reactions, 159 files) → `cc823af` (voice library + 535 SLANG call sites, 180 files). `git ls-remote origin main` == `cc823af`, no concurrent push since.
- **NOT committed**: phase-2 hard-coded-prose rewrite — **194 modified files** in the working tree.
- **Phase-2 ledger**: `%TEMP%\opencode\patched-ids.txt` = **1806 string ids rewritten** (dump `all-strings.ndjson` currently holds 1743 strings; 176 remaining = 145 non-pool metadata/facts/logs + 31 deliberately-blunt wrong answers in `questionPools.js`).
- **`questionPools.js`**: 929 dumped strings → all rewritten except 30 blunt "bad answer" options (intentional). Reads as kasi speech: `How you handle conflict in a team?`, `You ever been a convoy leader?`, `What you do, hey?`, contractions, `— ` → `, `, `hey/shame/lekke/boet` sprinkled. 680 questions load; **0 option `id`s contain `:`** (callback token safety).
- **Verification green**: `checkall.js` → 230 files, 0 failed; `runtime-smoke.js` → **4/4 ×8 runs**, 0 errors; `render-voice.js` OK.

### Phase-2 tooling (all in `%TEMP%\opencode\`)
- `dump-strings.js` — NDJSON `{id,file,line,raw,q}`; `--min/--grep/--file/--out`. Delimiter-gated quote scan, whole-file template scan, `CODE`/`NOISE`/`SKIP_FILES` filters.
- `apply-phase2.js` — accepts `{id,new}` (resolves `old`+`q` from dump) or `{file,old,new}`; `esc()` delimiter escaping, `matchStyle()` newline convention, trailing-backslash guard, length-desc sort, `(file,old)` dedupe, appends ids to `patched-ids.txt`.
- `apply-rules.js` — rules file → patches; `--rules/--out/--file/--dry`; tries each find in both real-newline and literal-`\n` spelling.
- Rule files: `phase2-rules{,2,3,4,5}.js` (non-pool, 175/153/113/105/37 rules) and `phase2-pool-rules{,2,3,4}.js` + `pool-fix.js` (pool).
- Verify: `checkall.js`, `runtime-smoke.js`, `render-voice.js`, `ngrams.js`, `dupcheck.js`, `peek.js`.

## What Was Tried That Failed
- **Rules with `\n` silently never matched** — source spells newlines as two chars `\` `n` inside templates. Fix: `apply-rules.js` tries `{f,r}` and the literal-`\\n` spelling of both.
- **Stale dump = `NOT FOUND` spam** — patches computed against an old `all-strings.ndjson` no longer match the source. **Re-dump after every apply** before running the next rules round; apply one patch file per dump generation.
- **Apostrophe in a single-quoted literal** broke `node --check` (config.js:131) → reverted 9 files, re-applied with `esc()`.
- **Real newline introduced into a one-line template** (handler.js:629) → `matchStyle()` keeps the source's `\n` convention.
- **` will be ` → `'ll be ` produced `I 'll`** → replaced with subject-specific forms.
- **`sharp` used as a closer 75× in questionPools** — project ban (`AVOID`). Fixed: `, sharp` → `, hey` (52 unique replacements). Never reintroduce.
- **Rewrites that drop a literal below 5 words vanish from the dump** (e.g. `Maybe — depends on the day` → 4 words). They still get patched, they just leave the inventory — the count drops (929 → 879 → …) and is not a bug.
- **Option `id` is embedded in `cwiz:a:${team}:${uid}:${q.num}:${o.id}` and split on `:`** — never introduce a colon into an option id (verified 0 today). `q.label` = category (`SCENARIO`), option display text = `o.label`.
- **Smoke test looked "flaky" (3/4)** — the `SA` regex was missing valid picks (`Aweh`, `Ai`, `Jissie`, `Howzit`). Regex extended; now stable 4/4.
- Inline `node -e "..."` breaks under PowerShell quoting → write scripts to `%TEMP%\opencode\`. `loadCommands()` hangs → always `process.exit()`.

## Active Files
- `%TEMP%\opencode\dump-strings.js`, `apply-phase2.js`, `apply-rules.js` — the phase-2 pipeline.
- `%TEMP%\opencode\phase2-rules*.js`, `phase2-pool-rules*.js`, `pool-fix.js` — literal find/replace rules (extensible; longest-first, specific-before-catch-all).
- `%TEMP%\opencode\all-strings.ndjson`, `patched-ids.txt` — inventory + ledger (always re-dump first).
- `commands/crew/questionPools.js` — 680 questions rewritten; 30 blunt bad-answers intentionally untouched.
- `HANDOFF.md` — this file.

## Known Gotchas
- **`voice` must be destructured** from `../../utils/format` in any file calling it.
- **Banned** (`AVOID` in `slang-lex.js`): `mampara`, `naai`, `sharp` (closer), `gashu`, `voetsek`, `sybau`, `moer/bliksem/donner`, `doos`, `poes`, slurs, `goffel`, `moffie`, `bergie`.
- **Position rules**: `eish/yho/tjo/sho/hayi/hau` clause-initial; `mxm` never sentence-initial; `shame` = warmth only; `hey` = SAE softener; `ek sê` start-or-end; `mos` after adjectives/verbs.
- **Only apply one patch file per dump generation** — regenerate `all-strings.ndjson` after each apply.
- **Never commit**: `__pycache__/`, `app.json`, `check.js`, `check_disk.py`, `kami_session/`, `upload_code.py`, `upload_images.py`, `upload_sftp.py`.
- Concurrent committer (author `Kermes <kermes@oracle.local>`) → `git ls-remote origin main` before pushing.
- Deploy: push to `main` → restart from bot-hosting panel (GitHub auto-pull). SFTP fallback `fi9.bot-hosting.cloud:2022`.

## Next Steps
1. Optionally close the last **31 pool** strings (blunt wrong answers) and the **145 non-pool** leftovers (`description:` metadata, twotruthsonelie/8ball facts, console/system strings) — decide deliberately, most are intentionally literal.
2. Spot-check real output on WhatsApp: crew application questions, `.menu`, a ✅ confirmation, a ❌ failure.
3. Commit on request: `feat: south african voice everywhere — 1806 hardcoded strings rewritten incl. crew question pools` (stage the 194 modified files only; never the junk untracked set).
4. Deploy: `git push origin main` → restart from panel.

## Memory Keys
mcp__claude-flow__memory_search { query: "KAMI-Bot phase 2 prose rewrite dump rules apply sharp ban option id colon", namespace: "project" }
