# HANDOFF

## Goal
"Full SA voice everywhere" for KAMI Bot — research South African slang/tsotsitaal, build a position-aware phrase library, and migrate every `pick(SLANG.*)` call site so bot output reads like natural South African speech (pan-SA mix: Joburg kasi + Cape Town kaaps + Durban), while links, numbers and @mentions stay byte-exact.

## Current State
- **Applied and locally verified. NOT committed, NOT pushed.** Remote is still `cea1d92`; working tree has 181 modified files + 2 new files (`utils/slang.js`, `utils/slang-lex.js`).
- **Migration result: 535 `pick(SLANG.*)` sites → 533 edited lines → 180 files. 0 sites left.** Classification: `raw` 468 (no punctuation injected), `tag` 67 (comma inserted).
- Emitted call mix: `voice.openErr` 221 · `voice.tag` 149 · `voice.lead` 128 · `voice.react` 13 · `voice.say` 10 · `voice.greetOpen` 7 · `voice.open` 5 · `voice.mate` 2.
- **`utils/slang-lex.js`** (new, untracked) — researched lexicon: `LEX` (~70 entries with `{w, pos, reg, mean, ex}`), `AVOID` (17 banned items with reasons), `byPos()`, `byReg()`.
- **`utils/slang.js`** (new, untracked) — banks `OPEN_ERR/OPEN_INFO/OPEN_WARN/OPEN_GREET`, `TAG_AFFIRM/NEUTRAL/ERR/HYPE/SOFTEN`, `LEAD_AFFIRM/NEUTRAL/HYPE`, `REACT_OK/FAIL/DUNNO`, `ADDR`/`ADDR_SAFE`, `SAY` (17 speech acts), plus `voice.{openErr,open,openWarn,greetOpen,tag,lead,react,addr,mate,say,line,hi,bye,ok,bad,wait,hype,act}` and the legacy `SLANG` dict (kept for compat — now zero consumers).
- **`utils/format.js`** — inline SLANG dict removed; now `const { voice, SLANG, pick } = require('./slang')`; `status` defaults SA-ised; `templates.welcome/goodbye/errorMsg/permDenied/groupOnly/adminOnly` rewritten; exports `voice`.
- **`commands/games/tictactoe.js:70`** hand-fixed: tag moved out of the middle of the clause (`🎉 @user wins with ⭕! ${voice.tag('affirm')}`).

### Verification (all green)
- `node --check` on every `.js` in the repo → `ALL SYNTAX OK`.
- `%TEMP%\opencode\check-voice-import.js` → 181 files declare `voice`, 0 missing.
- `%TEMP%\opencode\eval-voice.js` → 15 unique `voice.*` call shapes × 200 iterations → `ALL EVAL OK`.
- `%TEMP%\opencode\runtime-smoke.js` → actually **executes** `ping`, `antiflood` (usage), `calc` (usage), `dice` (bad input) with stub sock/extra → no `ReferenceError`, SA text in the output.
- `%TEMP%\opencode\render-voice.js` → welcome/goodbye/errorMsg/permDenied/groupOnly/adminOnly/status + all 17 legacy `SLANG` keys render.
- Repo-wide artifact scan (`double-comma`, `comma-dot`, `comma-bang`) → 22 hits, all false positives (spread operators `...x`).
- `grep SLANG\.` across the repo → **0 hits**; the 194 remaining bare `SLANG` references are all import/export statements.

