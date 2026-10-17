// utils/ttlMap.js — Map with per-entry TTL so game/session state can't
// accumulate forever. Games used to keep sessions in plain Maps with no
// expiry — abandoned sessions lived until restart, slowly leaking memory
// on the 256MB box.
//
// Usage: const games = new TTLMap('wordchain', 60 * 60 * 1000); // 1h TTL
// set() stamps the entry; prune() (global sweep every 5 min, plus on set
// once the map is oversized) drops anything older than the TTL.
// get()/has() do NOT extend the TTL — sessions expire from creation, which
// is what you want for timed games.

const instances = new Set();

class TTLMap extends Map {
    constructor(name, ttlMs, maxEntries = 500) {
        super();
        this._name = name;
        this._ttl = ttlMs;
        this._max = maxEntries;
        this._ts = new Map(); // key → set timestamp
        instances.add(this);
    }

    set(key, value) {
        this._ts.set(key, Date.now());
        // Hard cap so a flood of keys can't balloon between sweeps
        if (this.size > this._max && !this.has(key)) {
            this._prune();
            if (this.size > this._max) {
                // Still over — drop oldest half
                const keys = [...this._ts.keys()].sort((a, b) => this._ts.get(a) - this._ts.get(b));
                for (const k of keys.slice(0, Math.ceil(this._max / 2))) this.delete(k);
            }
        }
        return super.set(key, value);
    }

    delete(key) {
        this._ts.delete(key);
        return super.delete(key);
    }

    clear() {
        this._ts.clear();
        return super.clear();
    }

    _prune() {
        const now = Date.now();
        for (const [key, ts] of this._ts) {
            if (now - ts > this._ttl) this.delete(key);
        }
    }

    prune() { this._prune(); }
}

// Global sweep — every 5 min, unref'd so it never holds the process open
setInterval(() => {
    for (const inst of instances) {
        try { inst._prune(); } catch (e) { /* keep sweeping others */ }
    }
}, 5 * 60 * 1000).unref();

module.exports = TTLMap;
