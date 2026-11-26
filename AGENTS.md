# KAMI Bot

WhatsApp bot with 100+ commands — media, games, AI, admin, fun. Built with Baileys (WhatsApp Web API).

## Deployment Workflow

**Primary**: GitHub auto-pull — push to `main`, restart the LIVE deployment, it pulls automatically.
**Fallback**: SFTP (paramiko) — host `fi9.bot-hosting.cloud:2022`.
**Restarts**: bot-hosting MCP API — `POST https://bot-hosting.net/api/mcp` with `Authorization: Bearer bhk_…` (JSON-RPC `tools/call`, e.g. `deployments_power` / `deployments_apply`). The old Pterodactyl client API + `08b6894d` points at a DEAD box — never use it for restarts.

### ⚠️ TWO SERVERS (discovered 2026-10-09)

- **LIVE bot** = deployment `b0665152-9b54-4ede-a11f-45c4a6641704` (SFTP suffix `u9mg7ylz`, node fi9, 256MB, entry `index.js`). This is the only box that runs the bot.
- **STALE box** = panel server `08b6894d` (uuid `08b6894d-6f38-4881-8fd3-e5c3954c0c1d`) — June–Sep code, session dead since 09-18, root file listing frozen. Stop/start cycles on it do nothing useful.

### GitHub Integration

- Repo: `AGKAMI/KAMI-Bot` (branch: `main`)
- bot-hosting.net GitHub tab connected (auto-pull at restart: enabled)
- Workflow `.github/workflows/deploy-bot-hosting.yml`: was failing HTTP 401 (expired `BOT_HOSTING_API_KEY`, set 2026-06-15) — key secret replaced 2026-10-09, but `BOT_HOSTING_SERVER_ID` secret still = old `08b6894d` (needs rewrite to MCP/bhk_ or correct id)

### Credentials (bot-hosting.net)

- **SFTP**: `fi9.bot-hosting.cloud:2022`
- **SFTP User**: `b0665152-9b54-4ede-a11f-45c4a6641704.u9mg7ylz`
- **SFTP Pass**: rotated 2026-10-31 — NOT stored in this repo (the old `hswNZ_…` value is dead; keep the current one in your password manager / the deploying shell's env)
- **MCP API Key (LIVE box)**: NOT stored in this repo. Lives in the GitHub Actions secret `BOT_HOSTING_API_KEY`; the deploy workflow uses it. Old `bhk_b77e…` key is dead.
- **Pterodactyl key**: STALE box only (dead box + `08b6894d`) — not stored here, and not needed for anything current.

### Gotchas

- Old SFTP host `fi5.bot-hosting.net` is dead — use `fi9.bot-hosting.cloud`
- Root `package.json` breaks deploy — npm install runs wrong deps
- `listMessage` doesn't work in Baileys — use plain text for menus
- `config.author` doesn't exist — use `config.packname` as fallback in sticker.js
- SFTP password needs `.strip()` — trailing newline causes auth failure in paramiko
- **Two servers**: panel `08b6894d` ≠ live `b0665152…/u9mg7ylz` — SFTP/MCP = live, Pterodactyl API = dead box
- **Panel console log buffer is tiny** (~16–100 lines) — boot/kick output rotates out within minutes; verify outcomes from `database/*.json` state files instead
- **`utils/autoProgression.js` caches `inactiveAlerts.json` in memory at boot** (`_loadState()`) — disk edits are invisible until a full process restart; kick failures KEEP flags, terminal states (kicked/left/active/protected) DELETE them
- **`bhk_` ≠ `ptlc_` keys**: `bhk_` → `bot-hosting.net/api/mcp`; `ptlc_` → `control.bot-hosting.net/api/client` (and they belong to different panel accounts)
- **`config.ownerNumber` stores SA LOCAL form** (`0840820712`), so building a jid as `${ownerNum}@s.whatsapp.net` produces an INVALID jid and every owner DM silently dies in a swallowed `catch {}`. Always iterate `ownerDmTargets()` from `utils/jidHelper.js` (it yields `27…@s.whatsapp.net` + `27…@lid`, and maps 15-digit entries to `@lid` only). Fixed across handler.js (4 sites), protectionDm.js, admin/kick.js, admin/demote.js.
- **`utils/converter.js` ffmpeg `spawn` must pass `stdio: 'ignore'`** — default pipes plus an unread ffmpeg stderr fills the ~64KB pipe buffer and the child BLOCKS on write forever (showed up as `.audio`/`.video` conversions that never resolve on the memory-capped box).
- **`utils/buttonHelper.js` `handleButtonResponse` gates admin-only button ids at the central gate too** — both handler.js call sites OR `isOwner` in, but relying on that locks the owner out the first time a call site forgets.
- **commandLoader silently shadows commands on duplicate `name`/alias** and only `console.warn`s. Collisions fixed 2026-11-26: `crew.js` alias `ss` vs `general/ssweb.js`, `crew/roster.js` alias `members` vs `general/members.js`, `crew/stats.js` alias `mystats` vs `general/myactivity.js`, and a self-collision in `fun/complimentry.js` (name duplicated in its own alias list). Verify with `node -e "require('./utils/commandLoader').loadCommands()"` — a clean load prints no `[COMMANDS] ... overrides` lines.
