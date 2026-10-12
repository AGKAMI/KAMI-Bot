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
const { serverByKey, templateByKey, fmtDuration } = require('./cpmData');

const prefix = () => config.prefix || '.';

function renderEventCard(eventId, evt, attendeeCount) {
  const sv = evt.serverKey ? serverByKey(evt.serverKey) : null;
  let text =
    `━━━━━━━━━━━━━━━━\n` +
    `${evt.templateKey && templateByKey(evt.templateKey) ? templateByKey(evt.templateKey).emoji : '🏁'} *${evt.name}*\n` +
    `━━━━━━━━━━━━━━━━\n\n`;
  if (evt.host) text += `Host 👤: ${evt.host}\n`;
  if (evt.cpmId) text += `🆔: ${evt.cpmId}\n`;
  if (sv) text += `Server 🌐: ${sv.flag} ${sv.name}\n`;
  if (evt.carType) text += `Cars 🚗: ${evt.carType}\n`;
  if (evt.time) {
    text += `Time ⏰: ${evt.time}${evt.endTime ? ` – ${evt.endTime}` : ''}\n`;
  } else if (evt.durationMins) {
    text += `Time ⏰: now-now (${fmtDuration(evt.durationMins)})\n`;
  }
  text += `\n👥 ${attendeeCount} going so far\n`;
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
        text: `✅ Locked in for *${evt.name}*${evt.time ? ` at *${evt.time}*` : ''} — *${evt.attendees.length}* going so far`,
      });
    } else {
      if (isAttending) {
        evt.attendees = evt.attendees.filter(a => !buildComparableIds(a).some(v => variants.includes(v)));
        database.updateTeam(found.groupJid, found.team);
      }
      return sock.sendMessage(from, {
        text: `👋 You're out of *${evt.name}* — *${evt.attendees.length}* still going`,
      });
    }
  } catch (e) {
    console.error('[EVWIZ] rsvp error:', e.message);
  }
});

module.exports = {
  renderEventCard,
  resolveEventById,
};
