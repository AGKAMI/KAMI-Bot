# KAMI Bot

WhatsApp bot with 100+ commands — media, games, AI, admin, fun. Built with Baileys (WhatsApp Web API).

## Deployment Workflow

**File uploads**: Use SFTP (paramiko) — Pterodactyl client API has no file write endpoint.
**Restarts**: Use Pterodactyl API — `POST /api/client/servers/{id}/power` with `{"signal":"restart"}`.
**Code changes**: Edit locally, git push, BUT always SFTP upload files to server directly.

### Credentials

- **SFTP**: `fi5.bot-hosting.net:2022`
- **SFTP User**: `1369162108788281356.08b6894d`
- **SFTP Pass**: `hQfgKb8qdg9LBPu`
- **API Key**: `ptlc_uN1mvEAG4h97A7997CYRCjU9U1ic5me6clDrXCXLefa`
- **Server ID**: `08b6894d`

### Gotchas

- `git pull` fails silently on bot-hosting — always SFTP upload files
- Root `package.json` breaks deploy — npm install runs wrong deps
- `listMessage` doesn't work in Baileys — use plain text for menus
- `config.author` doesn't exist — use `config.packname` as fallback in sticker.js
- SFTP password needs `.strip()` — trailing newline causes auth failure in paramiko
