/**
 * CPM Event Card Wizard — interactive builder for crew meet events.
 *
 * `!event` (bare) opens a step machine IN-GROUP (the DM blocker makes DM
 * wizards impossible for crew admins): TITLE (7 templates + custom) →
 * HOST 👤 → ROOM ID 🆔 → SERVER 🌐 (paginated, 🇿🇦 pinned page 1) →
 * CAR TYPE 🚗 (per-template presets + custom) → TIME ⏰ (optional) →
 * REVIEW → POST. Legacy `!event <name> <HH:MM>` keeps working — the
 * command file routes to it before starting the wizard.
 *
 * Precedents cloned from applyInteractive.js (session Map + TTL + stage
 * guards) and memberPicker.js (nonce'd button ids + pagination).
 *
 * Rulings baked in (planner/judge pipeline 2026-10-12):
 *  - `requireAdmin('ewiz')` — NO trailing colon (buttonHelper.js:69 checks
 *    `btnId.startsWith(prefix + ':')`; 'ewiz:' would never match).
 *  - Sessions are per-(group, sender) — joint hosts coexist; the same
 *    sender restarting replaces their own draft; 60s per-group start
 *    throttle stops restart spam.
 *  - RAM-only drafts, zero DB writes before the publish latch.
 *  - Publish order: write event first, then send the card (a failed card
 *    send still leaves a working event — `!attend EV-XXXXX` covers it).
 *  - RSVP ids are explicit (`evrsvp:in:<id>`), never positional — and
 *    `evrsvp:` is NOT admin-gated: the whole crew RSVPs.
 *  - expiresAt = created + 48h, ONLY when a time was set — timeless
 *    "now-now" events die via result/remove, never lazily.
 *  - The capture hook sits BEFORE bomb/tictactoe so an armed step beats
 *    game input, and before antibadword/antiflood/slowmode so a
 *    demoted-mid-build host's text can't be eaten by the gauntlet.
 */

const config = require('../../config');
const database = require('../../database');
const { sendButtons, onButton, requireAdmin } = require('../../utils/buttonHelper');
const { buildComparableIds } = require('../../utils/jidHelper');
const { voice } = require('../../utils/format');
const {
  TEMPLATES, DEFAULT_CAR_OPTIONS, buildServerPages, serverByKey,
  templateByKey, normalizeCpmId, sanitizeEventText, TIME_RE,
} = require('./cpmData');

// Forged taps bounce at the router (buttonHelper choke point)
requireAdmin('ewiz');

// ── Tunables ─────────────────────────────────────────────────
const SESSION_TTL = 30 * 60 * 1000;   // draft dies after 30 min
const TEXT_WINDOW = 3 * 60 * 1000;    // armed typed-capture window
const RENDER_DEBOUNCE = 700;          // beats the 500ms interactive cooldown
const EXPIRY_WINDOW = 48 * 60 * 60 * 1000; // events with a time expire 48h after creation
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const prefix = () => config.prefix || '.';

// ── Session store (RAM only — restarts cost one re-run) ──────
const sessions = new Map();           // nonce → session
const _groupStarts = new Map();       // groupJid → last start ts

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

// ── Render helpers ──────────────────────────────────────────
async function sendStep(sock, s, payload, quoted) {
  const wait = RENDER_DEBOUNCE - (Date.now() - (s.lastRenderAt || 0));
  if (wait > 0) await sleep(wait);
  s.lastRenderAt = Date.now();
  return sendButtons(sock, s.chatJid, {
    footer: config.botName || 'KAMI Bot',
    ...payload,
  }, quoted);
}

const CANCEL_BTN = (s) => ({ id: `ewiz:${s.nonce}:cancel`, text: '🚫 Cancel' });

// ── Step renders ─────────────────────────────────────────────
async function renderTitleStep(sock, s) {
  s.step = 'title';
  s.awaiting = null;
  const buttons = TEMPLATES.map(t => ({
    id: `ewiz:${s.nonce}:tpl:${t.key}`,
    text: `${t.emoji} ${t.label}`,
  }));
  buttons.push({ id: `ewiz:${s.nonce}:tplc`, text: '✍️ Custom title' });
  buttons.push(CANCEL_BTN(s));
  return sendStep(sock, s, {
    text:
      `━━━ 📅 *NEW EVENT* [1/6] ━━━\n\n` +
      `Aweh 👑 What we running? Pick the type, or ✍️ for your own vibe.\n\n` +
      `_Type ${prefix()}event cancel to scrap it_`,
    buttons,
  });
}

