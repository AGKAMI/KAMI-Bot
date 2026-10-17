/**
 * Database snapshot rotation — periodic copies of every live database
 * JSON into database/backups/snap-<stamp>/, keeping the newest 7.
 *
 * Why: bot-hosting's platform backups rotate hourly and a restore races
 * the running bot (proved 2026-10-12 when a crew.json wipe raced a
 * restore). Local snapshots give instant, self-service recovery — copy
 * the file back and restart, no platform surgery.
 *
 * Wired in index.js: 2 min after boot, then every 12h. Cheap — the whole
 * database dir is ~50-100KB.
 */

const fs = require('fs');
const path = require('path');

const KEEP = 7;
const STAMPS = new Set(['groups', 'users', 'warnings', 'mods', 'crew', 'global', 'ownerPromotedAdmins', 'ownerAddedMembers', 'kickBans', 'audit', 'inactiveAlerts', 'kickConfig', 'nameCache', 'tempAllowed', 'ttStats', 'reminders']);

function runSnapshot() {
  try {
    const dbDir = path.join(__dirname, '..', 'database');
    const backupsDir = path.join(dbDir, 'backups');
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

    const d = new Date();
    const stamp = 'snap-' + d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') + '-' +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0');
    const snapDir = path.join(backupsDir, stamp);
    if (fs.existsSync(snapDir)) return; // already snapshotted this minute

    fs.mkdirSync(snapDir, { recursive: true });
    let copied = 0;
    for (const f of fs.readdirSync(dbDir)) {
      if (!f.endsWith('.json')) continue;
      const base = f.replace(/\.json$/, '');
      if (!STAMPS.has(base)) continue;
      try {
        fs.copyFileSync(path.join(dbDir, f), path.join(snapDir, f));
        copied++;
      } catch (e) { /* single file failure shouldn't kill the snapshot */ }
    }

    // Prune: keep the newest KEEP snapshot dirs
    const snaps = fs.readdirSync(backupsDir)
      .filter(n => n.startsWith('snap-'))
      .sort()
      .reverse();
    for (const old of snaps.slice(KEEP)) {
      try { fs.rmSync(path.join(backupsDir, old), { recursive: true, force: true }); } catch (e) {}
    }

    console.log(`[DB-BACKUP] ${copied} files -> database/backups/${stamp} (keeping ${Math.min(snaps.length + 1, KEEP)})`);
  } catch (e) {
    console.error('[DB-BACKUP] snapshot failed:', e.message);
  }
}

module.exports = { runSnapshot };
