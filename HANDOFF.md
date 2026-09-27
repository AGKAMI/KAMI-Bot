# HANDOFF

## Goal
"Full SA voice everywhere" for KAMI Bot — pan-SA mix (Joburg kasi + Cape Town kaaps + Durban) across **every** user-visible string, not just the slang slots. Three phases: (1) reaction system ✅, (2) position-aware `voice.*` library + migrate all `pick(SLANG.*)` ✅, (3) rewrite every hardcoded English literal — including crew/game question content — in full-strength kasi/kaaps register ✅ — all three phases committed through `002fff8`).

## Current State
- **Pushed**: `cea1d92` (reactions) → `cc823af` (voice library) → `36e48e0` (phase-2 + unblock + mojibake + STYLE.md) → `193be69` (closer cleanup, 35 files) → **`002fff8`** (LID/block + tts fixes). `git ls-remote origin main` == `002fff8`. Phase-2 + closer cleanup both committed — nothing outstanding.
- **Deployed `002fff8`**: SFTP-uploaded all 7 changed files (md5 verified) → panel restart `POST https://control.bot-hosting.net/api/client/servers/08b6894d/power {"signal":"restart"}` → HTTP 204, state `running`.
- **LID bug fixed (`002fff8`)**: `.block @user` threw `Unable to resolve LID for PN JID: <digits>@s.whatsapp.net` because mentions can arrive as **LID digits on the phone-number server** (e.g. `203341602779235@…` = your own `27683993925`). Fix: `candidateJids` / `mentionJid` / `updateBlockStatusSafe` in `utils/jidHelper.js` normalize to the real PN jid, then fall back across `@lid`/`@s.whatsapp.net` variants. Wired into `block.js`, `unblock.js`, `ban.js` (×2), `unban.js`, and the 5 silent auto-block sites in `handler.js` (DM-blocker ×3, anti-bot, anti-call). Success messages now print the real number, not LID digits.
- **TTS fixed (`002fff8`)**: `commands/general/tts.js` used `config` before its `require` (ReferenceError killed every run) and `axios.get()`-ed what is actually a **Buffer**. Both fixed; live test returns a valid 9 KB MP3.
- **Closer policy (KAMI's instruction)**: a tsotsitaal closer only where it *earns its place* — emotional beats yes, instructions/usage/hints/factual status lines no, never stacked on a line that already ends on a tag, never bolted onto every message. **`STYLE.md` says exactly this**.
- **Closer cleanup (committed as `193be69`)**: **69 `voice.tag(...)` closers removed across 34 files** — 30 pass 1 + 39 pass 2 + 2 `— sharp sharp` in `commands/general/start.js`. ❌ errors, celebrations and taunts keep their closers. Tools: `%TEMP%\opencode\classify-tags.js` → `strip-entries.json`, `classify-deep.js` → `strip-deep.json`, `apply-strip.js <entries.json> [--dry]`.
- **Verification green**: `checkall.js` → 230 files, 0 failed; `runtime-smoke.js` → **4/4**, 0 errors; `node --check` clean on all touched files; `voice.tag()` still returns values (`lekke`).
- **Phase-2 ledger**: `%TEMP%\opencode\patched-ids.txt` = **1806 string ids rewritten** (dump `all-strings.ndjson` 1743 strings; 176 remaining = 145 non-pool metadata/facts/logs + 31 deliberately-blunt wrong answers in `questionPools.js`).
- **`questionPools.js`**: 680 questions rewritten (30 blunt bad-answer options intentional); **0 option `id`s contain `:`** (callback token safety).

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
- **PowerShell `>` writes UTF-16LE** — never redirect node output to a file with `>` and then read it back as text (broke patch-file parsing this session); write from node (`fs.writeFileSync`) or use `Out-File -Encoding utf8`.
- **PowerShell `@"..."@` here-strings mangle JS** (backticks/`${}`) — write scripts with the file-writer tool, not shell heredocs.
- **`STYLE.md` is the style authority** — check it before touching message copy; KAMI's closer rule lives in *WHEN A CLOSER EARNS ITS PLACE*.

## Active Files
- `%TEMP%\opencode\dump-strings.js`, `apply-phase2.js`, `apply-rules.js` — the phase-2 pipeline.
- `%TEMP%\opencode\phase2-rules*.js`, `phase2-pool-rules*.js`, `pool-fix.js` — literal find/replace rules (extensible; longest-first, specific-before-catch-all).
- `%TEMP%\opencode\all-strings.ndjson`, `patched-ids.txt` — inventory + ledger (always re-dump first).
- `%TEMP%\opencode\classify-tags.js` / `classify-deep.js` / `apply-strip.js` — closer-cleanup pipeline (classify → JSON entries → apply `--dry` first).
- `STYLE.md` — style authority incl. the closer rule.
- `commands/crew/questionPools.js` — 680 questions rewritten; 30 blunt bad-answers intentionally untouched.
- `HANDOFF.md` — this file.

## Known Gotchas
- **`voice` must be destructured** from `../../utils/format` in any file calling it.
- **Banned** (`AVOID` in `slang-lex.js`): `mampara`, `naai`, `sharp` (closer), `gashu`, `voetsek`, `sybau`, `moer/bliksem/donner`, `doos`, `poes`, slurs, `goffel`, `moffie`, `bergie`.
- **Position rules**: `eish/yho/tjo/sho/hayi/hau` clause-initial; `mxm` never sentence-initial; `shame` = warmth only; `hey` = SAE softener; `ek sê` start-or-end; `mos` after adjectives/verbs.
- **Only apply one patch file per dump generation** — regenerate `all-strings.ndjson` after each apply.
- **Never commit**: `__pycache__/`, `app.json`, `check.js`, `check_disk.py`, `kami_session/`, `upload_code.py`, `upload_images.py`, `upload_sftp.py`.
- Concurrent committer (author `Kermes <kermes@oracle.local>`) → `git ls-remote origin main` before pushing.
- Deploy: push to `main` → restart from panel. **Panel API base = `https://control.bot-hosting.net/api/client/servers/08b6894d`** (key `ptlc_…`, header `Authorization: Bearer`, restart returns 204). Workflow mirror: `.github/workflows/deploy-bot-hosting.yml`.
- **Server `git pull` does NOT update** (post-restart `.git/refs/heads/main` was still `193be69`) → SFTP is the deploy of record: `fi9.bot-hosting.cloud:2022`, chroot **is** the bot dir (`REMOTE_BASE="/"`, never `/home/container`), md5-verify every file. `upload_sftp.py` has the working template.
- Panel says node `fi5` / sftp `fi5.bot-hosting.net` — stale metadata; **`fi9.bot-hosting.cloud` is the live host**.
- **Mentions can arrive as LID digits on `@s.whatsapp.net`** — any command passing a mention straight into `updateBlockStatus`/`sendMessage` can throw "Unable to resolve LID for PN JID". Use `updateBlockStatusSafe` / `mentionJid` from `utils/jidHelper.js`.
- **`APIs.textToSpeech` resolves to a Buffer**, not a URL — never `axios.get()` it blind.

## Next Steps
1. **Live WhatsApp test** (needs a real session — can't be done locally): `.block @AG KAMI ` → expect `✅ BLOCKED … @27683993925` (no LID error); `.tts howzit` → voice note; `.unblock me`; `.ban @user` / `.unban @user`.
2. If any LID error surfaces elsewhere: remaining raw `updateBlockStatus(` sites are constructed-PN with silent catch — `commands/owner/approve.js:44`, `commands/owner/dmblocker.js:94`, `commands/crew/applyHelper.js:84`, `commands/general/start.js:227/258`, `commands/general/order.js:362` — swap to `updateBlockStatusSafe` if they ever misfire.
3. Optional, low value: the last **31 pool** strings (blunt wrong answers) and **145 non-pool** leftovers (`description:` metadata, 8ball/twotruthsonelie facts, console logs) — most are intentionally literal.

## Memory Keys
mcp__claude-flow__memory_search { query: "KAMI-Bot phase 2 prose rewrite dump rules apply sharp ban option id colon", namespace: "project" }