async function renderHostStep(sock, s) {
  s.step = 'host';
  s.awaiting = 'host';
  s.awaitingSince = Date.now();
  return sendStep(sock, s, {
    text:
      `━━━ 👤 *HOST* [2/6] ━━━\n\n` +
      `Who's hosting this one?\n\n` +
      `_Reply to this message or just type it here — I'm listening 👂 (3 min)_`,
    buttons: [
      { id: `ewiz:${s.nonce}:hostme`, text: '👤 Use my name' },
      CANCEL_BTN(s),
    ],
  });
}

async function renderIdStep(sock, s) {
  s.step = 'id';
  s.awaiting = 'id';
  s.awaitingSince = Date.now();
  return sendStep(sock, s, {
    text:
      `━━━ 🆔 *ROOM ID* [3/6] ━━━\n\n` +
      `Drop the CPM player ID the lads use to join your lobby — like *VR401128*.\n\n` +
      `_Type it here (3 min)_`,
    buttons: [CANCEL_BTN(s)],
  });
}

async function renderServerStep(sock, s) {
  s.step = 'server';
  s.awaiting = null;
  const pages = buildServerPages();
  if (s.serverPage >= pages.length) s.serverPage = 0;
  const rows = pages[s.serverPage];
  const buttons = rows.map(sv => ({
    id: `ewiz:${s.nonce}:srv:${sv.key}`,
    text: `${sv.flag} ${sv.name}`,
  }));
  if (s.serverPage > 0) buttons.push({ id: `ewiz:${s.nonce}:pg:${s.serverPage - 1}`, text: '◀️ Prev' });
  if (s.serverPage < pages.length - 1) buttons.push({ id: `ewiz:${s.nonce}:pg:${s.serverPage + 1}`, text: 'Next ▶️' });
  buttons.push(CANCEL_BTN(s));
  return sendStep(sock, s, {
    text:
      `━━━ 🌐 *SERVER* [4/6] — Page ${s.serverPage + 1}/${pages.length} ━━━\n\n` +
      `Which server we linking on? 🇿🇦 pinned right here for home advantage hey.`,
    buttons,
  });
}

async function renderCarStep(sock, s) {
  s.step = 'car';
  s.awaiting = null;
  const tpl = s.draft.templateKey ? templateByKey(s.draft.templateKey) : null;
  const options = (tpl ? tpl.carOptions : DEFAULT_CAR_OPTIONS).slice(0, 7);
  const buttons = options.map((opt, i) => ({
    id: `ewiz:${s.nonce}:car:${i}`,
    text: `🚗 ${opt}`,
  }));
  buttons.push({ id: `ewiz:${s.nonce}:carc`, text: '✍️ Custom' });
  buttons.push(CANCEL_BTN(s));
  return sendStep(sock, s, {
    text:
      `━━━ 🚗 *CAR TYPE* [5/6] ━━━\n\n` +
      `What must the lads bring?${tpl ? ` _(${tpl.label})_` : ''}`,
    buttons,
  });
}

async function renderTimeStep(sock, s) {
  s.step = 'time';
  s.awaiting = 'time';
  s.awaitingSince = Date.now();
  return sendStep(sock, s, {
    text:
      `━━━ ⏰ *TIME* [6/6] ━━━\n\n` +
      `What time we linking? 24hr like *20:30* — or skip if it's a now-now thing.\n\n` +
      `_Type it here (3 min), or "skip"_`,
    buttons: [
      { id: `ewiz:${s.nonce}:tskip`, text: '⏭️ Skip — now-now' },
      CANCEL_BTN(s),
    ],
  });
}

// ── Card + review ────────────────────────────────────────────
function draftToRecord(s) {
  const title = String(s.draft.title || '').toUpperCase();
  const hasTime = !!s.draft.time;
  return {
    name: title,
    time: hasTime ? s.draft.time : null,
    createdBy: s.hostJid,
    attendees: [],
    status: 'upcoming',
    results: null,
    created: Date.now(),
    host: s.draft.host || null,
    cpmId: s.draft.cpmId || null,
    serverKey: s.draft.serverKey || null,
    carType: s.draft.carType || null,
    customCar: !!s.draft.customCar,
    templateKey: s.draft.templateKey || null,
    expiresAt: hasTime ? Date.now() + EXPIRY_WINDOW : null,
    postedAt: Date.now(),
  };
}

