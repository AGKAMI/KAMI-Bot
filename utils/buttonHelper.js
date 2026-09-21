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

const buttonHandlers = new Map();

function isButtonModeOn() {
  return config.buttonMode === true || config.buttonMode === 'on';
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
  const { text, footer = '', buttons = [], header = '' } = opts;

  // Guard: some callers pass { quoted: msg } by mistake — only real
  // WAMessage objects (with .key) are usable as a quote.
  const safeQuoted = quoted && quoted.key ? quoted : undefined;

  if (!isButtonModeOn() || buttons.length === 0) {
    return safeQuoted
      ? sock.sendMessage(jid, { text }, { quoted: safeQuoted })
      : sock.sendMessage(jid, { text });
  }

  const rows = buttons.slice(0, 3).map(normalizeButton);

  const interactiveMsg = {
    ...(header ? { header: { title: header, subtitle: '', hasMediaAttachment: false } } : {}),
    body: { text },
    ...(footer ? { footer: { text: footer } } : {}),
    nativeFlowMessage: { buttons: rows },
  };

  let userJid = sock.user?.id;
  if (typeof userJid === 'string') {
    userJid = userJid.replace(/:\d+(?=@)/, '');
  }

  const { generateWAMessageFromContent } = require('@whiskeysockets/baileys');
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
    return built;
  } catch (err) {
    console.error('[BUTTON] relay failed:', err.message);
  }

  return safeQuoted
    ? sock.sendMessage(jid, { text }, { quoted: safeQuoted })
    : sock.sendMessage(jid, { text });
}

function onButton(id, handler) {
  buttonHandlers.set(id, handler);
}

/**
 * Handle incoming button press. Call this in the message handler.
 * Checks all known Baileys response formats.
 * @returns {boolean} true if a registered button was handled
 */
function handleButtonResponse(sock, msg) {
  try {
    const m = msg.message;
    if (!m) return false;

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

    // Exact match first
    let handler = buttonHandlers.get(btnId);
    if (!handler) {
      // Prefix match — check if any registered ID is a prefix of btnId
      for (const [key, hnd] of buttonHandlers) {
        if (btnId.startsWith(key + ':') || btnId.startsWith(key)) {
          handler = hnd;
          break;
        }
      }
    }
    if (handler) {
      handler(sock, msg, from, sender, btnId);
      return true;
    }
    return false;
  } catch (e) {
    console.error('[BUTTON] handle error:', e.message);
    return false;
  }
}

module.exports = { sendButtons, onButton, handleButtonResponse, isButtonModeOn };
