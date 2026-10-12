# HANDOFF

## Goal
Hybrid button-ification of ALL command categories — minimize typing, maximize buttons. Batches shipped (`34cfd69`, `3291267`), then admin gating (`3250ef8`), button audit (`bdef088`), and finally the **member picker** (`7b1da4a`): admin target commands now open a tap-a-member list instead of demanding a tag/reply.

## Current State
- Bot CONNECTED on 27833882383 (prefix `!`) — `a20a784` auto-pulled, deploy verified via MCP logs + live server-side run
- HEAD = `a20a784`; 35/35 tests green (`node --test-force-exit --test tests/*.test.js`); syntax-clean on all touched files
- Live-verified on the box: `_internals.methodEmbed(...)` returned the v45 CDN URL and downloaded 3,308,379 bytes, valid MP4, `isPlaceholder=false` (md5 `8a94b0a4b04f9b3204007d8ec21dbf7f`)
- Prior arcs healthy (picker `7b1da4a`, header-drop `28b31f6`, anticall `5be7dc7`, tt headers `9b71cb1`)
- **Soak still SKIPPED** — watch for button-tap storms, again: replay loops on external APIs (2s/chat cooldown mitigates), ownerHub config.js string-replace races

## What Shipped
1. **Button infra** (`34cfd69`): longest-prefix dispatch + overlap warnings; `requireOwner`/`isOwnerJid`/`requireAdmin` shared gates; generic `again:` replay dispatcher (ALLOW + gates + 2s cooldown); `.unref()` intervals; group-guard sweep; F6 live-prefix in menus; NSFW anime typed-only permanently (judge unanimity)
2. **Hubs** (`34cfd69`): `commands/owner/ownerHub.js` (`.ohub`, anticall/mode/autoreact/dmblocker, freshConfig per render); `commands/admin/adminHub.js` (`.ahub`, 4 pages ≤10 buttons incl nav — was 3 pages busting the slice(0,10) cap and dropping Back); crew events Attend buttons; menu launchers [🎛️ Owner Hub]/[🛡️ Admin Hub]
3. **Admin gating** (`3250ef8`): `menu:admin` ADMINS ONLY gate (isAdminClicker: fromMe/owner/group-admin); hub `route()` re-checks via `passesGates`; kickcfg row hidden from non-admins + `requireOwner('kickcfg')`
4. **Button audit** (`bdef088`, `tests/buttonAudit.test.js`): Phase A inventory scan (every literal/template button id must resolve; `pick:<dynamic>` now resolves via memberPicker static require); Phase B simulated taps (~37 safe ids, consumed/delivered/≤10 buttons); Phase B2 again: network ids validated not executed; Phase C forged-tap gates; Phase D cta_url validity. Mock extracts interactiveMessage recursively + parses `buttonParamsJson` (rows carry ids there, not top-level)
5. **Member picker** (`7b1da4a`, `utils/memberPicker.js`): `openPicker(sock,msg,from,cmdName,{groupMetadata,backId,title})` — role-aware lists (promote→non-admins, demote→admins 👑, moderation→all; bot excluded), 7 members/page + ◀️ Prev + ▶️ Next + ⬅️ Back (≤10), 10-min TTL per-chat sessions (`pick:<nonce>:p:<n>`/`pick:<nonce>:u:<i>`), `requireAdmin('pick')` gate; on select injects synthetic `extendedTextMessage.contextInfo.mentionedJid=[member.jid]` and calls the real `cmd.execute` with a full extra (target cmds read mention from message contextInfo, NOT extra). Wired: adminHub `route()` TARGET_CMDS diverts to picker (falls back to usage on false); the 7 commands' no-target branches (`promote/demote/kick/ban/warn/resetwarn/warnings`) try picker first then usage text
6. **.tt network overhaul** (`9b71cb1` + `a20a784`, `commands/media/tiktok.js`, `tests/tiktok.test.js`): from bot-hosting datacenter IPs every old path was dead — tikwm 403s (even with browser UA), ruhend = same tikwm backend, v16-webapp-prime CDN behind Akamai IP ACL (Reference #18, all header/host variants 403), tikcdn serves a 4MB "THIS APP IS OFFLINE — go to ssstik.io" promo clip (md5 `905a30c73f68e8b14152f1123336b083`) that passed the size check and was delivered as the "download". Fix: new primary `methodEmbed` — GET `tiktok.com/embed/v2/<id>` (page itself IS reachable, 200), extract signed `v45.tiktokcdn-eu.com/.../video/tos/...` URL (raw or JSON-escaped form, `&amp;` decoded), download (v45 edge NOT ACL'd — verified 200/3.3MB live). Chain now: embed → tikwm → ruhend → tikcdn. `sendVideo` md5-rejects the placeholder (returns false, NO URL-fallback) so the chain continues. vm/vt short-link resolution factored into shared `resolveCanonicalId`

## Kill List (do NOT resurrect)
Crew dashboard (Attend shortcut only), 14 admin mega-panels, WYR A/B buttons, launcher list views, setter panels, NSFW buttons, per-command Again handlers, typed-target requirement for the 7 admin commands (picker is the primary path).

## Active Files
- `utils/memberPicker.js` — picker core (`openPicker`, `membersFor`; lazy requires inside are fine, adminHub statically requires it so `pick:*` registers at load)
- `commands/admin/adminHub.js` — 4-page router + TARGET_CMDS diversion + hubPageFor()
- `commands/admin/{promote,demote,kick,ban,warn,resetwarn,warnings}.js` — picker-attempt in no-target branches
- `utils/{buttonHelper,againDispatch}.test.js` hooks: `listButtonHandlers`, `getLastHandlerPromise`, `passesGates`
- `tests/{buttonHelper,againDispatch,buttonAudit,memberPicker}.test.js` — extend when adding buttons/picker cmds

## Known Gotchas (this arc)
- **Anticall lives at `config.defaultGroupSettings.anticall`** — there is NO top-level `config.anticall` (ownerHub's panel read `cfg.anticall` → always undefined → OFF forever, `5be7dc7` fixed the reads). The regex-write in anticall.js always hit the nested key correctly. Enforcement in handler.js `initializeAntiCall` now re-requires config per call — without that, the module-captured config reference served the pre-toggle value until restart
- **`header` in sendButtons is silently DROPPED (`28b31f6`)** — header'd native_flow messages relay fine (BTNSND path=flow logs) but the ENTIRE message (body+buttons) renders invisible on some clients. This made every `menu:back:main` send invisible while header-less sends worked. Never re-add a header to the interactive payload; regression test in buttonHelper.test.js
- **`lastHandlerPromise =` assignment is load-bearing for tests** — 83d6c56's tap-trace commit dropped it while refactoring, racing every `await getLastHandlerPromise()` assert (picker test failed deterministically). Keep the assignment; tap-trace logging ([BTNSND]/[BTNTAP]) is fine to keep
- **Rate limiter is process-global**: sendButtons 500ms/chat — tests rendering to the SAME jid must `await settle()` (560ms) BEFORE each render/tap, not after (test 3 burned this twice)
- **nativeFlow rows hide ids in `buttonParamsJson`** — any mock/assertion must JSON.parse row params; top-level `.id` is undefined
- **Lazy `require('../../utils/memberPicker')` inside command branches means `pick:*` isn't registered until first picker** — adminHub has a static require to fix this for the audit Phase A scanner; keep it
- Target commands read target from `msg.message.extendedTextMessage.contextInfo.mentionedJid` — picker MUST inject the synthetic message (extra.mentionedJid doesn't exist)
- **Datacenter IP reality for TikTok** (verified from the box 2026-10-12): `www.tiktok.com` pages = 200 ✓; `v16-webapp-prime.tiktok.com` CDN = Akamai 403 Reference #18 (no referer / mobile UA / Range / host-swap all fail); `tikwm.com` API = 403 even with browser UA+Referer; `v45.tiktokcdn-eu.com` (embed player CDN) = 200 ✓ — this is why `methodEmbed` is primary. Host-swapping prime→v45 fails ("invalid url format" — v45 uses `/md5prefix/nonce/video/tos/...` path signing)
- **tikcdn placeholder**: robot-with-sign "THIS APP IS OFFLINE. CONTINUE ON SSSTIK.IO" clip, 4,089,113 bytes, md5 `905a30c73f68e8b14152f1123336b083`; tikcdn also returns 204/empty for other ids — either way it is NEVER a valid download; `isPlaceholder` blacklist + `sendVideo` returns false (skips the URL-send fallback too)
- **MCP shell tool is `deployments_shell`** (NOT `shell` — that's "Unknown tool"); long `node -e` runs hit the gateway 504 (~30s) even though the shell itself survives — for slow scripts use `nohup node script.js > /tmp/x.log 2>&1 &` then cat the log in a second call
- `node --test tests/` DIRECTORY ARG FAILS on Windows/Node 24 → npm test = glob; `--test-force-exit` required (loaded commands keep intervals alive); kill stray node procs before rerun
- ownerHub overlap warnings on boot EXPECTED (~25 lines, longest match wins)
- Never-commit: `__pycache__/`, `app.json`, `check.js`, `check_disk.py`, `upload_*.py`; restore `database/crew.json` before commit (tests dirty it; `ownerPromotedAdmins.json` is tracked — picker tests use fromMe:false to avoid promote's owner-protection DB write)

## Next Steps
1. User live-tests `.tt <tiktok url>` — must deliver the REAL video now (embed→v45 path; verified server-side). If a slideshow/photo post fails on embed (no video/tos URL in page), tikwm covers it where not IP-blocked — report if user hits slideshow failures
2. Verify the back-button fix live (`28b31f6`): `!menu` → tap a category → tap ⬅️ Back to Menu → main menu MUST now appear (was invisible due to header). Same for More → Anime/Textmaker → Back to More
3. Live smoke (owner, group): `.menu` → 🛡️ Admin → Admin Hub → promote → picker lists non-admins → tap one → PROMOTED; repeat kick/demote/warnings; check Prev/Next pagination; tap Back → hub page 3; `.promote` typed (no tag) → picker opens; DM `.promote` → usage text
4. Watch 24h: again: API-multiplication on joke/truth/dare (tighten cooldown 2s→5s if abused); picker sessions Map is TTL-only (10-min expiry, sweep interval .unref'd — no hard cap; fine at current scale)

## Memory Keys
- `project/buttons` — button-ification arc: allowlist dispatcher + hubs + picker
- `project/identity` — stack, entry points, deploy flow
