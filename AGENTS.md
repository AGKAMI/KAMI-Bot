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
- **SFTP Pass**: `hswNZ_VrtM2FiZywg_YPa-1v`
- **MCP API Key (LIVE box)**: `bhk_b77e82b54bfb19ebe8be6391d3833e514af2614e1478d0e8` → `POST https://bot-hosting.net/api/mcp` (Bearer). Full control: `deployments_logs/searchLogs/shell/power/diagnose/apply`, `files_*`, `env_*`. Key type `bhk_` (dashboard/CLI key) — does NOT work on `control.bot-hosting.net/api/client` (401).
- **Pterodactyl key**: `ptlc_b2LS7kbmnkfIZCbC6MTRL1RWneTfpftTU531z5sBnLC` + **Server ID** `08b6894d` — STALE box only.

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
