/**
 * Event card + RSVP — extracted from eventWizard.js (≤500-line house rule).
 *
 * renderEventCard: the owner's mock, word-first labels (ID stays emoji-only
 * — "ID 🆔" would be redundant). Time line: "20:30 – 22:30" when both ends
 * known, "now-now (2h)" for timeless-with-duration, bare start otherwise,
 * omitted when fully skipped.
 *
 * evrsvp: — explicit event ids (`evrsvp:in:EV-XXXXX`), never positional.
 * NOT admin-gated: the whole crew RSVPs. Resolves the event across all
 * groups so forwarded cards work from any chat; LID/phone jid variants
 * of the same human never double-count.
 */

const config = require('../../config');
const database = require('../../database');
const { onButton } = require('../../utils/buttonHelper');
const { buildComparableIds } = require('../../utils/jidHelper');
const { mention } = require('../../utils/format');
const { serverByKey, templateByKey, fmtDuration } = require('./cpmData');

const prefix = () => config.prefix || '.';

function renderEventCard(eventId, evt, attendeeCount) {
  const sv = evt.serverKey ? serverByKey(evt.serverKey) : null;
  let text =
    `━━━━━━━━━━━━━━━━\n` +
    `${evt.templateKey && templateByKey(evt.templateKey) ? templateByKey(evt.templateKey).emoji : '🏁'} *${evt.name}*\n` +
    `━━━━━━━━━━━━━━━━\n\n`;
  if (evt.host) text += `*HOST* 👤: ${evt.host}\n`;
  if (evt.cpmId) text += `*ID* 🆔: ${evt.cpmId}\n`;
  if (sv) text += `*SERVER* 🌐: ${sv.flag} ${sv.name}\n`;
  if (evt.carType) text += `*CARS* 🚗: ${evt.carType}\n`;
  if (evt.time) {
    text += `*TIME* ⏰: ${evt.time}${evt.endTime ? ` – ${evt.endTime}` : ''}\n`;
  } else if (evt.durationMins) {
    text += `*TIME* ⏰: now-now (${fmtDuration(evt.durationMins)})\n`;
  }
  // Tag who's pulling up — @renders tap the person, mentions array makes it live
  const going = Array.isArray(evt.attendees) ? evt.attendees : [];
  if (going.length) {
    text += `\n👥 *GOING (${going.length}):* ${going.map(a => mention(a)).join(' ')}\n`;
  } else {
    text += `\n👥 ${attendeeCount} going so far\n`;
  }
  // Off-template custom car — the host's call, but flag it
  if (evt.templateKey && evt.customCar) {
    const tpl = templateByKey(evt.templateKey);
    if (tpl && !tpl.carOptions.includes(evt.carType)) {
      text += `\n_⚠️ off-template rule, host's call_\n`;
    }
  }
  text += `\n_Tap ✅ if you're pulling — or ${prefix()}attend ${eventId}_`;
  return text;
}

// Event ids are unique — search every group so forwarded/DM taps resolve
function resolveEventById(eventId, preferredGroupJid) {
  if (preferredGroupJid && String(preferredGroupJid).endsWith('@g.us')) {
    const team = database.getTeam(preferredGroupJid);
    if (team?.events?.[eventId]) return { groupJid: preferredGroupJid, team };
  }
  for (const [gid, team] of Object.entries(database.getAllTeams() || {})) {
    if (team?.events?.[eventId]) return { groupJid: gid, team };
  }
  return null;
}

