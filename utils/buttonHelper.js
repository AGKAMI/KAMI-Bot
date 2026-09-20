/**
 * Button Helper — Send interactive buttons via nativeFlowMessage (Baileys v7)
 *
 * Supports:
 *   - quick_reply: clickable buttons that route to bot commands
 *   - cta_url: buttons that open a URL
 *
 * Usage:
 *   const { sendButtons } = require('./utils/buttonHelper');
 *
 *   await sendButtons(sock, jid, {
 *     text: 'Choose an option:',
 *     footer: 'KAMI Bot',
 *     buttons: [
 *       { id: 'btn_ping', text: 'Ping' },           // quick_reply
 *       { id: 'btn_menu', text: 'Menu' },            // quick_reply
 *       { url: 'https://youtube.com', text: 'YouTube' }, // cta_url
 *     ],
 *   }, { quoted: msg });
 */

const { proto } = require('@whiskeysockets/baileys/WAProto');

/**
 * Send a message with interactive buttons
 * @param {object} sock - Baileys socket
 * @param {string} jid - Chat JID
 * @param {object} opts
 * @param {string} opts.text - Message body text
 * @param {string} [opts.footer] - Footer text
 * @param {Array} opts.buttons - Array of button objects
 * @param {string} opts.buttons[].id - Button ID (for quick_reply)
 * @param {string} opts.buttons[].text - Button display text
 * @param {string} [opts.buttons[].url] - URL (for cta_url buttons)
 * @param {object} [msgOpts] - Additional sendMessage options (quoted, mentions, etc.)
 */
async function sendButtons(sock, jid, opts, msgOpts = {}) {
  const buttons = (opts.buttons || []).map(btn => {
    if (btn.url) {
      // CTA URL button
      return {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({
          display_text: btn.text,
          url: btn.url,
          merchant_id: btn.merchantId || '',
        }),
      };
    } else {
      // Quick reply button
      return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: btn.text,
          id: btn.id,
        }),
      };
    }
  });

  const message = {
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2,
        },
        interactiveMessage: proto.Message.InteractiveMessage.create({
          body: { text: opts.text || '' },
          footer: opts.footer ? { text: opts.footer } : undefined,
          nativeFlowMessage: { buttons },
        }),
      },
    },
  };

  return sock.sendMessage(jid, message, msgOpts);
}

module.exports = { sendButtons };