## What Was Tried That Failed
- **Comma insertion produced `joined! , tag` / `on , tag`.** Cause: the edit started at `${` without swallowing the whitespace (or a stray `.!?`) already before it. Fix: walk `start` back over `\s` and one `.!?`, then prepend `', '`.
- **`actOf` classified `✅ SUCCESS\n\nAntilink is already on` as `err`** because soft word `already`/`No ` was tested before the ✅ marker. Fix: tiered `actOf` — hard err (`❌|ERROR|couldn't|failed`) → state (`already` → neutral) → hard ok (`✅|SUCCESS|turned ON|activated`) → soft err → soft ok. Also added `\b` boundaries so `undone` no longer matched `done`, `unlocked` no longer matched `locked`.
- **Footer/sign-off sites (`_${pick(SLANG.vibe)}_` alone on their own line) got `voice.react('dunno')`** ("Bathong, where did that come from") under `✅ SUCCESS` banners — the banner lives 3 lines above. Fix: step 1 now reads `lines[i-4..i]` as context; `mixed` (both ❌ and ✅ in context) forces neutral, ok → `voice.react('ok')`, err → `voice.react('fail')`, else → `voice.lead('neutral')` (preserves the original `_Sho_` shape).
- **String-concat operands had no separator**: `'_Hired..._' + pick(SLANG.vibe)` → `'_Hired..._Sho'`. Fix: when `sp` ends with `+` but `st` does *not* start with `+`, emit `' ' + voice.tag(...)` (valid both inside and outside a template literal). Two sites: `crew/accept.js:283`, `crew/deny.js:135`.
- **CRITICAL near-miss: the codemod inserted `voice.*()` into 180 files that only imported `{ bold, pick, SLANG }` from `utils/format`.** `node --check` cannot catch it — it would have been `ReferenceError: voice is not defined` on every single command. Fixed with `%TEMP%\opencode\patch-voice-import.js` (adds `voice` to each file's existing `utils/format` destructure). **Never add a `voice.*` call without confirming the import.**
- **Inline `node -e "..."` one-liners keep breaking** under PowerShell (quote/`$`/regex mangling). Every check now lives in `%TEMP%\opencode\*.js`.
- `loadCommands()` still hangs past 120s → always `process.exit()`.

## Active Files
- `utils/slang.js`, `utils/slang-lex.js` — the new library (untracked, must be added to any commit).
- `utils/format.js` — re-exports `voice`, owns the SA-ised `status` + `templates`.
- `commands/**` (180 files) + `handler.js` + `utils/autoProgression.js` — migrated call sites + `voice` import.
- `%TEMP%\opencode\migrate-slang.js` — the codemod (`[repo] [--apply] [--report <file>]`); classification steps 1-9; re-runnable but now idempotent-zero (0 remaining sites).
- `%TEMP%\opencode\patch-voice-import.js`, `check-voice-import.js`, `check-report.js`, `show.js`, `show2.js`, `eval-voice.js`, `runtime-smoke.js`, `render-voice.js`, `load-test.js`, `migrate-report.txt` — the verification suite. Re-run them after any further string edits.

## Known Gotchas
- **`voice` must be destructured** from `../../utils/format` (or `./utils/format` / `../utils/format`) in any file that calls it — 180 files were patched by hand script, not by the codemod.
- **Position rules are corpus-derived, not decoration**: `eish/yho/tjo/sho/hayi/hau` are clause-initial only; `mxm` never sentence-initial; `shame` = warmth/solidarity (never sarcasm); `hey` = the SAE softener/agreement tag; `ek sê` start-or-end; `mos` after adjectives = really / after verbs = only.
- **Banned**: `mampara`, `naai`, `sharp` (as closer), `gashu`, plus `voetsek`, `sybau`, `moer/bliksem/donner`, `doos`, `poes`, slurs, `goffel`, `moffie`, `bergie` — see `AVOID` in `slang-lex.js`.
- **CRLF + regex `^`** — never trust `(\s+)` after a `^` anchor here; `LF will be replaced by CRLF` warnings are expected and harmless.
- **Concurrent committer**: another session (author `Kermes <kermes@oracle.local>`) pushes the same repo — always `git ls-remote origin main` before pushing.
- **Never commit**: `__pycache__/`, `app.json`, `check.js`, `check_disk.py`, `kami_session/`, `upload_code.py`, `upload_images.py`, `upload_sftp.py`.
- The codemod only touched **slang dictionary slots**. Menus, help text, button labels and most confirmation strings are still plain English.

## Next Steps
1. Review `%TEMP%\opencode\migrate-report.txt` one last time if desired (533 OLD/NEW triples), then commit on request: `feat: south african voice — position-aware slang library + migrate 535 SLANG call sites` (stage `utils/slang.js`, `utils/slang-lex.js` explicitly).
2. Smoke-test on WhatsApp (no test suite): `.ping`, `.dice 1` (failure), `.antiflood set` (usage), `.calc` (usage), a media download, and a `✅ SUCCESS` confirmation — confirm each reads naturally and nothing throws.
3. **Phase 2 decision**: "full SA voice" also means the hardcoded English in `menu.js` / `help.js` / button labels / generic confirmations. That is a separate, larger pass — ask before starting.
4. Deploy when ready: `git push origin main` → restart from the bot-hosting panel (GitHub auto-pull).

## Memory Keys
mcp__claude-flow__memory_search { query: "KAMI-Bot slang voice SA migrate codemod voice import position tag lead openErr", namespace: "project" }
