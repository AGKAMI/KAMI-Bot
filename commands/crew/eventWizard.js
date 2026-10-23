/**
 * CPM Event Card Wizard — interactive builder for crew meet events.
 *
 * `!event` (bare) opens a step machine IN-GROUP: TITLE → HOST 👤 →
 * ROOM ID 🆔 → SERVER 🌐 (paginated + jump, 🇿🇦 pinned) → CAR TYPE 🚗 →
 * DATE 📆 (month → day pickers, no year; defaults to today) → TIME ⏰
 * (optional, required on future dates) → DURATION ⏱️ → REVIEW → POST
 * (card hidden-tags the whole crew + auto-pins 24h). Legacy
 * `!event <name> <HH:MM>` keeps working — event.js routes to it first.
 *
 * Renders in eventRender.js, card + evrsvp + unpin sweep in eventRsvp.js.
 * Rulings: requireAdmin('ewiz') NO trailing colon; per-(group, sender)
 * sessions; reply-bound capture (stanzaId === s.lastStepId); host
 * auto-RSVP; RAM-only drafts; publish = write → card → pin (key stored
 * for the unpin sweep) → confirm; evrsvp ids explicit, crew-wide;
 * expiresAt = endAt(+48h) timed-only, endAt retires via the DB sweep.
 */

const config = require('../../config');
const database = require('../../database');
const { onButton, requireAdmin } = require('../../utils/buttonHelper');
const { buildComparableIds } = require('../../utils/jidHelper');
const { voice } = require('../../utils/format');
const {
  TEMPLATES, DEFAULT_CAR_OPTIONS, buildServerPages, serverByKey,
  templateByKey, normalizeCpmId, sanitizeEventText, TIME_RE, SERVER_RANGES, pageForKey,
  todayISO, resolveEventDate,
} = require('./cpmData');
const {
  sendStep, minsUntil, recomputeEndTime, draftToRecord,
  renderTitleStep, renderHostStep, renderIdStep, renderServerStep, renderJumpStep,
  renderCarStep, renderDateStep, renderDayStage, renderDayPageStep,
  renderTimeStep, renderDurationStep, renderReviewStep, renderEditPicker,
} = require('./eventRender');
const { renderEventCard, resolveEventById } = require('./eventRsvp');

// Forged taps bounce at the router (buttonHelper choke point)
requireAdmin('ewiz');

// ── Tunables ─────────────────────────────────────────────────
const SESSION_TTL = 30 * 60 * 1000;   // draft dies after 30 min
const TEXT_WINDOW = 3 * 60 * 1000;    // armed typed-capture window
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PIN_SECONDS = 24 * 60 * 60; // auto-pin the card for 24 hours

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const prefix = () => config.prefix || '.';

// ── Session store (RAM only — restarts cost one re-run) ──────
const sessions = new Map();           // nonce → session

const jidsMatch = (a, b) => {
  if (!a || !b) return false;
  if (a === b) return true;
  const av = buildComparableIds(a);
  const bv = buildComparableIds(b);
  return av.some(v => bv.includes(v));
};

function newNonce() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  return s;
}

function genEventId(groupJid) {
  for (let tries = 0; tries < 20; tries++) {
    let id = 'EV-';
    for (let i = 0; i < 5; i++) id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    if (!database.getCrewEvent(groupJid, id)) return id;
  }
  return 'EV-' + Date.now().toString(36).toUpperCase();
}

// TTL-aware lookup by chat + sender (variant-safe — the LID gotcha)
function _lookup(chatJid, senderJid) {
  let expired = false;
  for (const s of sessions.values()) {
    if (s.chatJid !== chatJid) continue;
    if (!jidsMatch(s.hostJid, senderJid)) continue;
    if (Date.now() - s.startedAt > SESSION_TTL) {
      sessions.delete(s.nonce);
      expired = true;
      continue;
    }
    return { s, expired: false };
  }
  return { s: null, expired };
}

const hasActiveWizard = (chatJid) => {
  for (const s of sessions.values()) {
    if (s.chatJid === chatJid && Date.now() - s.startedAt <= SESSION_TTL) return true;
  }
  return false;
};

// Silent TTL sweep (pattern: applyInteractive.js)
setInterval(() => {
  const now = Date.now();
  for (const [nonce, s] of sessions) {
    if (now - s.startedAt > SESSION_TTL) sessions.delete(nonce);
  }
}, 5 * 60 * 1000).unref();