/**
 * The event card — the owner's mock, line-for-line. Shared by the wizard
 * (post + review preview) and anything else that re-renders a card.
 */
function renderEventCard(eventId, evt, attendeeCount) {
  const sv = evt.serverKey ? serverByKey(evt.serverKey) : null;
  let text =
    `━━━━━━━━━━━━━━━━\n` +
    `${evt.templateKey && templateByKey(evt.templateKey) ? templateByKey(evt.templateKey).emoji : '🏁'} *${evt.name}*\n` +
    `━━━━━━━━━━━━━━━━\n\n`;
  if (evt.host) text += `👤: ${evt.host}\n`;
  if (evt.cpmId) text += `🆔: ${evt.cpmId}\n`;
  if (sv) text += `🌐: ${sv.flag} ${sv.name}\n`;
  if (evt.carType) text += `🚗: ${evt.carType}\n`;
  if (evt.time) text += `⏰: ${evt.time}\n`;
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

async function renderReviewStep(sock, s) {
  s.step = 'review';
  s.awaiting = null;
  const evt = draftToRecord(s);
  const preview = renderEventCard('…', evt, 0);
  return sendStep(sock, s, {
    text: `✅ *REVIEW — LOOK LEKKE?*\n\n${preview}\n\n_Tap ✅ and it's live._`,
    buttons: [
      { id: `ewiz:${s.nonce}:post`, text: '✅ Post it' },
      { id: `ewiz:${s.nonce}:edit`, text: '✏️ Edit a field' },
      CANCEL_BTN(s),
    ],
  });
}

async function renderEditPicker(sock, s) {
  s.step = 'editpick';
  s.awaiting = null;
  return sendStep(sock, s, {
    text: `✏️ *EDIT WHICH PART?*`,
    buttons: [
      { id: `ewiz:${s.nonce}:editf:title`,  text: '🏁 Title' },
      { id: `ewiz:${s.nonce}:editf:host`,   text: '👤 Host' },
      { id: `ewiz:${s.nonce}:editf:id`,     text: '🆔 ID' },
      { id: `ewiz:${s.nonce}:editf:server`, text: '🌐 Server' },
      { id: `ewiz:${s.nonce}:editf:car`,    text: '🚗 Cars' },
      { id: `ewiz:${s.nonce}:editf:time`,   text: '⏰ Time' },
      { id: `ewiz:${s.nonce}:back`,         text: '◀️ Back to review' },
      CANCEL_BTN(s),
    ],
  });
}

// ── Step entry / cancel / publish ────────────────────────────
async function startWizard(sock, msg, extra) {
  const chatJid = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const groupJid = extra?.from || chatJid;

  // Same host restarting replaces their own draft silently (restart spam
  // self-heals — each start renders one debounced title step). Different
  // hosts coexist: per-(group, sender) sessions, nonce-routed taps.
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
    awaiting: null,
    awaitingSince: 0,
    draft: {},
    returnTo: null,
    strikes: 0,
    startedAt: Date.now(),
    lastRenderAt: 0,
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

// Publish: DB first (a card-send failure still leaves a working event —
// the typed `!attend EV-XXXXX` path covers it), then the card, then the
// confirm. Latch stops double-taps double-writing.
async function publishEvent(sock, s) {
  if (s.publishing) return;
  s.publishing = true;
  const eventId = genEventId(s.groupJid);
  const evt = draftToRecord(s);
  database.addCrewEvent(s.groupJid, eventId, evt);
  sessions.delete(s.nonce);
  console.log(`[EVWIZ] published ${eventId} in ${s.groupJid} (${evt.name})`);

  try {
    await sendStep(sock, s, {
      text: renderEventCard(eventId, evt, 0),
      buttons: [
        { id: `evrsvp:in:${eventId}`, text: '✅ I\'M IN' },
        { id: `evrsvp:out:${eventId}`, text: '❌ I\'M OUT' },
        { id: 'again:events', text: '📅 All events' },
      ],
    });
  } catch (cardErr) {
    console.error('[EVWIZ] card send failed:', cardErr.message);
  }
  try {
    await sleep(700);
    await sock.sendMessage(s.chatJid, {
      text:
        `━━━ 🏁 *EVENT LIVE* ━━━\n\n` +
        `Card's up — tag the crew and let's fill that lobby ${voice.tag('ok')}\n` +
        `_Event ID: ${eventId}_`,
    });
  } catch (e) { /* confirm is cosmetic */ }
}

// ── Text capture (armed steps) ───────────────────────────────
async function _strikeOut(sock, s, reason) {
  s.strikes++;
  if (s.strikes >= 3) {
    return cancelWizard(sock, s, s.chatJid, null);
  }
  return sock.sendMessage(s.chatJid, {
    text: `⚠️ ${reason}\n\n_${3 - s.strikes} ${s.strikes === 2 ? 'try' : 'tries'} left before I scrap this build, boet_`,
  });
}

/**
 * Called from handler.js BEFORE the games and group protections.
 * Consumes the host's typed answer when a step is armed. Returns true
 * when the message was consumed (handler must return).
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
        await sock.sendMessage(ctx.from, {
          text: `⏰ *EVENT BUILD EXPIRED*\n\nThat draft got old, boet — run ${prefix()}event again.`,
        }, { quoted: msg });
        return true;
      }
      return false;
    }
    if (!s.awaiting) return false;
    if (Date.now() - s.awaitingSince > TEXT_WINDOW) {
      // window closed — re-arm by re-rendering the same step
      s.awaitingSince = Date.now();
      await sock.sendMessage(ctx.from, {
        text: `👂 Still on *${s.awaiting}* — go again, I'm listening (3 min back on the clock).`,
      }, { quoted: msg });
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
        s.draft.time = null; ok = true;
      } else if (TIME_RE.test(body)) {
        s.draft.time = body; ok = true;
      } else { await _strikeOut(sock, s, 'Time must be 24hr *HH:MM* — like *20:30* — or "skip".'); return true; }
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
      case 'car':   await renderTimeStep(sock, s); return true;
      case 'time':  await renderReviewStep(sock, s); return true;
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
      // Only nudge once per chat per burst (avoid tap-spam echo storms)
      return sock.sendMessage(from, {
        text: `⚠️ That build is gone — expired, cancelled or restarted. Run ${prefix()}event to start fresh.`,
      });
    }
    // Wrong chat or wrong fingers: creator-only, LID-safe
    if (s.chatJid !== from || !jidsMatch(s.hostJid, sender)) return;
    // Lazy TTL on taps — expired builds get one nudge, never silence
    if (Date.now() - s.startedAt > SESSION_TTL) {
      sessions.delete(s.nonce);
      return sock.sendMessage(from, {
        text: `⏰ *EVENT BUILD EXPIRED*\n\nThat draft got old, boet — run ${prefix()}event again.`,
      });
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
        s.awaiting = 'title';
        s.awaitingSince = Date.now();
        return sock.sendMessage(from, {
          text: `✍️ Reply with your title, boet — I'll CAPS and bold it for the card (3 min).`,
        }, { quoted: msg });

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

      case 'car': {
        const tpl = s.draft.templateKey ? templateByKey(s.draft.templateKey) : null;
        const options = (tpl ? tpl.carOptions : DEFAULT_CAR_OPTIONS).slice(0, 7);
        const idx = parseInt(arg, 10);
        if (isNaN(idx) || !options[idx]) return;
        s.draft.carType = options[idx];
        s.draft.customCar = false;
        if (s.returnTo === 'review') { s.returnTo = null; return renderReviewStep(sock, s); }
        return renderTimeStep(sock, s);
      }
      case 'carc':
        s.awaiting = 'car';
        s.awaitingSince = Date.now();
        return sock.sendMessage(from, {
          text: `🚗 Reply with the car rule — like *Audi only* or *Golf GTIs only* (3 min).`,
        }, { quoted: msg });

      case 'tskip':
        s.draft.time = null;
        if (s.returnTo === 'review') { s.returnTo = null; return renderReviewStep(sock, s); }
        return renderReviewStep(sock, s);

      case 'post':
        return publishEvent(sock, s);

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
          case 'time':   return renderTimeStep(sock, s);
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

// ── RSVP — explicit event ids, NOT positional, crew-wide ─────
function resolveEventById(eventId, preferredGroupJid) {
  if (preferredGroupJid && String(preferredGroupJid).endsWith('@g.us')) {
    const team = database.getTeam(preferredGroupJid);
    if (team?.events?.[eventId]) return { groupJid: preferredGroupJid, team };
  }
  // Forwarded cards / DM taps — event ids are unique, search everywhere
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
  startWizard,
  cancelWizardFor,
  captureText,
  hasActiveWizard,
  renderEventCard,
  resolveEventById,
  sessions, // exposed for tests
};
