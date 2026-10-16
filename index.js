/**
 * KAMI Bot - WhatsApp MD Bot
 */

console.log(`
╔═══════════════════════════════════════╗
║                                       ║
║   ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄   ║
║   █ K █ A █ M █ I █   █ B █ O █ T █   ║
║   ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀   ║
║         💀 Version 1.0.0 💀           ║
║                                       ║
╚═══════════════════════════════════════╝
`);

process.env.PUPPETEER_SKIP_DOWNLOAD = 'true';
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || '/tmp/puppeteer_cache_disabled';

// Container clock is UTC — set SAST before any require so unaudited
// local-time code (leaderboard cutoffs, Date#toLocaleString stragglers)
// still reads South African wall clock. Verified live on the box: honored
// (prints GMT+0200). Windows dev/tests ignore it — utils/sast.js stays
// TZ-independent for those. First line of defense, not the only one.
process.env.TZ = 'Africa/Johannesburg';

const { initializeTempSystem } = require('./utils/tempManager');
const { startCleanup } = require('./utils/cleanup');
console.log('🔧 Initializing KAMI Bot...\n');
initializeTempSystem();
startCleanup();

// Ensure the repo-shipped yt-dlp binary is executable (SFTP uploads lose the exec bit)
try {
  const ytDlpBin = path.join(__dirname, 'bin', 'yt-dlp');
  if (fs.existsSync(ytDlpBin)) fs.chmodSync(ytDlpBin, 0o755);
} catch (e) {}

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

const forbiddenPatternsConsole = [
  'closing session',
  'closing open session',
  'sessionentry',
  'prekey bundle',
  'pendingprekey',
  '_chains',
  'registrationid',
  'currentratchet',
  'chainkey',
  'ratchet',
  'signal protocol',
  'ephemeralkeypair',
  'indexinfo',
  'basekey'
];

console.log = (...args) => {
  const message = args.map(a => typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ').toLowerCase();
  if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
    originalConsoleLog.apply(console, args);
  }
};

// Don't filter console.error — real errors should always be visible
console.warn = (...args) => {
  const message = args.map(a => typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ').toLowerCase();
  if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
    originalConsoleWarn.apply(console, args);
  }
};

// Now safe to load libraries
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const config = require('./config');
const handler = require('./handler');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const os = require('os');

// Optimized in-memory store with hard limits (Map-based for better memory management)
const store = {
  messages: new Map(), // Use Map instead of plain object
  maxPerChat: 20, // Limit to 20 messages per chat

  bind: (ev) => {
    ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        if (!msg.key?.id) continue;

        const jid = msg.key.remoteJid;
        if (!store.messages.has(jid)) {
          store.messages.set(jid, new Map());
        }

        const chatMsgs = store.messages.get(jid);
        chatMsgs.set(msg.key.id, msg);

        // Aggressive cleanup per chat - keep only recent messages
        if (chatMsgs.size > store.maxPerChat) {
          // Remove oldest message (first entry in Map)
          const oldestKey = chatMsgs.keys().next().value;
          chatMsgs.delete(oldestKey);
        }
      }
    });
  },

  loadMessage: async (jid, id) => {
    return store.messages.get(jid)?.get(id) || null;
  }
};

// Optimized message deduplication (Set-based, no timestamps needed)
const processedMessages = new Set();

// Aggressive cleanup - clear every 5 minutes
setInterval(() => {
  processedMessages.clear();
}, 5 * 60 * 1000); // Every 5 minutes

// ---- Memory guard (256MB box, panel kills at 256MB) ----
// Sample the cgroup counter the panel enforces (fallback: process RSS).
// Critical twice in a row (10min sustained) → clean exit; tini/wings restart
// the container fresh instead of a hard OOM kill landing mid-write.
// Telemetry line every 30min so trends are visible in the console log.
let memCritStreak = 0;
let memTicks = 0;
setInterval(() => {
  try {
    let used;
    try {
      used = Number(require('fs').readFileSync('/sys/fs/cgroup/memory.current', 'utf8'));
    } catch {
      used = process.memoryUsage().rss;
    }
    const usedMB = Math.round(used / 1048576);
    memTicks++;
    if (memTicks % 6 === 0) {
      const mu = process.memoryUsage();
      console.log(`[MEM] ${usedMB}MB/256MB | rss ${Math.round(mu.rss / 1048576)}MB | heap ${Math.round(mu.heapUsed / 1048576)}/${Math.round(mu.heapTotal / 1048576)}MB | ext ${Math.round(mu.external / 1048576)}MB`);
    }
    if (used >= 245 * 1048576) {
      memCritStreak++;
      console.warn(`⚠️ MEMORY HIGH: ${usedMB}MB/256MB (${memCritStreak}/2 critical checks)`);
      if (memCritStreak >= 2) {
        console.error('🛑 MEMORY CRITICAL sustained — self-restarting for a clean slate');
        process.exit(0);
      }
    } else {
      memCritStreak = 0;
    }
  } catch (e) { /* guard must never crash the bot */ }
}, 5 * 60 * 1000);