// ── Step entry / cancel / publish ────────────────────────────
async function startWizard(sock, msg, extra) {
  const chatJid = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const groupJid = extra?.from || chatJid;

  // Restart replaces the host's own draft; other hosts coexist (nonce-routed)
  const { s: own } = _lookup(chatJid, sender);
  if (own) sessions.delete(own.nonce);

  const s = {
    nonce: newNonce(),
    chatJid,
    groupJid,
    hostJid: sender,
    hostName: msg.pushName || '',
    step: 'title',
    serverPage: 0,
    datePage: 0,
    dayMonth: null,
    dayPage: 0,
    awaiting: null,
    awaitingSince: 0,
    draft: { eventDate: todayISO() }, // default = today, pickers just override
    returnTo: null,
    strikes: 0,
    startedAt: Date.now(),
    lastRenderAt: 0,
    lastStepId: null,
    publishing: false,
  };
  sessions.set(s.nonce, s);
  console.log(`[EVWIZ] start nonce=${s.nonce} chat=${chatJid} host=${sender}`);
  return renderTitleStep(sock, s);
}

async function cancelWizard(sock, s, chatJid, quoted) {
  sessions.delete(s.nonce);
  return sock.sendMessage(chatJid, {
    text:
      `🚫 *EVENT BUILD SCRAPPED*\n\n` +
      `No stress — start fresh with ${prefix()}event anytime, ${voice.mate()}`,
  }, quoted ? { quoted } : {});
}

// `!event cancel` — cancels the sender's own draft in that chat
async function cancelWizardFor(sock, msg, extra) {
  const chatJid = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const { s } = _lookup(chatJid, sender);
  if (!s) {
    return sock.sendMessage(chatJid, {
      text: `ℹ️ No event build running for you here, boet.`,
    }, { quoted: msg });
  }
  return cancelWizard(sock, s, chatJid, msg);
}

// Publish: DB first (a card-send failure still leaves a working event),
// then card (hidden mention), 24h pin, confirm. Latch stops double-taps.
async function publishEvent(sock, s, msg) {
  if (s.publishing) return;
  s.publishing = true;
  const eventId = genEventId(s.groupJid);
  const evt = draftToRecord(s);
  evt.attendees = [s.hostJid]; // host auto-RSVP — they're hosting, they're pulling up
  database.addCrewEvent(s.groupJid, eventId, evt);
  sessions.delete(s.nonce);
  console.log(`[EVWIZ] published ${eventId} in ${s.groupJid} (${evt.name})`);

  // Hidden mention — everyone gets pinged, no @ shows in the text
  let mentions = [];
  try {
    const meta = await sock.groupMetadata(s.groupJid);
    mentions = (meta.participants || []).map(p => p.id).filter(Boolean);
  } catch (e) {
    console.error('[EVWIZ] groupMetadata failed (no mention):', e.message);
  }

  let cardMsg = null;
  try {
    cardMsg = await sendStep(sock, s, {
      text: renderEventCard(eventId, evt, evt.attendees.length),
      mentions,
      buttons: [
        { id: `evrsvp:in:${eventId}`, text: '✅ I\'M IN' },
        { id: `evrsvp:out:${eventId}`, text: '❌ I\'M OUT' },
        { id: 'again:events', text: '📅 All events' },
      ],
    });
  } catch (cardErr) {
    console.error('[EVWIZ] card send failed:', cardErr.message);
  }

  // Pin 24h (bot must be group admin); persist the card id for the unpin sweep.
  // Baileys v7: pin IS the message key, type sits TOP-LEVEL — nested no-ops.
  if (cardMsg && cardMsg.key) {
    try {
      await sock.sendMessage(s.groupJid, { pin: cardMsg.key, type: 1, time: PIN_SECONDS });
      const team = database.getTeam(s.groupJid);
      if (team?.events?.[eventId]) {
        team.events[eventId].pinnedMsgId = cardMsg.key.id;
        database.updateTeam(s.groupJid, team);
      }
      console.log(`[EVWIZ] pinned ${eventId} for ${PIN_SECONDS}s`);
    } catch (pinErr) {
      console.error('[EVWIZ] pin failed (bot admin?):', pinErr.message);
    }
  }

  try {
    await sleep(700);
    await sock.sendMessage(s.chatJid, {
      text:
        `━━━ 🏁 *EVENT LIVE* ━━━\n\n` +
        `Card's up — tag the crew and let's fill that lobby ${voice.tag('ok')}\n` +
        `_Event ID: ${eventId}_`,
    }, msg ? { quoted: msg } : {});
  } catch (e) { /* confirm is cosmetic */ }
}

