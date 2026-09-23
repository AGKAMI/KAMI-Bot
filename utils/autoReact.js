// utils/autoReact.js — persists to database.json instead of rewriting config.js
let db;
function getDb() {
    if (!db) db = require('../database');
    return db;
}

function load() {
    try {
        const data = getDb().readDB(getDb().USERS_DB);
        const settings = data._autoReact || {};
        return {
            enabled: settings.enabled || false,
            mode: settings.mode || 'bot'
        };
    } catch {
        return { enabled: false, mode: 'bot' };
    }
}

function save(data) {
    try {
        const usersDb = getDb();
        const users = usersDb.readDB(usersDb.USERS_DB);
        users._autoReact = { enabled: data.enabled, mode: data.mode };
        usersDb.writeDB(usersDb.USERS_DB, users);
    } catch (err) {
        console.error('[autoReact] save error:', err);
    }
}

module.exports = { load, save };
