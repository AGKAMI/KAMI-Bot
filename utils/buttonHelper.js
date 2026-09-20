/**
 * Button Helper — interactive quick-reply buttons via Baileys nativeFlowMessage.
 * When button mode is OFF (or no buttons passed) it falls back to plain text,
 * so the bot keeps working on clients that don't render interactive messages.
 *
 * Button presses arrive as buttonsResponseMessage / interactiveResponseMessage
 * with an id. Register handlers with onButton(id, fn) and route them in
 * handler.handleMessage via handleButtonResponse().
 */

const config = require('../config');

const buttonHandlers = new Map();

// Button mode toggle — read from config.buttonMode
function isButtonModeOn() {
  return config.buttonMode === true || config.buttonMode === 'on';
}

/**
 * Send a message with interactive quick-reply buttons.
 * @param {object} sock - Baileys socket
 * @param {string} jid - chat JID
 * @param {object} opts - { text, footer, buttons: [{ id, text }] }
 * @param {object} quoted - message to quote (optional)
 */
async function sendButtons(sock, jid, opts, quoted) {
  const { text, footer = '', buttons = [] } = opts;

  // Fallback: button mode off, or no buttons → plain text
  if (!isButtonModeOn() || buttons.length === 0) {
    return quoted
      ? sock.sendMessage(jid, { text }, { quoted })
      : sock.sendMessage(jid, { text });
  }

  // Baileys caps quick-reply buttons at 3 per message
  const rows = buttons.slice(0, 3).map(b => ({
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({
      display_text: String(b.text || b.label || b.id),
      id: b.id,
    }),
  }));

  const content = {
    interactiveMessage: {
      body: { text },
      ...(footer ? { footer: { text: footer } } : {}),
      nativeFlowMessage: { buttons: rows },
    },
  };

  return quoted
    ? sock.sendMessage(jid, content, { quoted })
    : sock.sendMessage(jid, content);
}

// Register a handler for a button id
function onButton(id, handler) {
  buttonHandlers.set(id, handler);
}

/**
 * Handle an incoming button press. Call this early in handleMessage.
 * @returns {boolean} true if a registered button was handled
 */
function handleButtonResponse(sock, msg) {
  try {
    const br =
      msg.message?.buttonsResponseMessage ||
      msg.message?.interactiveResponseMessage ||
      null;
    if (!br) return false;

    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;

    let btnId = br.selectedButtonId || null;

    // nativeFlowResponseMessage.paramsJson is a JSON string: {"id":"..."}
    if (!btnId && br.nativeFlowResponseMessage?.paramsJson) {
      try {
        btnId = JSON.parse(br.nativeFlowResponseMessage.paramsJson).id;
      } catch (e) {}
    }

    if (!btnId) return false;

    const handler = buttonHandlers.get(btnId);
    if (handler) {
      handler(sock, msg, from, sender, br);
      return true;
    }
    return false;
  } catch (e) {
    console.error('[BUTTON] handle error:', e.message);
    return false;
  }
}

module.exports = { sendButtons, onButton, handleButtonResponse, isButtonModeOn };