// Custom Pino logger with suppression for Baileys noise
const createSuppressedLogger = (level = 'silent') => {
  const forbiddenPatterns = [
    'closing session',
    'closing open session',
    'sessionentry',
    'prekey bundle',
    'pendingprekey',
    '_chains',
    'registrationid',
    'currentratchet',
    'chainkey',
    'ratchet',
    'signal protocol',
    'ephemeralkeypair',
    'indexinfo',
    'basekey',
    'sessionentry',
    'ratchetkey'
  ];

  let logger;
  try {
    logger = pino({
      level,
      // Fallback transport without pino-pretty (in case not installed)
      transport: process.env.NODE_ENV === 'production' ? undefined : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname'
        }
      },
      customLevels: {
        trace: 0,
        debug: 1,
        info: 2,
        warn: 3,
        error: 4,
        fatal: 5
      },
      // Redact sensitive fields
      redact: ['registrationId', 'ephemeralKeyPair', 'rootKey', 'chainKey', 'baseKey']
    });
  } catch (err) {
    // Fallback to basic pino without transport
    logger = pino({ level });
  }

  // Wrap log methods to filter
  const originalInfo = logger.info.bind(logger);
  logger.info = (...args) => {
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ').toLowerCase();
    if (!forbiddenPatterns.some(pattern => msg.includes(pattern))) {
      originalInfo(...args);
    }
  };
  logger.debug = () => { }; // Fully disable debug
  logger.trace = () => { }; // Fully disable trace
  return logger;
};

// Session reconnect retry counter — module-level so it persists across startBot() reconnects
let sessionRetryCount = 0;

// Single pending reconnect shared by ALL paths (close handler, watchdog, conflict retry)
// so we never spawn two sockets for the same account (second socket → 440 conflict).
let reconnectTimer = null;
function scheduleReconnect(delay, tag) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await startBot();
    } catch (e) {
      // startBot threw BEFORE wiring the close handler (auth state, version fetch,
      // etc.) — no connection.update will ever fire, so nothing else retries and
      // the process sits as a zombie. Re-arm with capped backoff.
      console.error(`[${tag}] reconnect failed:`, e.message);
      scheduleReconnect(Math.min(delay * 2, 5 * 60 * 1000), tag);
    }
  }, delay);
}

// Persistent connection-event log — the panel console buffer is tiny (~100 lines),
// so every close/retry/wipe is also appended to disk for post-mortems when a
// session dies. database/*.log is gitignored; capped at ~400 entries.
const CONN_LOG = path.join(__dirname, 'database', 'connectionLog.log');
function logConnEvent(event) {
  try {
    fs.appendFileSync(CONN_LOG, JSON.stringify({ t: new Date().toISOString(), ...event }) + '\n');
    const st = fs.statSync(CONN_LOG);
    if (st.size > 96 * 1024) {
      const lines = fs.readFileSync(CONN_LOG, 'utf8').trim().split('\n');
      fs.writeFileSync(CONN_LOG, lines.slice(-400).join('\n') + '\n');
    }
  } catch {}
}
let lastLoggedQr = null;

