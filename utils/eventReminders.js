/**
 * Crew event start reminders — scans every crew team's upcoming events
 * (the ones with a real HH:MM start time) and pings the group:
 *   - 30 minutes before start
 *   - at start ("it's live, pull up")
 * Flags (reminded30 / remindedNow) persist on the event record, so a
 * restart never double-fires a reminder. Timeless "now-now" events and
 * legacy records without a time are skipped.
 *
 * Wired in index.js: runs 90s after connect + every 60s after that.
 * SAST-aware via config.timezone (Africa/Johannesburg — no DST).
 */

const config = require('../config');

const TZ = config.timezone || 'Africa/Johannesburg';

function nowMinutesSAST() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  const [h, m] = parts.split(':').map(Number);
  return h * 60 + m;
}

async function checkReminders(sock) {
  // utils/ → database.js is one level up — './database' resolved to
  // utils/database (missing), so every reminder run died with
  // "Cannot find module './database'"
  const db = require('../database');
  const crew = db.getCrew();
  const teamMap = crew.teamMap || {};
  const nowMin = nowMinutesSAST();
  let fired = 0;

  for (const [abbrev, info] of Object.entries(teamMap)) {
    let events;
    try {
      events = db.getCrewEvents(info.jid) || {};
    } catch (e) {
      continue;
    }

    let dirty = false;
    for (const [eventId, evt] of Object.entries(events)) {
      if (!evt || evt.status !== 'upcoming' || !evt.time) continue;
      const [h, m] = String(evt.time).split(':').map(Number);
      if (isNaN(h) || isNaN(m)) continue;
      const startMin = h * 60 + m;
      const delta = startMin - nowMin; // minutes until start (today)

      // 30-minute warning (tolerance window so a 1-min scheduler can't skip it)
      if (!evt.reminded30 && delta >= 25 && delta <= 35) {
        evt.reminded30 = true;
        dirty = true;
        fired++;
        try {
          const mentions = (evt.attendees || []).slice(0, 20);
          await sock.sendMessage(info.jid, {
            text:
              `⏰ *30 MINUTES!* \n\n` +
              `${evt.name}${evt.carType ? ` · 🚗 ${evt.carType}` : ''} kicks off at *${evt.time}*\n` +
              `🌐 ${evt.serverKey || 'server TBC'}\n\n` +
              `_Get the lads online, boet 🏁_`,
            mentions,
          });
        } catch (e) {
          console.error(`[EVT-REMIND] 30m send failed ${abbrev}/${eventId}:`, e.message);
        }
      }

      // Start-of-event ping (2-minute window)
      if (!evt.remindedNow && delta >= 0 && delta <= 2) {
        evt.remindedNow = true;
        dirty = true;
        fired++;
        try {
          await sock.sendMessage(info.jid, {
            text:
              `🏁 *${evt.name} IS LIVE*${evt.time ? ` — *${evt.time}*` : ''}\n\n` +
              `_Host${evt.host ? `: ${evt.host}` : ''} is dropping the room — check the card for the ID 🆔_`,
          });
        } catch (e) {
          console.error(`[EVT-REMIND] live send failed ${abbrev}/${eventId}:`, e.message);
        }
      }
    }

    if (dirty) {
      try {
        db.updateTeam(info.jid, db.getTeam(info.jid));
        db.flushCrew();
      } catch (e) {
        console.error(`[EVT-REMIND] persist failed ${abbrev}:`, e.message);
      }
    }
  }
  return fired;
}

module.exports = { checkReminders };
