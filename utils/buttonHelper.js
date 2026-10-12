/**
 * Button Helper — interactive buttons via Baileys nativeFlowMessage.
 * Supports quick_reply (tappable), cta_url, cta_call, cta_copy buttons.
 * Falls back to plain text when button mode is OFF or on error.
 *
 * Send path (the ONLY one that works in Baileys v7.0.0-rc.9):
 * sock.sendMessage()/generateWAMessage() both route through
 * generateWAMessageContent, which has no interactiveMessage branch —
 * it falls into prepareWAMessageMedia and throws "Invalid media type".
 * So we build the proto with generateWAMessageFromContent and relay it,
 * passing the biz/interactive native_flow node that WhatsApp requires
 * to actually render the buttons.
 *
 * Structure verified against kango-wa v1.0.4 (working on mobile):
 * - header { title, subtitle: '', hasMediaAttachment: false } when set
 * - NO messageVersion, NO messageParamsJson, NO contextInfo/externalAdReply
 *
 * Button presses arrive as templateButtonReplyMessage.selectedId
 * (Baileys v7), or buttonsResponseMessage on older versions.
 */

const config = require('../config');
const { generateWAMessageFromContent } = require('@whiskeysockets/baileys');

const buttonHandlers = new Map();
const adminOnlyButtons = new Set(); // button ID prefixes that require admin
const ownerOnlyButtons = new Set(); // button ID prefixes that require owner

// ── Rate limiter: WhatsApp throttles interactive messages ──────────
// Only allow 1 interactive message per JID every COOLDOWN_MS.
// After that, fall back to plain text.
const COOLDOWN_MS = 500; // 500ms between interactive messages per chat
const lastInteractive = new Map(); // jid → timestamp

// Cleanup stale entries every 5 minutes (prevents memory leaks).
// .unref() so the timer never holds a short-lived process open (tests).
setInterval(() => {
  const now = Date.now();
  for (const [jid, ts] of lastInteractive) {
    if (now - ts > 300000) lastInteractive.delete(jid);
  }
}, 300000).unref();

function isButtonModeOn() {
  return config.buttonMode === true || config.buttonMode === 'on';
}

function canSendInteractive(jid) {
  const last = lastInteractive.get(jid) || 0;
  if (Date.now() - last < COOLDOWN_MS) return false;
  lastInteractive.set(jid, Date.now());
  return true;
}

/**
 * Register a button ID prefix as admin-only.
 * When a user presses this button, they must be an admin.
 * @param {string} prefix - button ID prefix (e.g. 'admin:kick')
 */
function requireAdmin(prefix) {
  adminOnlyButtons.add(prefix);
}

/**
 * Check if a button ID requires admin privileges.
 */
function isAdminOnly(btnId) {
  for (const prefix of adminOnlyButtons) {
    if (btnId === prefix || btnId.startsWith(prefix + ':')) {
      return true;
    }
  }
  return false;
}

/**
 * Register a button ID prefix as owner-only.
 * Enforced inside handleButtonResponse — forged taps can't bypass it.
 */
function requireOwner(prefix) {
  ownerOnlyButtons.add(prefix);
}

function isOwnerOnly(btnId) {
  for (const prefix of ownerOnlyButtons) {
    if (btnId === prefix || btnId.startsWith(prefix + ':')) {
      return true;
    }
  }
  return false;
}

/**
 * Owner predicate — fromMe OR digit-normalized match against config.ownerNumber.
 * Moved here from menu.js isOwnerClicker so every owner gate shares one logic
 * (config stores 083…-style local numbers, sender jids carry 27…/LID digits).
 */
function isOwnerJid(msg, sender) {
  if (msg && msg.key && msg.key.fromMe) return true;
  const { normalizeJidWithLid } = require('./jidHelper');
  const jid = normalizeJidWithLid(sender) || sender || '';
  const digits = String(jid).split('@')[0].replace(/\D/g, '');
  if (!digits) return false;
  const { canonicalNumber } = require('../database');
  return (config.ownerNumber || []).some(o => canonicalNumber(o) === canonicalNumber(digits));
}

/**
 * Normalize a button to nativeFlowMessage format.
 * - { id, text }           → quick_reply (tappable, sends id back)
 * - { text, url }          → cta_url (opens link in browser)
 * - { text, phone }         → cta_call (initiates call)
 * - { text, displayText }   → cta_copy (copies text to clipboard)
 */
function normalizeButton(b) {
  if (b.url) {
    return {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: String(b.text || 'Open'),
        url: b.url,
        merchant_url: b.url,
      }),
    };
  }

  if (b.phone) {
    return {
      name: 'cta_call',
      buttonParamsJson: JSON.stringify({
        display_text: String(b.text || 'Call'),
        phone_number: b.phone,
      }),
    };
  }

  if (b.displayText && !b.id) {
    return {
      name: 'cta_copy',
      buttonParamsJson: JSON.stringify({
        display_text: String(b.text || 'Copy'),
        copy_text: b.displayText,
      }),
    };
  }

  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({
      display_text: String(b.text || b.label || b.id),
      id: b.id,
    }),
  };
}

