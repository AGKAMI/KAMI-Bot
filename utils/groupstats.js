// utils/groupStats.js
const fs = require('fs');
const path = require('path');

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
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('[groupStats] save error:', err);
    }
}

function flushPending() {
    if (Object.keys(pendingWrites).length === 0) return;
    const db = loadDB();
    for (const [key, delta] of Object.entries(pendingWrites)) {
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
    pendingWrites = {};
    saveDB(db);
}

function addMessage(groupId, senderId) {
    const today = new Date().toISOString().slice(0, 10);
    const hour = new Date().getHours().toString();
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
    const today = new Date().toISOString().slice(0, 10);
    if (!db[groupId] || !db[groupId][today]) return null;
    return db[groupId][today];
}

process.on('SIGINT', () => { flushPending(); });
process.on('SIGTERM', () => { flushPending(); });

module.exports = { addMessage, getStats };
