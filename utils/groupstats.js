// utils/groupStats.js
const fs = require('fs');
const path = require('path');
const { todayISO, parts } = require('./sast');

const DB_PATH = path.join(__dirname, '../database/groupStats.json');

let pendingWrites = {};
let flushTimer = null;

function loadDB() {
    try {
        if (!fs.existsSync(DB_PATH)) return {};
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch {
        return {};
    }
}

function saveDB(data) {
    try {
        // Atomic write — a panel kill mid-write must not truncate groupStats.json
        const tmp = `${DB_PATH}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        fs.renameSync(tmp, DB_PATH);
        return true;
    } catch (err) {
        console.error('[groupStats] save error:', err);
        return false;
    }
}

function flushPending() {
    if (Object.keys(pendingWrites).length === 0) return;
    const db = loadDB();
    const batch = pendingWrites;
    // Detach the batch FIRST so concurrent addMessage() calls during this
    // flush land in a fresh map instead of being lost.
    pendingWrites = {};
    for (const [key, delta] of Object.entries(batch)) {
        const [groupId, date] = key.split('|');
        if (!db[groupId]) db[groupId] = {};
        if (!db[groupId][date]) {
            db[groupId][date] = { total: 0, users: {}, hours: {} };
        }
        const g = db[groupId][date];
        g.total += delta.total;
        for (const [uid, count] of Object.entries(delta.users)) {
            g.users[uid] = (g.users[uid] || 0) + count;
        }
        for (const [h, count] of Object.entries(delta.hours)) {
            g.hours[h] = (g.hours[h] || 0) + count;
        }
    }
    if (!saveDB(db)) {
        // Write failed — merge the batch back so the deltas aren't dropped
        for (const [key, delta] of Object.entries(batch)) {
            if (!pendingWrites[key]) pendingWrites[key] = { total: 0, users: {}, hours: {} };
            const p = pendingWrites[key];
            p.total += delta.total;
            for (const [uid, count] of Object.entries(delta.users)) {
                p.users[uid] = (p.users[uid] || 0) + count;
            }
            for (const [h, count] of Object.entries(delta.hours)) {
                p.hours[h] = (p.hours[h] || 0) + count;
            }
        }
    }
}

function addMessage(groupId, senderId) {
    // SAST date/hour buckets — the container runs UTC, so toISOString()
    // and getHours() would file mid-evening SA messages under the wrong
    // day/hour (and roll "today" backwards during 00:00–01:59 SAST)
    const today = todayISO();
    const hour = parts().hours.toString();
    const key = `${groupId}|${today}`;

    if (!pendingWrites[key]) {
        pendingWrites[key] = { total: 0, users: {}, hours: {} };
    }
    const d = pendingWrites[key];
    d.total++;
    d.users[senderId] = (d.users[senderId] || 0) + 1;
    d.hours[hour] = (d.hours[hour] || 0) + 1;

    if (!flushTimer) {
        flushTimer = setTimeout(() => {
            flushPending();
            flushTimer = null;
        }, 30000);
    }
}

function getStats(groupId) {
    flushPending();
    const db = loadDB();
    const today = todayISO();
    if (!db[groupId] || !db[groupId][today]) return null;
    return db[groupId][today];
}

// NOTE: SIGINT/SIGTERM flush here never ran in the bot — index.js's
// _flushAndExit calls process.exit() synchronously and its handler is
// registered first, so later listeners never fire. index.js now calls
// flushPending() explicitly via the export below before exiting.
process.on('SIGINT', () => { flushPending(); });
process.on('SIGTERM', () => { flushPending(); });

module.exports = { addMessage, getStats, flushPending };