/**
 * Send a message with interactive buttons.
 * @param {object} sock
 * @param {string} jid
 * @param {object} opts - { text, footer, header, buttons }
 * @param {object} quoted - message to quote (optional, must have .key)
 */
async function sendButtons(sock, jid, opts, quoted) {
  const { text, footer = '', buttons = [], header = '', mentions = [], image, buttonText } = opts;

  // When image is present, buttonText is used for the button message body
  // (avoids duplicating the full caption text in the button message)
  const btnBody = buttonText || text;

  // Guard: some callers pass { quoted: msg } by mistake — only real
  // WAMessage objects (with .key) are usable as a quote.
  const safeQuoted = quoted && quoted.key ? quoted : undefined;

  if (!isButtonModeOn() || buttons.length === 0) {
    console.log(`[BTNSND] to=${jid} btns=${buttons.length} path=text (mode=${isButtonModeOn() ? 'on' : 'OFF'})`);
    if (image) {
      return sock.sendMessage(jid, { image, caption: text, mentions }, safeQuoted ? { quoted: safeQuoted } : {});
    }
    return safeQuoted
      ? sock.sendMessage(jid, { text, mentions }, { quoted: safeQuoted })
      : sock.sendMessage(jid, { text, mentions });
  }

  // ── Rate limit: if we sent an interactive message recently, fall back to plain text ──
  if (!canSendInteractive(jid)) {
    console.log(`[BTNSND] to=${jid} btns=${buttons.length} path=text (cooldown)`);
    if (image) {
      return sock.sendMessage(jid, { image, caption: text, mentions }, safeQuoted ? { quoted: safeQuoted } : {});
    }
    return safeQuoted
      ? sock.sendMessage(jid, { text, mentions }, { quoted: safeQuoted })
      : sock.sendMessage(jid, { text, mentions });
  }

  // Native flow supports up to 10 quick_reply buttons (3 was the old TEMPLATE limit —
  // this path sends interactiveMessage/native_flow, not templates)
  const rows = buttons.slice(0, 10).map(normalizeButton);

  // If image provided, send image first then buttons (iPhone can't do both in one)
  if (image) {
    try {
      await sock.sendMessage(jid, { image, caption: text, mentions }, safeQuoted ? { quoted: safeQuoted } : {});
    } catch (imgErr) {
      console.error('[BUTTON] image send failed:', imgErr.message);
      await sock.sendMessage(jid, { text, mentions }, safeQuoted ? { quoted: safeQuoted } : {});
    }
    // Delay before buttons — WhatsApp throttles interactive messages after images
    await new Promise(r => setTimeout(r, 3000));
    // Fall through to send buttons as separate message — use btnBody (short text)
  }

  // NOTE: no `header` in the payload — header'd native_flow messages relay
  // fine but silently fail to render on some clients (the whole message —
  // body + buttons — never appears). This made every "Back to Menu" send
  // invisible while header-less sends worked. The `header` opt is accepted
  // but deliberately dropped; body text carries the title instead.
  const interactiveMsg = {
    body: { text: image ? btnBody : text },
    ...(footer ? { footer: { text: footer } } : {}),
    nativeFlowMessage: { buttons: rows },
  };

  let userJid = sock.user?.id;
  if (typeof userJid === 'string') {
    userJid = userJid.replace(/:\d+(?=@)/, '');
  }

  try {
    const built = generateWAMessageFromContent(
      jid,
      { interactiveMessage: interactiveMsg },
      { userJid, quoted: safeQuoted, timestamp: new Date() }
    );

    // biz/interactive native_flow node — without this WhatsApp renders
    // only the body text and drops the buttons.
    const additionalNodes = [
      {
        tag: 'biz',
        attrs: {},
        content: [
          {
            tag: 'interactive',
            attrs: { type: 'native_flow', v: '1' },
            content: [{ tag: 'native_flow', attrs: { name: 'mixed', v: '9' } }],
          },
        ],
      },
    ];

    await sock.relayMessage(jid, built.message, {
      messageId: built.key.id,
      additionalNodes,
    });
    console.log(`[BTNSND] to=${jid} btns=${rows.length} path=flow`);
    return built;
  } catch (err) {
    console.error('[BUTTON] relay failed:', err.message);
    console.log(`[BTNSND] to=${jid} btns=${rows.length} path=text (relay fail: ${err.message})`);
  }

  return safeQuoted
    ? sock.sendMessage(jid, { text, mentions }, { quoted: safeQuoted })
    : sock.sendMessage(jid, { text, mentions });
}