// Main connection function
// ── Crew roster sync — groups are the source of truth ───────────────
// Everyone sitting in a crew group (non-admin) belongs in that team's
// crew roster, and anyone gone from the group comes out. Runs at boot
// AND every 30 min so "they're in the group but not in the crew" never
// happens between restarts. LID-safe: roster entries and participants
// match through buildComparableIds variants + bare-digit fallback (a
// phone-jid roster entry must NOT be pruned just because WhatsApp
// reports the member as an @lid). Force-flushes the crew DB — sync
// writes riding the debounced flush died on restarts.
let _crewSyncTimer = null;
// Latest connected socket. Reconnects build a NEW sock object — the 30-min
// interval is registered once, so it must read this live reference or every
// periodic run after a reconnect dies with "Connection Closed" forever.
let _crewSyncSock = null;
// Loud one-time boot signal if a runtime teamMap entry contradicts the
// config team of the same key — that cross-wire silently routes
// applications to the wrong group with the wrong invite link.
let _teamMapMismatchWarned = false;
// Same transient-error policy as the unpin sweep: network flaps must not
// burn the retry ladder.
const CREW_SYNC_TRANSIENT = /connection closed|connection terminated|timed? ?out|rate.?limit|stream errored|websocket/i;
async function syncCrewRosters(sock, _retry = 0, _transient = 0) {
  const db = require('./database');
  const { buildComparableIds } = require('./utils/jidHelper');
  const crewData = db.getCrew();
  const teamMap = crewData.teamMap || {};
  if (!_teamMapMismatchWarned) {
    _teamMapMismatchWarned = true;
    try {
      const cfg = require('./config');
      for (const [k, t] of Object.entries(cfg.crewTeams || {})) {
        const m = teamMap[k];
        if (m && t.jid && m.jid !== t.jid) {
          console.error(`[TEAMMAP] MISMATCH: teamMap.${k} = ${m.jid} but config = ${t.jid} — config wins for routing; fix database/crew.json`);
        }
      }
    } catch (e) {}
  }
  let synced = 0;
  let pruned = 0;
  let teamErrors = 0;
  let transientErrors = 0;

  for (const [abbrev, info] of Object.entries(teamMap)) {
    try {
      const groupMeta = await sock.groupMetadata(info.jid);
      if (!groupMeta || !groupMeta.participants) continue;

      // Variant + digit sets for every current participant
      const currentVariants = new Set();
      const currentDigits = new Set();
      for (const p of groupMeta.participants) {
        if (!p.id) continue;
        currentJidsAdd(currentVariants, currentDigits, p.id);
      }

      // Prune: roster members with NO variant/digit among participants —
      // EXCEPT accepted ones: they were deliberately let in (invite may
      // still be pending); pruning them re-creates the exact
      // "accepted but not in crew" confusion this sync exists to kill
      const members = db.getCrewMembers(info.jid) || {};
      for (const memberJid of Object.keys(members)) {
        if (memberJid === sock.user?.id) continue;
        if (members[memberJid].accepted === true) continue;
        const memberVariants = buildComparableIds(memberJid);
        const memberNum = memberJid.split(':')[0].split('@')[0].replace(/\D/g, '');
        const stillThere = memberVariants.some(v => currentVariants.has(v)) ||
          (memberNum && currentDigits.has(memberNum));
        if (!stillThere) {
          db.removeCrewMember(info.jid, memberJid);
          pruned++;
          console.log(`[CREW SYNC] Pruned ${memberJid.split('@')[0]} (left ${abbrev})`);
        }
      }

      // Add: current non-admin participants who aren't in the crew DB yet
      for (const p of groupMeta.participants) {
        const jid = p.id;
        if (!jid) continue;
        if (jid === sock.user?.id) continue;
        if (p.admin) continue;

        // Skip if already in crew DB — JID variants + phone-digit fallback
        // covers LID/PN mismatch when mapping files are missing
        const jidVariants = buildComparableIds(jid);
        const alreadyInCrew = jidVariants.some(v => db.getCrewMember(info.jid, v));
        if (alreadyInCrew) continue;

        const incomingNum = jid.split(':')[0].split('@')[0].replace(/\D/g, '');
        if (incomingNum) {
          const teamMembers = db.getTeam(info.jid).members || {};
          const phoneMatch = Object.keys(teamMembers).some(memberJid => {
            const memberNum = memberJid.split(':')[0].split('@')[0].replace(/\D/g, '');
            return memberNum && memberNum === incomingNum;
          });
          if (phoneMatch) continue;
        }

        db.addCrewMember(info.jid, jid, {
          role: 'member',
          joined: Date.now(),
          addedBy: 'auto-sync',
        });
        synced++;
      }
    } catch (e) {
      console.error(`[CREW SYNC] Error syncing ${abbrev}:`, e.message);
      teamErrors++;
      if (CREW_SYNC_TRANSIENT.test(e.message || '')) transientErrors++;
    }
  }

  // Boot runs can fire before the socket can serve groupMetadata — if
  // EVERY team errored, retry after 60s (max 3) before giving up.
  // Two guards keep this from torching the ladder during reconnect
  // flaps (all 4 attempts used to die inside one disconnect):
  //   1. Socket dead → don't retry at all; the next 'open' event
  //      re-schedules a boot run anyway.
  //   2. All errors transient (Connection Closed etc.) → retry at no
  //      penalty, capped separately so a flapping-but-open socket
  //      can't loop forever.
  const teamCount = Object.keys(teamMap).length;
  if (teamCount > 0 && teamErrors === teamCount) {
    const wsOpen = (_crewSyncSock || sock)?.ws?.readyState === 1;
    if (!wsOpen) {
      console.log('[CREW SYNC] socket not open — waiting for reconnect instead of retrying');
      return { synced, pruned, teamErrors };
    }
    if (transientErrors === teamErrors && _transient < 5) {
      console.log(`[CREW SYNC] all ${teamCount} teams hit transient network errors — retrying in 60s (no penalty, ${_transient + 1}/5)`);
      setTimeout(() => {
        syncCrewRosters(_crewSyncSock || sock, _retry, _transient + 1).catch(e =>
          console.error('[CREW SYNC] retry failed:', e.message));
      }, 60 * 1000).unref();
      return { synced, pruned, teamErrors, retried: true };
    }
    if (_retry < 3) {
      console.log(`[CREW SYNC] all ${teamCount} teams errored — retrying in 60s (attempt ${_retry + 2}/4)`);
      setTimeout(() => {
        syncCrewRosters(_crewSyncSock || sock, _retry + 1).catch(e =>
          console.error('[CREW SYNC] retry failed:', e.message));
      }, 60 * 1000).unref();
      return { synced, pruned, teamErrors, retried: true };
    }
  }

  // Sync writes must survive restarts — never ride the debounced flush
  try { db.flushCrew(); } catch (e) {}

  if (synced > 0 || pruned > 0) {
    console.log(`[CREW SYNC] +${synced} added, -${pruned} pruned across ${Object.keys(teamMap).length} teams`);
  }
  return { synced, pruned };
}

function currentJidsAdd(variantSet, digitSet, jid) {
  variantSet.add(jid);
  try {
    const { buildComparableIds } = require('./utils/jidHelper');
    for (const v of buildComparableIds(jid)) variantSet.add(v);
  } catch (e) {}
  const num = String(jid).split(':')[0].split('@')[0].replace(/\D/g, '');
  if (num) digitSet.add(num);
}

