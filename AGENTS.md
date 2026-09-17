# KAMI Bot

WhatsApp bot with 100+ commands — media, games, AI, admin, fun. Built with Baileys (WhatsApp Web API).

## Deployment Workflow

**Primary**: GitHub auto-pull — push to `main`, restart from panel, it pulls automatically.
**Fallback**: SFTP (paramiko) if GitHub isn't connected.
**Restarts**: Use Pterodactyl API — `POST /api/client/servers/{id}/power` with `{"signal":"restart"}`.

### GitHub Integration

- Repo: `AGKAMI/KAMI-Bot` (branch: `main`)
- bot-hosting.net GitHub tab connected
- Auto-pull at restart: enabled
- Workflow: `git push origin main` → restart from panel → auto-pulls latest commit

### Credentials (New Panel — bot-hosting.net)

- **SFTP**: `fi9.bot-hosting.cloud:2022`
- **SFTP User**: `b0665152-9b54-4ede-a11f-45c4a6641704.u9mg7ylz`
- **SFTP Pass**: `hswNZ_VrtM2FiZywg_YPa-1v`
- **API Key**: `ptlc_b2LS7kbmnkfIZCbC6MTRL1RWneTfpftTU531z5sBnLC`
- **Server ID**: `08b6894d`

### Gotchas

- Old SFTP host `fi5.bot-hosting.net` is dead — use `fi9.bot-hosting.cloud`
- Root `package.json` breaks deploy — npm install runs wrong deps
- `listMessage` doesn't work in Baileys — use plain text for menus
- `config.author` doesn't exist — use `config.packname` as fallback in sticker.js
- SFTP password needs `.strip()` — trailing newline causes auth failure in paramiko
