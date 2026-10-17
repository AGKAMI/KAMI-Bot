// utils/autoReact.js — persists to database/autoReact.json
// The old implementation called database.readDB/USERS_DB/writeDB, none of
// which are exported — load() always returned the disabled default and
// save() threw a swallowed TypeError. The runtime gate in handler.js now
// reads this module instead of config.autoReact.
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database', 'autoReact.json');
let cache = null;

function load() {
    if (cache) return { ...cache };
    try {
        const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        cache = { enabled: !!data.enabled, mode: data.mode === 'all' ? 'all' : 'bot' };
    } catch {
        cache = { enabled: false, mode: 'bot' };
    }
    return { ...cache };
}

function save(data) {
    cache = { enabled: !!data.enabled, mode: data.mode === 'all' ? 'all' : 'bot' };
    try {
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tmp = `${DB_PATH}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
        fs.renameSync(tmp, DB_PATH);
    } catch (err) {
        console.error('[autoReact] save error:', err.message);
    }
}

module.exports = { load, save };