async function startBot() {
  const sessionFolder = `./${config.sessionName}`;
  const sessionFile = path.join(sessionFolder, 'creds.json');

  // Check if sessionID is provided and process KAMI! or KnightBot! format session
  if (config.sessionID && (config.sessionID.startsWith('KAMI!') || config.sessionID.startsWith('KnightBot!'))) {
    try {
      const [header, b64data] = config.sessionID.split('!');

      if (!b64data) {
        throw new Error("❌ Invalid session format. Expected 'KAMI!.....' or 'KnightBot!.....'");
      }

      const cleanB64 = b64data.replace('...', '');
      const compressedData = Buffer.from(cleanB64, 'base64');
      const decompressedData = zlib.gunzipSync(compressedData);

      // Ensure session folder exists
      if (!fs.existsSync(sessionFolder)) {
        fs.mkdirSync(sessionFolder, { recursive: true });
      }

      // Write decompressed session data to creds.json
      fs.writeFileSync(sessionFile, decompressedData, 'utf8');
      console.log('📡 Session : 🔑 Retrieved from session');

    } catch (e) {
      console.error('📡 Session : ❌ Error processing session:', e.message);
      // Continue with normal QR flow if session processing fails
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  // fetchLatestBaileysVersion() does outbound HTTP with no timeout — a hung request
  // stalls startBot forever (zombie at boot). Race it; on timeout/error fall back to
  // Baileys' bundled default version (undefined → makeWASocket picks DEFAULT_VERSION).
  let version;
  try {
    ({ version } = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('version fetch timed out after 15s')), 15000)),
    ]));
  } catch (e) {
    console.warn(`⚠️ Version fetch failed (${e.message}) — using Baileys default`);
    version = undefined;
  }

  // Use suppressed logger for socket
  const suppressedLogger = createSuppressedLogger('silent');

  const sock = makeWASocket({
    version, // explicit WA Web version negotiated with the server
    logger: suppressedLogger,
    printQRInTerminal: false,
    // Use a common desktop browser signature
    browser: ['Chrome', 'Windows', '10.0'],
    auth: state,
    // Memory optimization: prevent loading old messages into RAM
    syncFullHistory: false,
    downloadHistory: false,
    markOnlineOnConnect: false,
    getMessage: async () => undefined // Don't load messages from store
  });

  // === AUTO-CLEANUP WRAPPER ===
  // Wrap sendMessage to delete temp files after every media send
  const { cleanupTempFiles } = require('./utils/cleanup');
  const originalSendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, content, options) => {
    const hasMedia = content && (
      content.image || content.video || content.audio ||
      content.document || content.sticker || content.gif
    );
    try {
      const result = await originalSendMessage(jid, content, options);
      return result;
    } finally {
      if (hasMedia) {
        setTimeout(() => cleanupTempFiles(), 500);
      }
    }
  };

  // Bind store to socket
  store.bind(sock.ev);

  // Watchdog for inactive socket (Baileys bug fix)
  let lastActivity = Date.now();
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  // Update on every message
  sock.ev.on('messages.upsert', () => {
    lastActivity = Date.now();
  });

  // Check every 5 min
  const watchdogInterval = setInterval(async () => {
    const wsState = sock.ws ? sock.ws.readyState : 3; // missing ws = dead socket
    // readyState 3 (CLOSED) with no close event = Baileys zombie: the socket is
    // gone but nothing queues a reconnect.
    if (wsState === 3) {
      console.log('⚠️ WebSocket dead without close event. Forcing reconnect...');
      clearInterval(watchdogInterval);
      scheduleReconnect(5000, 'WATCHDOG');
      return;
    }
    // OPEN but silent — do NOT blindly end()+reconnect: tearing down a healthy
    // socket races WhatsApp's server-side teardown of the old connection and
    // produces Stream Errored (conflict) → 401 cascade → (previously) session
    // wipe. Verify with a real server roundtrip first; keep the socket if alive.
    if (wsState === 1 && Date.now() - lastActivity > INACTIVITY_TIMEOUT) {
      console.log('⚠️ No activity for 30min — health-checking socket...');
      try {
        await Promise.race([
          sock.sendPresenceUpdate('available'),
          new Promise((_, rej) => setTimeout(() => rej(new Error('ping timeout')), 15000))
        ]);
        lastActivity = Date.now();
        console.log('✅ Socket healthy despite silence — keeping connection.');
        return;
      } catch (pingErr) {
        console.log(`⚠️ Health check failed (${pingErr.message}). Forcing reconnect...`);
        clearInterval(watchdogInterval);
        // Only end() a live socket — end() on a CLOSED ws throws. The close event
        // (if it fires) queues the standard reconnect; scheduleReconnect is shared,
        // so a double-fire can't spawn two sockets (440 conflict).
        await sock.end(undefined, undefined, { reason: 'inactive' }).catch(() => {});
        scheduleReconnect(5000, 'WATCHDOG');
      }
    }
  }, 5 * 60 * 1000); // Every 5 min check

  // Clear on close/open
  sock.ev.on('connection.update', (update) => {
    const { connection } = update;
    if (connection === 'open') {
      lastActivity = Date.now(); // Reset on open
      sessionRetryCount = 0; // Successful connect clears accumulated session-retry count
      logConnEvent({ event: 'open' });
    } else if (connection === 'close') {
      clearInterval(watchdogInterval);
    }
  });

  // Connection update handler
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n⚠️ Scan this QR code in WhatsApp → Linked Devices:\n');
      qrcode.generate(qr, { small: true });
      // Also save QR as image for panel/console that can't render ASCII
      try {
        const QRCode = require('qrcode');
        const qrPath = path.join(__dirname, 'qr.png');
        await QRCode.toFile(qrPath, qr, { width: 400, margin: 2 });
        console.log(`📸 QR saved to: ${qrPath} (download from panel Files tab if console is garbled)\n`);
      } catch (_) {}
      if (qr !== lastLoggedQr) {
        lastLoggedQr = qr;
        logConnEvent({ event: 'qr' });
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || 'Unknown error';
      logConnEvent({ event: 'close', statusCode: statusCode ?? null, message: errorMessage });

      // 401 = loggedOut (session genuinely dead — the ONLY case allowed to delete it),
      // 440 / conflict = transient (another connection replaced ours, e.g. reconnect
      // overlap) — must never touch the session, just retry.
      const isLoggedOut = statusCode === 401;
      const isTransient = statusCode === 440 || errorMessage.includes('conflict');

      if (isLoggedOut || isTransient) {
        sessionRetryCount = (sessionRetryCount || 0) + 1;
        const retryDelay = Math.min(10000 * sessionRetryCount, 60000);
        console.log(`⚠️ Session issue (${statusCode}) — retry ${sessionRetryCount}/8 in ${retryDelay / 1000}s...`);
        logConnEvent({ event: 'session-retry', attempt: sessionRetryCount, statusCode });

        if (sessionRetryCount >= 8 && isLoggedOut && !isTransient) {
          // Only a GENUINE logged-out (401 without conflict semantics) may wipe.
          // WhatsApp sends code=401 on conflict stream errors too (server's
          // node.attrs.code overrides Baileys' CODE_MAP — see generics.js:289),
          // so a 401 whose message mentions conflict is transient: the session
          // is still valid and deleting it forces an unnecessary re-scan.
          console.log('\n❌ Session logged out after 8 retries — backing up + clearing session files for fresh QR...');
          logConnEvent({ event: 'session-cleared', afterRetries: sessionRetryCount });
          try {
            const sessionPath = path.join(__dirname, config.sessionName);
            if (fs.existsSync(sessionPath)) {
              // Back up first — if the 401 was a false kill, creds can be restored
              // by hand (rename the .bak-<ts> folder back to <sessionName>)
              let backedUp = false;
              try {
                const bakPath = `${sessionPath}.bak-${Date.now()}`;
                fs.renameSync(sessionPath, bakPath);
                backedUp = true;
                console.log('💾 Session backed up to:', path.basename(bakPath));
                // Prune old backups, keep newest 2
                try {
                  const parent = path.dirname(sessionPath);
                  const base = path.basename(sessionPath);
                  const baks = fs.readdirSync(parent)
                    .filter(d => d.startsWith(base + '.bak-'))
                    .sort();
                  while (baks.length > 2) {
                    fs.rmSync(path.join(parent, baks.shift()), { recursive: true, force: true });
                  }
                } catch {}
              } catch (e) {
                console.error('Backup failed:', e.message);
              }
              if (!backedUp) {
                fs.rmSync(sessionPath, { recursive: true, force: true });
              }
              console.log('🗑️  Session cleared. Restart to get a new QR code.\n');
            }
          } catch (e) {
            console.error('Failed to clear session:', e.message);
          }
          process.exit(1);
        }

        if (sessionRetryCount >= 8) {
          // Transient conflict exhausted retries — session is still valid, keep it.
          console.log('⚠️ Repeated connection conflicts — session kept, retrying...');
          logConnEvent({ event: 'conflict-retries-exhausted' });
          sessionRetryCount = 0;
        }

        scheduleReconnect(retryDelay, 'CONFLICT');
        return;
      }
      // Reset retry counter on successful or non-session-related close
      sessionRetryCount = 0;

      // Always reconnect unless explicitly logged out (QR needed)
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      // Suppress verbose error output for common stream errors (515, etc.)
      if (statusCode === 515 || statusCode === 503 || statusCode === 408) {
        console.log(`⚠️ Connection closed (${statusCode}). Reconnecting...`);
      } else {
        console.log('Connection closed due to:', errorMessage, '\nReconnecting:', shouldReconnect);
      }

      if (shouldReconnect) {
        scheduleReconnect(3000, 'RECONNECT');
      } else {
        console.log('\n⚠️ Session expired. QR code will appear on next restart.');
        console.log('   Restart the bot from the panel to re-pair.\n');
      }
    } else if (connection === 'open') {
      try {
      console.log('\n');
      console.log('╔════════════════════════════════════╗');
      console.log('║      💀 KAMI BOT CONNECTED 💀      ║');
      console.log('╚════════════════════════════════════╝');
      console.log('');
      console.log(`📱 Number: ${sock.user.id.split(':')[0]}`);
      console.log(`🤖 Name: ${config.botName}`);
      console.log(`⚡ Prefix: ${config.prefix}`);
      const ownerNames = Array.isArray(config.ownerName) ? config.ownerName.join(',') : config.ownerName;
      console.log(`👑 Owner: ${ownerNames}`);
      console.log('');
      console.log('💀 KAMI Bot is ready!\n');

      // Set bot status
      if (config.autoBio) {
        await sock.updateProfileStatus(`${config.botName} | Active 24/7`);
      }

      // Auto-unblock owner + approved numbers on startup
      try {
        const unblockAll = [...(config.ownerNumber || [])];
        try {
          const db = require('./database');
          const settings = db.getGlobalSettings();
          if (settings.approvedNumbers) unblockAll.push(...settings.approvedNumbers);
        } catch (e) {}
        for (const num of unblockAll) {
          const cleanNum = num.replace(/\D/g, '');
          const jid1 = cleanNum + '@s.whatsapp.net';
          const jid2 = cleanNum + '@lid';
          try { await sock.updateBlockStatus(jid1, 'unblock'); } catch (e) {}
          try { await sock.updateBlockStatus(jid2, 'unblock'); } catch (e) {}
        }
        console.log(`✅ Unblocked ${unblockAll.length} numbers on startup`);
      } catch (e) {}

      // Crew sync — groups are the source of truth for rosters.
      // First run 60s after connect (the socket can't serve groupMetadata
      // the instant 'open' fires), then every 30 min (registered once
      // across reconnects).
      try {
        _crewSyncSock = sock;
        setTimeout(() => {
          syncCrewRosters(sock).catch(e =>
            console.error('[CREW SYNC] boot run failed:', e.message));
        }, 60 * 1000).unref();
        if (!_crewSyncTimer) {
          _crewSyncTimer = setInterval(() => {
            syncCrewRosters(_crewSyncSock || sock).catch(e =>
              console.error('[CREW SYNC] periodic run failed:', e.message));
          }, 30 * 60 * 1000);
          _crewSyncTimer.unref();
        }
      } catch (e) {
        console.error('[CREW SYNC] boot run failed:', e.message);
      }

      // Event unpin sweep — ended meets release their pinned cards.
      // startEventUnpinSweep self-guards (registered once across reconnects).
      try {
        require('./commands/crew/eventRsvp').startEventUnpinSweep(sock);
      } catch (e) {
        console.error('[EVWIZ] unpin sweep boot failed:', e.message);
      }

      // Team admin auto-detection — scan all crew groups for WhatsApp admins
      try {
        const db = require('./database');
        const currentAdminsByGroup = {};
        let detected = 0;
        let scanFailures = 0;

        // Scan all teams from config + teamMap
        const allTeams = { ...(config.crewTeams || {}) };
        const crewData = db.getCrew();
        for (const [abbrev, info] of Object.entries(crewData.teamMap || {})) {
          if (!allTeams[abbrev]) allTeams[abbrev] = info;
        }

        for (const [teamKey, teamInfo] of Object.entries(allTeams)) {
          try {
            const meta = await sock.groupMetadata(teamInfo.jid);
            if (!meta || !meta.participants) {
              scanFailures++;
              continue;
            }

            const admins = meta.participants
              .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
              .map(p => p.id);

            currentAdminsByGroup[teamInfo.jid] = admins;

            for (const adminJid of admins) {
              const number = adminJid.replace(/@.*$/, '');
              const added = db.addTeamAdmin(number);
              if (added) detected++;
              // Track which teams each admin belongs to
              db.addTeamAdminTeam(number, teamKey);
            }
          } catch (e) {
            scanFailures++;
            console.error(`[TEAM ADMIN SYNC] Error scanning ${teamKey}:`, e.message);
          }
        }

        // Prune: remove anyone no longer admin in ANY crew group.
        // NEVER prune unless EVERY group scanned cleanly — even one failed
        // scan would wipe admins who are only admin in that group (one
        // disconnect wiped 9 admins this way). Detection above is additive
        // and safe; only the destructive prune is gated.
        const totalTeams = Object.keys(allTeams).length;
        if (totalTeams > 0 && scanFailures === 0) {
          const pruned = db.pruneTeamAdmins(currentAdminsByGroup);
          if (pruned > 0) {
            console.log(`[TEAM ADMIN SYNC] Pruned ${pruned} former team admins`);
          }
        } else if (scanFailures > 0) {
          console.log(`[TEAM ADMIN SYNC] Skipping prune — ${scanFailures}/${totalTeams} group scans failed`);
        }

        if (detected > 0) {
          console.log(`[TEAM ADMIN SYNC] Auto-detected ${detected} team admins`);
        }
      } catch (e) {}

      // Start auto-progression engine (auto-promotes members based on activity)
      try {
        const autoProgression = require('./utils/autoProgression');
        autoProgression.startProgressionEngine(sock);
      } catch (e) {
        console.error('[AUTO-PROGRESSION] Failed to start engine:', e.message);
      }

      // Initialize anti-call feature
      handler.initializeAntiCall(sock, handler.isOwner);

      // Cleanup old chats (keep only active ones, e.g., last touched <1 day)
      const now = Date.now();
      for (const [jid, chatMsgs] of store.messages.entries()) {
        const timestamps = Array.from(chatMsgs.values()).map(m => m.messageTimestamp * 1000 || 0);
        if (timestamps.length > 0 && now - Math.max(...timestamps) > 24 * 60 * 60 * 1000) { // 1 day old chat
          store.messages.delete(jid);
        }
      }
      console.log(`🧹 Store cleaned. Active chats: ${store.messages.size}`);
      } catch (openErr) {
        console.error('[CONNECTION] Error in connection open handler:', openErr.message);
      }
    }
  });

  // Credentials update handler
  sock.ev.on('creds.update', saveCreds);

  // Snipe store — capture deleted messages
  try {
    const snipeStore = require('./utils/snipeStore');
    sock.ev.on('messages.update', (updates) => {
      for (const update of updates) {
        if (update.update.message === null && update.key?.remoteJid) {
          const jid = update.key.remoteJid;
          if (!jid.endsWith('@g.us')) continue;
          const deletedBy = update.key.participant || update.key.remoteJid;
          // Find the original message from store
          try {
            const chatMsgs = store.messages.get(jid);
            if (chatMsgs) {
              const origMsg = chatMsgs.get(update.key.id);
              if (origMsg) {
                const content = origMsg.message?.conversation || origMsg.message?.extendedTextMessage?.text || '[media/other]';
                snipeStore.add(jid, {
                  sender: origMsg.key.participant || origMsg.key.remoteJid,
                  content,
                  deletedBy,
                  time: Date.now(),
                  type: require('./utils/snipeStore').constructor.detectType(origMsg)
                });
              }
            }
          } catch (e) {}
        }
      }
    });
  } catch (e) { console.error('[SNIPE] init error:', e.message); }

  // System JID filter - checks if JID is from broadcast/status/newsletter
  const isSystemJid = (jid) => {
    if (!jid) return true;
    return jid.includes('@broadcast') ||
      jid.includes('status.broadcast') ||
      jid.includes('@newsletter') ||
      jid.includes('@newsletter.');
  };

  // Messages handler - Process only new messages
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    // Only process "notify" type (new messages), skip "append" (old messages from history)
    if (type !== 'notify') return;

    // Process messages in the array
    for (const msg of messages) {
      // Skip if message is invalid or missing key
      if (!msg.message || !msg.key?.id) continue;

      const from = msg.key.remoteJid;
      if (!from) {
        continue;
      }

      // HD/album companions — logs confirm WhatsApp's dual-upload model
      const assocHolder = msg.message.ephemeralMessage?.message
        || msg.message.viewOnceMessageV2?.message
        || msg.message;
      if (assocHolder?.messageAssociation) {
        const a = assocHolder.messageAssociation;
        console.log(`[ASSOC] type=${Number(a.associationType)} parent=${a.parentMessageKey?.id || '-'} chat=${from}`);
      }

      // System message filter - ignore broadcast/status/newsletter messages
      if (isSystemJid(from)) {
        continue; // Silently ignore system messages
      }

      // Deduplication: Skip if message has already been processed
      const msgId = msg.key.id;
      if (processedMessages.has(msgId)) continue;

      // Timestamp validation: Only process messages within last 5 minutes
      const MESSAGE_AGE_LIMIT = 5 * 60 * 1000; // 5 minutes in milliseconds
      let messageAge = 0;
      if (msg.messageTimestamp) {
        messageAge = Date.now() - (msg.messageTimestamp * 1000);
        if (messageAge > MESSAGE_AGE_LIMIT) {
          // Message is too old, skip processing
          continue;
        }
      }

      // Mark message as processed
      processedMessages.add(msgId);

      // Store message FIRST (before processing)
      // from already defined above in DM block check
      if (msg.key && msg.key.id) {
        if (!store.messages.has(from)) {
          store.messages.set(from, new Map());
        }
        const chatMsgs = store.messages.get(from);
        chatMsgs.set(msg.key.id, msg);

        // Cleanup: Keep only last 20 per chat (reduced from 200)
        if (chatMsgs.size > store.maxPerChat) {
          // Remove oldest messages
          const sortedIds = Array.from(chatMsgs.entries())
            .sort((a, b) => (a[1].messageTimestamp || 0) - (b[1].messageTimestamp || 0))
            .map(([id]) => id);
          for (let i = 0; i < sortedIds.length - store.maxPerChat; i++) {
            chatMsgs.delete(sortedIds[i]);
          }
        }
      }

      // Process command IMMEDIATELY (don't block on other operations)
      handler.handleMessage(sock, msg).catch(err => {
        if (!err.message?.includes('rate-overlimit')) {
          console.error('Error handling message:', err.message);
        }
      });

      // Do other operations in background (non-blocking)
      setImmediate(async () => {
        if (config.autoRead && from.endsWith('@g.us')) {
          try {
            await sock.readMessages([msg.key]);
          } catch (e) {
            // Silently handle
          }
        }
        if (from.endsWith('@g.us')) {
          try {
            const groupMetadata = await handler.getGroupMetadata(sock, msg.key.remoteJid);
            if (groupMetadata) {
              await handler.handleAntilink(sock, msg, groupMetadata);
            }
          } catch (error) {
            // Silently handle
          }
        }
      });
    }
  });

  // Message receipt updates (silently handled, no logging)
  sock.ev.on('message-receipt.update', () => {
    // Silently handle receipt updates
  });

  // Message updates (silently handled, no logging)
  sock.ev.on('messages.update', () => {
    // Silently handle message updates
  });

  // Group participant updates (join/leave)
  sock.ev.on('group-participants.update', async (update) => {
    await handler.handleGroupUpdate(sock, update);
  });

  // Group settings updates (mute/unmute via WhatsApp UI)
  sock.ev.on('group-settings-update', async (update) => {
    try {
      const { jid, actor, announce } = update;
      if (!jid || !actor) return;

      // announce = true means group was MUTED, false means UNMUTED
      const wasMuted = announce === true;
      const wasUnmuted = announce === false;

      if (!wasUnmuted) return; // only care about unmutes

      // Check if this group is owner-muted
      if (!database.isOwnerMuted(jid)) return;

      // Check if the person who unmuted is the owner
      const actorNum = actor.split(':')[0].split('@')[0].replace(/\D/g, '');
      const isActorOwner = (config.ownerNumber || []).some(n => n.replace(/\D/g, '') === actorNum);

      if (isActorOwner) {
        // Owner unmuted — clear the owner-muted flag
        database.clearOwnerMuted(jid);
        return;
      }

      // Someone other than owner unmuted — warn and re-mute if bot is admin
      const botIsAdmin = await handler.isAdmin(sock, sock.user?.id, jid, null);
      if (botIsAdmin) {
        try {
          await sock.groupSettingUpdate(jid, 'announcement');
          await sock.sendMessage(jid, {
            text: `🚫 *NICE TRY HEH* 💀\n\n@${actorNum} tried to unmute the group\nOwner-only move, boet — I put it straight back\nYou really thought hey 😭`,
            mentions: [actor],
          });
        } catch (e) {
          console.error('[GROUP SETTINGS] Failed to re-mute:', e.message);
        }
      } else {
        await sock.sendMessage(jid, {
          text: `⚠️ *GROUP OPENED UP*\n\n@${actorNum} unmuted the group outside the bot\n_So the mute protection got bypassed — I'm not admin here_\n_Get KAMI to make me admin again hey_`,
          mentions: [actor],
        });
      }
    } catch (e) {
      console.error('[GROUP SETTINGS UPDATE] Error:', e.message);
    }
  });

  // Handle errors - suppress common stream errors
  sock.ev.on('error', (error) => {
    const statusCode = error?.output?.statusCode;
    // Suppress verbose output for common stream errors
    if (statusCode === 515 || statusCode === 503 || statusCode === 408) {
      // These are usually temporary connection issues, handled by reconnection
      return;
    }
    console.error('Socket error:', error.message || error);
  });

  return sock;
}
// Start the bot
console.log('🚀 Starting WhatsApp MD Bot...\n');

