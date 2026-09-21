/**
 * Button Helper — interactive buttons via Baileys nativeFlowMessage.
 * Supports quick_reply (tappable) and cta_url (opens link) buttons.
 * Falls back to plain text when button mode is OFF or on error.
 *
 * Button presses arrive as templateButtonReplyMessage.selectedId
 * (Baileys v7), or buttonsResponseMessage / nativeFlowResponseMessage
 * on older versions.
 */

const config = require('../config');
const fs = require('fs');
const path = require('path');

const buttonHandlers = new Map();

function isButtonModeOn() {
  return config.buttonMode === true || config.buttonMode === 'on';
}

function loadThumbnail() {
  try {
    const candidates = [
      path.join(__dirname, 'bot_image.jpg'),
      path.join(__dirname, '..', 'commands', 'general', 'bot_image.jpg'),
      path.join(__dirname, '..', 'utils', 'bot_image.jpg'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p);
      }
    }
  } catch (e) {}
  return null;
}

/**
 * Normalize a button to nativeFlowMessage format.
 * - { id, text }           → quick_reply (tappable, sends id back)
 * - { text, url }          → cta_url (opens URL in browser)
 * - { text, phone }        → cta_call (initiates call)
 * - { text, displayText }  → cta_copy (copies text to clipboard)
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
 * @param {object} opts - { text, footer, header, buttons, thumbnail }
 * @param {object} quoted - message to quote (optional)
 */
async function sendButtons(sock, jid, opts, quoted) {
  const { text, footer = '', buttons = [], header = '' } = opts;

  if (!isButtonModeOn() || buttons.length === 0) {
    return quoted
      ? sock.sendMessage(jid, { text }, { quoted })
      : sock.sendMessage(jid, { text });
  }

  if (!opts.thumbnail) {
    opts.thumbnail = loadThumbnail();
  }

  const rows = buttons.slice(0, 3).map(normalizeButton);

  // Build the interactiveMessage content
  const interactiveMsg = {
    ...(header ? { header: { title: header, hasMediaAttachment: false } } : {}),
    body: { text },
    ...(footer ? { footer: { text: footer } } : {}),
    nativeFlowMessage: {
      messageVersion: 1,
      messageParamsJson: '',
      buttons: rows,
    },
  };

  // Add contextInfo with externalAdReply (thumbnail card)
  if (opts.thumbnail || header || footer) {
    interactiveMsg.contextInfo = {
      mentionedJid: [],
      forwardingScore: 0,
      isForwarded: false,
      externalAdReply: {
        showAdAttribution: true,
        renderLargerThumbnail: false,
        mediaType: 1,
        title: header || config.botName || 'KAMI Bot',
        body: footer || text.substring(0, 60),
        ...(opts.thumbnail ? { thumbnail: opts.thumbnail } : {}),
        sourceUrl: '',
        containsAutoReply: false,
      },
    };
  }

  // Try sending via sock.sendMessage — Baileys handles proto encoding internally
  try {
    const result = await sock.sendMessage(jid, { interactiveMessage: interactiveMsg }, quoted ? { quoted } : {});
    return result;
  } catch (err) {
    console.error('[BUTTON] interactiveMessage failed:', err.message);
  }

  // Fallback: try generateWAMessage + relayMessage
  try {
    const { generateWAMessage } = require('@whiskeysockets/baileys');
    const userJid = sock.user?.id?.replace(/:\d+/, '')?.replace(/@lid/, '@s.whatsapp.net') || '';
    const built = await generateWAMessage(jid, { interactiveMessage: interactiveMsg }, { userJid });
    await sock.relayMessage(jid, built.message, { messageId: built.key.id });
    return built;
  } catch (err) {
    console.error('[BUTTON] relayMessage failed:', err.message);
  }

  // Final fallback: plain text
  return quoted
    ? sock.sendMessage(jid, { text }, { quoted })
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

    const handler = buttonHandlers.get(btnId);
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