function onButton(id, handler) {
  // Prefix-overlap warning — two prefix keys where one shadows the other
  // makes routing ambiguous. Longest match wins, but flag it at boot.
  const myPrefix = id.endsWith(':') ? id : id + ':';
  for (const key of buttonHandlers.keys()) {
    if (key === id) continue;
    const keyPrefix = key.endsWith(':') ? key : key + ':';
    if (myPrefix.startsWith(keyPrefix) || keyPrefix.startsWith(myPrefix)) {
      console.warn(`[BUTTON] prefix overlap: "${id}" vs "${key}" — longest match wins`);
    }
  }
  buttonHandlers.set(id, handler);
}

/**
 * Handle incoming button press. Call this in the message handler.
 * Checks all known Baileys response formats.
 * @param {object} sock
 * @param {object} msg
 * @param {function} isAdmin - async (jid) => boolean, checks if sender is group admin
 * @returns {boolean} true if a registered button was handled
 */
async function handleButtonResponse(sock, msg, isAdmin) {
  try {
    // Unwrap disappearing-message/viewOnce shells FIRST — groups with
    // disappearing messages ON wrap every message (taps included), and a
    // raw msg.message read never sees the tap format inside. Without this
    // every button in those groups is dead (same chain as handler.js
    // getMessageContent).
    let m = msg.message;
    if (m?.ephemeralMessage) m = m.ephemeralMessage.message;
    if (m?.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
    if (m?.viewOnceMessage) m = m.viewOnceMessage.message;
    if (m?.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;
    if (!m) return false;

    // Fast path: skip entirely if this message isn't a button tap at all
    if (!m.templateButtonReplyMessage && !m.buttonsResponseMessage && !m.interactiveResponseMessage) {
      return false;
    }

    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;

    let btnId = null;

    // Baileys v7: button taps arrive here
    if (m.templateButtonReplyMessage?.selectedId) {
      btnId = m.templateButtonReplyMessage.selectedId;
    }
    // Older Baileys / some clients
    else if (m.buttonsResponseMessage?.selectedButtonId) {
      btnId = m.buttonsResponseMessage.selectedButtonId;
    }
    // nativeFlowResponseMessage fallback
    else if (m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
      try {
        btnId = JSON.parse(m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id;
      } catch (e) {}
    }

    if (!btnId) return false;

    // Tap trace — one line per tap: id, chat jid, sender jid, wire format.
    // Without this, "button doesn't work" reports are undebuggable (the
    // panel log buffer rotates in minutes).
    console.log(`[BTNTAP] id=${btnId} from=${from} sender=${sender} fmt=${m.templateButtonReplyMessage ? 'template' : m.buttonsResponseMessage ? 'buttons' : 'interactive'}`);

    // Admin-only check
    if (isAdminOnly(btnId)) {
      const isSenderAdmin = typeof isAdmin === 'function' ? await isAdmin(sender, from) : false;
      if (!isSenderAdmin) {
        await sock.sendMessage(from, {
          text: '\u274C *ADMIN ONLY*\n\u{1F6E1}\uFE0F This button is restricted to group admins.',
          mentions: [sender],
        });
        return true; // consumed the event, just rejected it
      }
    }

    // Owner-only check — forged taps can't bypass (hub checks are UI, not security)
    if (isOwnerOnly(btnId) && !isOwnerJid(msg, sender)) {
      await sock.sendMessage(from, {
        text: '\u{1F451} *OWNER ONLY*\n_This button is restricted to KAMI._',
      });
      return true;
    }

    // Exact match first
    let handler = buttonHandlers.get(btnId);
    if (!handler) {
      // Longest-prefix match — insertion order no longer matters.
      // Keys match via their colon-extended form: 'crew:accept' matches
      // 'crew:accept:123', 'cwiz:a:' matches 'cwiz:a:team:…'.
      let bestLen = -1;
      for (const [key, hnd] of buttonHandlers) {
        const prefix = key.endsWith(':') ? key : key + ':';
        if (btnId.startsWith(prefix) && prefix.length > bestLen) {
          bestLen = prefix.length;
          handler = hnd;
        }
      }
    }
    if (handler) {
      // Keep the assignment — tests await getLastHandlerPromise() to know
      // when a tapped handler finished (83d6c56 dropped it while adding
      // tap-trace, racing every async handler assertion).
      lastHandlerPromise = Promise.resolve(handler(sock, msg, from, sender, btnId)).catch(err => {
        console.error('[ButtonHelper] Handler error:', err.message);
      });
      return true;
    }
    console.log(`[BTNTAP] NO HANDLER for id=${btnId} from=${from}`);
    return false;
  } catch (e) {
    console.error('[BUTTON] handle error:', e.message);
    return false;
  }
}

// Test hooks — the button audit awaits handler completion deterministically.
let lastHandlerPromise = null;
const getLastHandlerPromise = () => lastHandlerPromise;
const listButtonHandlers = () => Array.from(buttonHandlers.keys());

module.exports = { sendButtons, onButton, handleButtonResponse, isButtonModeOn, requireAdmin, requireOwner, isAdminOnly, isOwnerOnly, isOwnerJid, listButtonHandlers, getLastHandlerPromise };