// Load saved prefix from database (overrides config.js default)
const database = require('./database');
const savedPrefix = database.getPrefix();
if (savedPrefix) {
  config.prefix = savedPrefix;
  console.log(`📌 Loaded saved prefix: ${savedPrefix}`);
}

console.log(`📦 Bot Name: ${config.botName}`);
console.log(`⚡ Prefix: ${config.prefix}`);
const ownerNames = Array.isArray(config.ownerName) ? config.ownerName.join(',') : config.ownerName;
console.log(`👑 Owner: ${ownerNames}\n`);

// Clean caches to prevent disk bloat on panels
function cleanupBotCache() {
  const home = os.homedir();
  const targets = [
    path.join(home, '.cache', 'puppeteer'),
    path.join(home, '.cache', 'sharp'),
    path.join(home, '.npm'),
    path.join(home, '.cache', 'canvas'),
    '/tmp/sharp-*',
    '/tmp/canvas-*',
  ];
  let totalFreed = 0;
  for (const target of targets) {
    try {
      if (!fs.existsSync(target)) continue;
      const stat = fs.statSync(target);
      if (!stat.isDirectory()) {
        totalFreed += stat.size;
        fs.unlinkSync(target);
        continue;
      }
      const sz = getDirSize(target);
      fs.rmSync(target, { recursive: true, force: true });
      totalFreed += sz;
    } catch {}
  }
  // Also nuke npm/_cacache which rebuilds each deploy
  try {
    const cachePath = path.join(home, '.npm', '_cacache');
    if (fs.existsSync(cachePath)) {
      totalFreed += getDirSize(cachePath);
      fs.rmSync(cachePath, { recursive: true, force: true });
    }
  } catch {}
  if (totalFreed > 0) {
    console.log(`🧹 Cache cleanup — freed ${(totalFreed / 1024 / 1024).toFixed(1)}MB`);
  }
}
function getDirSize(dir) {
  let size = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) size += getDirSize(p);
      else try { size += fs.statSync(p).size; } catch {}
    }
  } catch {}
  return size;
}
cleanupBotCache();