onButton('evrsvp:', async (sock, msg, from, sender, btnId) => {
  try {
    const [action, eventId] = btnId.slice('evrsvp:'.length).split(':');
    if ((action !== 'in' && action !== 'out') || !eventId) return;

    const found = resolveEventById(eventId, from);
    if (!found) {
      return sock.sendMessage(from, {
        text: `⚠️ That event is gone, hey — check ${prefix()}events for what's coming up.`,
      });
    }
    const evt = found.team.events[eventId];
    if (evt.status && evt.status !== 'upcoming') {
      return sock.sendMessage(from, { text: `❌ *${evt.name}* is done and dusted, boet.` });
    }
    if (!Array.isArray(evt.attendees)) evt.attendees = [];

    // LID-safe dedupe — the same human tapping from phone and LID jids
    // must not double-count (pre-existing attend.js bug class)
    const variants = buildComparableIds(sender);
    const isAttending = evt.attendees.some(a => buildComparableIds(a).some(v => variants.includes(v)));

    if (action === 'in') {
      if (!isAttending) {
        evt.attendees.push(sender);
        database.updateTeam(found.groupJid, found.team);
      }
      return sock.sendMessage(from, {
        text: `✅ ${mention(sender)} locked in for *${evt.name}*${evt.time ? ` at *${evt.time}*` : ''} — *${evt.attendees.length}* going so far`,
        mentions: [sender],
      });
    } else {
      if (isAttending) {
        evt.attendees = evt.attendees.filter(a => !buildComparableIds(a).some(v => variants.includes(v)));
        database.updateTeam(found.groupJid, found.team);
      }
      return sock.sendMessage(from, {
        text: `👋 ${mention(sender)} is out of *${evt.name}* — *${evt.attendees.length}* still going`,
        mentions: [sender],
      });
    }
  } catch (e) {
    console.error('[EVWIZ] rsvp error:', e.message);
  }
});

// ── Unpin sweep ──────────────────────────────────────────────
// The DB lazy-sweep flips ended events to 'completed', but the WhatsApp
// pin lasts 24h regardless — a 2-hour meet's card would sit pinned
// until it expired. Every 5 min this walks all crews: getCrewEvents() reuses
// the lazy expiry flip (no duplicated endAt logic), then any completed
// event still holding a pin gets UNPIN_FOR_ALL (type 2). Records
// published before pinnedMsgId existed are skipped — nothing to target.
// Failed unpins (bot lost admin, message deleted) retry 3x then give
// up silently rather than nagging the console forever.
const UNPIN_SWEEP_MS = 5 * 60 * 1000;
const UNPIN_MAX_TRIES = 3;

async function sweepExpiredPins(sock) {
  for (const [gid, team] of Object.entries(database.getAllTeams() || {})) {
    if (!team?.events || !Object.keys(team.events).length) continue;
    const events = database.getCrewEvents(gid); // lazy-flips ended → completed
    let dirty = false;
    for (const [eventId, evt] of Object.entries(events)) {
      if (evt.status !== 'completed') continue;
      if (!evt.pinnedMsgId || evt.unpinnedAt) continue;
      if ((evt.unpinTries || 0) >= UNPIN_MAX_TRIES) continue;
      try {
        // Baileys v7: pin IS the message key, type sits top-level
        await sock.sendMessage(gid, {
          pin: { remoteJid: gid, id: evt.pinnedMsgId, fromMe: true },
          type: 2,
        });
        evt.unpinnedAt = Date.now();
        dirty = true;
        console.log(`[EVWIZ] unpinned ${eventId} in ${gid} (event ended)`);
      } catch (e) {
        evt.unpinTries = (evt.unpinTries || 0) + 1;
        dirty = true;
        console.error(`[EVWIZ] unpin failed for ${eventId} (try ${evt.unpinTries}/${UNPIN_MAX_TRIES}):`, e.message);
      }
    }
    if (dirty) database.updateTeam(gid, team);
  }
}

let _unpinTimer = null;
function startEventUnpinSweep(sock) {
  if (_unpinTimer) return; // registered once across reconnects (crew-sync pattern)
  const run = () => sweepExpiredPins(sock).catch(e =>
    console.error('[EVWIZ] unpin sweep failed:', e.message));
  run();
  _unpinTimer = setInterval(run, UNPIN_SWEEP_MS);
  _unpinTimer.unref();
}

module.exports = {
  renderEventCard,
  resolveEventById,
  sweepExpiredPins,
  startEventUnpinSweep,
};