// ── Text capture (armed steps) ───────────────────────────────
async function _strikeOut(sock, s, reason) {
  s.strikes++;
  if (s.strikes >= 3) {
    return cancelWizard(sock, s, s.chatJid, null);
  }
  const sent = await sock.sendMessage(s.chatJid, {
    text: `⚠️ ${reason}\n\n_${3 - s.strikes} ${s.strikes === 2 ? 'try' : 'tries'} left before I scrap this build, boet_`,
  });
  if (sent && sent.key && sent.key.id) s.lastStepId = sent.key.id; // the fix-reply owns the next answer
  return sent;
}

// Arm a typed-capture step: set `s.awaiting` first, then call — the fresh
// lastStepId makes the reply-bound (tplc/carc/durc shared shape)
async function _arm(sock, from, msg, s, awaiting, promptText) {
  s.awaiting = awaiting;
  s.awaitingSince = Date.now();
  const sent = await sock.sendMessage(from, { text: promptText }, { quoted: msg });
  if (sent && sent.key && sent.key.id) s.lastStepId = sent.key.id;
  return sent;
}

const _expiredNotice = (sock, from, msg) => sock.sendMessage(from, {
  text: `⏰ *EVENT BUILD EXPIRED*\n\nThat draft got old, boet — run ${prefix()}event again.`,
}, msg ? { quoted: msg } : {});

// A future-date meet can't be "now-now" — endAt for timeless events is
// now-relative, so skipping time on a scheduled date would corrupt it
const _isFutureDate = (s) => !!(s.draft.eventDate && s.draft.eventDate > todayISO());

/**
 * Called from handler.js BEFORE the games and group protections. Consumes
 * the host's typed answer only when a step is armed AND the message replies
 * to the current step — other chat flows through. True = consumed (return).
 */
async function captureText(sock, msg, ctx) {
  try {
    if (!ctx.isGroup || !ctx.body) return false;
    // Live prefix read — setprefix can change it mid-draft
    const p = prefix();
    if (ctx.body.startsWith(p)) return false;

    const { s, expired } = _lookup(ctx.from, ctx.sender);
    if (!s) {
      if (expired) {
        await _expiredNotice(sock, ctx.from, msg);
        return true;
      }
      return false;
    }
    if (!s.awaiting) return false;

    // Reply-bound capture — only answers quoted to the CURRENT step count
    const stanzaId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
    if (!s.lastStepId || stanzaId !== s.lastStepId) return false;

    if (Date.now() - s.awaitingSince > TEXT_WINDOW) {
      // window closed — re-arm by re-rendering the same step
      s.awaitingSince = Date.now();
      const sent = await sock.sendMessage(ctx.from, {
        text: `👂 Still on *${s.awaiting}* — go again, I'm listening (3 min back on the clock).`,
      }, { quoted: msg });
      if (sent && sent.key && sent.key.id) s.lastStepId = sent.key.id;
      return true;
    }

    const body = ctx.body.trim();
    let ok = false;

    if (s.awaiting === 'host') {
      const v = sanitizeEventText(body, 40);
      if (v) { s.draft.host = v; ok = true; }
      else { await _strikeOut(sock, s, 'That host name doesn\'t look right — text only, no emojis only.'); return true; }
    } else if (s.awaiting === 'id') {
      const v = normalizeCpmId(body);
      if (v) { s.draft.cpmId = v; ok = true; }
      else { await _strikeOut(sock, s, 'That ID doesn\'t look right — like *VR401128* or the plain in-game number.'); return true; }
    } else if (s.awaiting === 'time') {
      const lower = body.toLowerCase();
      if (lower === 'skip' || lower === 'none' || lower === 'now' || lower === 'now-now') {
        if (_isFutureDate(s)) {
          // no strike — legit answer, just not allowed on a scheduled date
          await renderTimeStep(sock, s);
          return true;
        }
        s.draft.time = null; ok = true;
      } else if (TIME_RE.test(body)) {
        s.draft.time = body; ok = true;
      } else { await _strikeOut(sock, s, 'Time must be 24hr *HH:MM* — like *20:30* — or "skip".'); return true; }
      recomputeEndTime(s); // duration may already exist from an edit
    } else if (s.awaiting === 'endtime') {
      const lower = body.toLowerCase();
      if (lower === 'skip' || lower === 'none') {
        s.draft.endTime = null; s.draft.durationMins = null; ok = true;
      } else if (TIME_RE.test(body)) {
        s.draft.endTime = body;
        if (!s.draft.time) s.draft.durationMins = minsUntil(body); // now-now: show "(Xh)" on the card
        ok = true;
      } else { await _strikeOut(sock, s, 'End time must be 24hr *HH:MM* — like *22:30* — or "skip".'); return true; }
    } else if (s.awaiting === 'title') {
      const v = sanitizeEventText(body, 32);
      if (v) { s.draft.title = v; s.draft.templateKey = null; ok = true; }
      else { await _strikeOut(sock, s, 'Title must be actual text, boet.'); return true; }
    } else if (s.awaiting === 'car') {
      const v = sanitizeEventText(body, 40);
      if (v) { s.draft.carType = v; s.draft.customCar = true; ok = true; }
      else { await _strikeOut(sock, s, 'Car type must be actual text, boet.'); return true; }
    }

    if (!ok) return false;
    s.strikes = 0;
    s.awaiting = null;

    // After an edit jump, return to review instead of the next step
    if (s.returnTo === 'review') {
      s.returnTo = null;
      await renderReviewStep(sock, s);
      return true;
    }
    switch (s.step) {
      case 'title': await renderHostStep(sock, s); return true;
      case 'host':  await renderIdStep(sock, s); return true;
      case 'id':    await renderServerStep(sock, s); return true;
      case 'car':   await renderDateStep(sock, s); return true;
      case 'time':  await renderDurationStep(sock, s); return true;
      default:      await renderReviewStep(sock, s); return true;
    }
  } catch (e) {
    console.error('[EVWIZ] capture error:', e.message);
    return false;
  }
}