// Keepalive — prevents the event loop from draining between reconnects
// Without this, the process exits during the setTimeout gap before startBot() runs again
setInterval(() => {}, 300000); // 5-min no-op keeps Node alive

startBot().catch(err => {
  console.error('Error starting bot:', err);
  process.exit(1);
});
// Handle process termination
process.on('uncaughtException', (err) => {
  // Handle ENOSPC errors gracefully without crashing
  if (err.code === 'ENOSPC' || err.errno === -28 || err.message?.includes('no space left on device')) {
    console.error('⚠️ ENOSPC Error: No space left on device. Attempting cleanup...');
    const { cleanupOldFiles } = require('./utils/cleanup');
    cleanupOldFiles();
    console.warn('⚠️ Cleanup completed. Bot will continue but may experience issues until space is freed.');
    return; // Don't crash, just log and continue
  }
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (err) => {
  // Handle ENOSPC errors gracefully
  if (err.code === 'ENOSPC' || err.errno === -28 || err.message?.includes('no space left on device')) {
    console.warn('⚠️ ENOSPC Error in promise: No space left on device. Attempting cleanup...');
    const { cleanupOldFiles } = require('./utils/cleanup');
    cleanupOldFiles();
    console.warn('⚠️ Cleanup completed. Bot will continue but may experience issues until space is freed.');
    return; // Don't crash, just log and continue
  }

  // Don't spam console with rate limit errors
  if (err.message && err.message.includes('rate-overlimit')) {
    console.warn('⚠️ Rate limit reached. Please slow down your requests.');
    return;
  }
  console.error('Unhandled Rejection:', err);
});

// Flush DB cache on shutdown
const _flushAndExit = () => {
  try {
    const db = require('./database');
    db.flushAll();
    console.log('💾 Database cache flushed to disk');
  } catch (e) {}
  process.exit(0);
};
process.on('SIGINT', _flushAndExit);
process.on('SIGTERM', _flushAndExit);

// Export store for use in commands
module.exports = { store };