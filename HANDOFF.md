# HANDOFF

## Goal
Hybrid button-ification of ALL command categories — minimize typing, maximize buttons. Batches shipped (`34cfd69`, `3291267`), then admin gating (`3250ef8`), button audit (`bdef088`), and finally the **member picker** (`7b1da4a`): admin target commands now open a tap-a-member list instead of demanding a tag/reply.

## Current State
- Bot CONNECTED on 27833882383 (prefix `!`) — `7b1da4a` auto-pulled, deploy verified via MCP logs
- HEAD = `7b1da4a`; 30/30 tests green (`node --test-force-exit --test tests/*.test.js`); syntax-clean on all touched files
- Prior arcs healthy (name-cache `8f11f82`, 401-fix `27aa6e1`, disk `8dd01d4`, buttons `34cfd69`/`3291267`, gates `3250ef8`, audit `bdef088`)
- **Soak still SKIPPED** — watch for button-tap storms, again: replay loops on external APIs (2s/chat cooldown mitigates), ownerHub config.js string-replace races

## What Shipped
1. **Button infra** (`34cfd69`): longest-prefix dispatch + overlap warnings; `requireOwner`/`isOwnerJid`/`requireAdmin` shared gates; generic `again:` replay dispatcher (ALLOW + gates + 2s cooldown); `.unref()` intervals; group-guard sweep; F6 live-prefix in menus; NSFW anime typed-only permanently (judge unanimity)
2. **Hubs** (`34cfd69`): `commands/owner/ownerHub.js` (`.ohub`, anticall/mode/autoreact/dmblocker, freshConfig per render); `commands/admin/adminHub.js` (`.ahub`, 4 pages ≤10 buttons incl nav — was 3 pages busting the slice(0,10) cap and dropping Back); crew events Attend buttons; menu launchers [🎛️ Owner Hub]/[🛡️ Admin Hub]
3. **Admin gating** (`3250ef8`): `menu:admin` ADMINS ONLY gate (isAdminClicker: fromMe/owner/group-admin); hub `route()` re-checks via `passesGates`; kickcfg row hidden from non-admins + `requireOwner('kickcfg')`
4. **Button audit** (`bdef088`, `tests/buttonAudit.test.js`): Phase A inventory scan (every literal/template button id must resolve; `pick:<dynamic>` now resolves via memberPicker static require); Phase B simulated taps (~37 safe ids, consumed/delivered/≤10 buttons); Phase B2 again: network ids validated not executed; Phase C forged-tap gates; Phase D cta_url validity. Mock extracts interactiveMessage recursively + parses `buttonParamsJson` (rows carry ids there, not top-level)
5. **Member picker** (`7b1da4a`, `utils/memberPicker.js`): `openPicker(sock,msg,from,cmdName,{groupMetadata,backId,title})` — role-aware lists (promote→non-admins, demote→admins 👑, moderation→all; bot excluded), 7 members/page + ◀️ Prev + ▶️ Next + ⬅️ Back (≤10), 10-min TTL per-chat sessions (`pick:<nonce>:p:<n>`/`pick:<nonce>:u:<i>`), `requireAdmin('pick')` gate; on select injects synthetic `extendedTextMessage.contextInfo.mentionedJid=[member.jid]` and calls the real `cmd.execute` with a full extra (target cmds read mention from message contextInfo, NOT extra). Wired: adminHub `route()` TARGET_CMDS diverts to picker (falls back to usage on false); the 7 commands' no-target branches (`promote/demote/kick/ban/warn/resetwarn/warnings`) try picker first then usage text

## Kill List (do NOT resurrect)
Crew dashboard (Attend shortcut only), 14 admin mega-panels, WYR A/B buttons, launcher list views, setter panels, NSFW buttons, per-command Again handlers, typed-target requirement for the 7 admin commands (picker is the primary path).

## Active Files
- `utils/memberPicker.js` — picker core (`openPicker`, `membersFor`; lazy requires inside are fine, adminHub statically requires it so `pick:*` registers at load)
- `commands/admin/adminHub.js` — 4-page router + TARGET_CMDS diversion + hubPageFor()
- `commands/admin/{promote,demote,kick,ban,warn,resetwarn,warnings}.js` — picker-attempt in no-target branches
- `utils/{buttonHelper,againDispatch}.test.js` hooks: `listButtonHandlers`, `getLastHandlerPromise`, `passesGates`
- `tests/{buttonHelper,againDispatch,buttonAudit,memberPicker}.test.js` — extend when adding buttons/picker cmds

## Known Gotchas (this arc)
- **Rate limiter is process-global**: sendButtons 500ms/chat — tests rendering to the SAME jid must `await settle()` (560ms) BEFORE each render/tap, not after (test 3 burned this twice)
- **nativeFlow rows hide ids in `buttonParamsJson`** — any mock/assertion must JSON.parse row params; top-level `.id` is undefined
- **Lazy `require('../../utils/memberPicker')` inside command branches means `pick:*` isn't registered until first picker** — adminHub has a static require to fix this for the audit Phase A scanner; keep it
- Target commands read target from `msg.message.extendedTextMessage.contextInfo.mentionedJid` — picker MUST inject the synthetic message (extra.mentionedJid doesn't exist)
- `node --test tests/` DIRECTORY ARG FAILS on Windows/Node 24 → npm test = glob; `--test-force-exit` required (loaded commands keep intervals alive); kill stray node procs before rerun
- ownerHub overlap warnings on boot EXPECTED (~25 lines, longest match wins)
- Never-commit: `__pycache__/`, `app.json`, `check.js`, `check_disk.py`, `upload_*.py`; restore `database/crew.json` before commit (tests dirty it; `ownerPromotedAdmins.json` is tracked — picker tests use fromMe:false to avoid promote's owner-protection DB write)

## Next Steps
1. Live smoke (owner, group): `.menu` → 🛡️ Admin → Admin Hub → promote → picker lists non-admins → tap one → PROMOTED; repeat kick/demote/warnings; check Prev/Next pagination; tap Back → hub page 3; `.promote` typed (no tag) → picker opens; DM `.promote` → usage text
2. Watch 24h: again: API-multiplication on joke/truth/dare (tighten cooldown 2s→5s if abused); picker sessions map growth (10-min TTL + 10k cap enforced)
3. If dispatcher misfires: `validate()` rejects are silent by design

## Memory Keys
- `project/buttons` — button-ification arc: allowlist dispatcher + hubs + picker
- `project/identity` — stack, entry points, deploy flow