// ── Button taps ──────────────────────────────────────────────
onButton('ewiz:', async (sock, msg, from, sender, btnId) => {
  try {
    const parts = btnId.slice('ewiz:'.length).split(':');
    const nonce = parts[0];
    const action = parts[1];
    const arg = parts[2];
    const s = sessions.get(nonce);

    // Stale taps after cancel/restart/expiry — never silent-dead
    if (!s) {
      return sock.sendMessage(from, {
        text: `⚠️ That build is gone — expired, cancelled or restarted. Run ${prefix()}event to start fresh.`,
      }, { quoted: msg });
    }
    // Wrong chat or wrong fingers: creator-only, LID-safe
    if (s.chatJid !== from || !jidsMatch(s.hostJid, sender)) return;
    // Lazy TTL on taps — expired builds get one nudge, never silence
    if (Date.now() - s.startedAt > SESSION_TTL) {
      sessions.delete(s.nonce);
      return _expiredNotice(sock, from, msg);
    }

    switch (action) {
      case 'cancel':
        return cancelWizard(sock, s, from, msg);

      case 'tpl': {
        const tpl = templateByKey(arg);
        if (!tpl) return;
        s.draft.templateKey = tpl.key;
        s.draft.title = tpl.label;
        s.draft.customCar = false;
        if (s.returnTo === 'review') { s.returnTo = null; return renderReviewStep(sock, s); }
        return renderHostStep(sock, s);
      }
      case 'tplc':
        return _arm(sock, from, msg, s, 'title',
          `✍️ Reply with your title, boet — I'll CAPS and bold it for the card (3 min).`);

      case 'hostme':
        s.draft.host = sanitizeEventText(s.hostName, 40) || 'Host';
        if (s.returnTo === 'review') { s.returnTo = null; return renderReviewStep(sock, s); }
        return renderIdStep(sock, s);

      case 'srv': {
        const sv = serverByKey(arg);
        if (!sv) return;
        s.draft.serverKey = sv.key;
        if (s.returnTo === 'review') { s.returnTo = null; return renderReviewStep(sock, s); }
        return renderCarStep(sock, s);
      }
      case 'pg': {
        const page = parseInt(arg, 10);
        if (isNaN(page) || page < 0) return;
        s.serverPage = page;
        return renderServerStep(sock, s);
      }
      case 'jumps':
        return renderJumpStep(sock, s);
      case 'jump': {
        const ri = parseInt(arg, 10);
        const r = SERVER_RANGES[ri];
        if (!r) return;
        s.serverPage = pageForKey(buildServerPages(), r.fromKey);
        return renderServerStep(sock, s);
      }
      case 'jumpb':
        return renderServerStep(sock, s);

      case 'car': {
        const tpl = s.draft.templateKey ? templateByKey(s.draft.templateKey) : null;
        const options = (tpl ? tpl.carOptions : DEFAULT_CAR_OPTIONS).slice(0, 7);
        const idx = parseInt(arg, 10);
        if (isNaN(idx) || !options[idx]) return;
        s.draft.carType = options[idx];
        s.draft.customCar = false;
        if (s.returnTo === 'review') { s.returnTo = null; return renderReviewStep(sock, s); }
        return renderDateStep(sock, s);
      }
      case 'carc':
        return _arm(sock, from, msg, s, 'car',
          `🚗 Reply with the car rule — like *Audi only* or *Golf GTIs only* (3 min).`);

      // ── DATE step: month → day pickers (default = today) ──
      case 'mo': {
        const mo = parseInt(arg, 10);
        if (isNaN(mo) || mo < 1 || mo > 12) return;
        return renderDayStage(sock, s, mo);
      }
      case 'dy': {
        const day = parseInt(arg, 10);
        const mo = s.dayMonth;
        if (isNaN(day) || !mo) return;
        s.draft.eventDate = resolveEventDate(mo, day);
        if (s.returnTo === 'review') { s.returnTo = null; return renderReviewStep(sock, s); }
        return renderTimeStep(sock, s);
      }
      case 'mpg': {
        const page = parseInt(arg, 10);
        if (isNaN(page) || page < 0 || page > 1) return;
        s.datePage = page;
        return renderDateStep(sock, s);
      }
      case 'dpg': {
        const page = parseInt(arg, 10);
        if (isNaN(page) || page < 0) return;
        return renderDayPageStep(sock, s, page);
      }
      case 'dmonths':
        return renderDateStep(sock, s);
      case 'dtoday':
        s.draft.eventDate = todayISO();
        if (s.returnTo === 'review') { s.returnTo = null; return renderReviewStep(sock, s); }
        return renderTimeStep(sock, s);

      case 'tskip':
        if (_isFutureDate(s)) return renderTimeStep(sock, s);
        s.draft.time = null;
        recomputeEndTime(s);
        if (s.returnTo === 'review') { s.returnTo = null; return renderReviewStep(sock, s); }
        return renderDurationStep(sock, s);

      case 'dur': {
        const mins = parseInt(arg, 10);
        if (![30, 60, 120, 180].includes(mins)) return;
        s.draft.durationMins = mins;
        recomputeEndTime(s);
        s.returnTo = null;
        return renderReviewStep(sock, s);
      }
      case 'durc':
        return _arm(sock, from, msg, s, 'endtime',
          `⏱️ Reply with the end time, boet — 24hr like *22:30* (3 min).`);
      case 'dskip':
        s.draft.durationMins = null;
        s.draft.endTime = null;
        s.returnTo = null;
        return renderReviewStep(sock, s);

      case 'post':
        return publishEvent(sock, s, msg);

      case 'edit':
        return renderEditPicker(sock, s);

      case 'editf': {
        s.returnTo = 'review';
        switch (arg) {
          case 'title':  return renderTitleStep(sock, s);
          case 'host':   return renderHostStep(sock, s);
          case 'id':     return renderIdStep(sock, s);
          case 'server': s.serverPage = 0; return renderServerStep(sock, s);
          case 'car':    return renderCarStep(sock, s);
          case 'date':   s.datePage = 0; return renderDateStep(sock, s);
          case 'time':   return renderTimeStep(sock, s);
          case 'duration': return renderDurationStep(sock, s);
          default: s.returnTo = null; return renderReviewStep(sock, s);
        }
      }
      case 'back':
        s.returnTo = null;
        return renderReviewStep(sock, s);

      default:
        return; // unknown action — silent drop (strict id grammar)
    }
  } catch (e) {
    console.error('[EVWIZ] tap error:', e.message);
  }
});

module.exports = {
  startWizard,
  cancelWizardFor,
  captureText,
  hasActiveWizard,
  renderEventCard,
  resolveEventById,
  sessions, // exposed for tests
};
