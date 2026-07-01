/**
 * Channel Info Utility - Adds newsletter forwarding info to messages
 * Based on Knightbot-MD's channelInfo implementation
 */

const config = require('../config');

/**
 * Get channel info context for message forwarding
 * @param {string} newsletterName - Name to display for the newsletter
 * @returns {object} - Context info with newsletter forwarding
 */
function getChannelInfo(newsletterName = null) {
    const name = newsletterName || config.botName || 'KAMI Bot';
    const jid = config.newsletterJid || '';
    
    if (!jid) {
        return {};
    }

    return {
        contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: jid,
                newsletterName: name,
                serverMessageId: -1
            }
        }
    };
}

/**
 * Send message with channel info
 * @param {object} sock - WhatsApp socket
 * @param {string} chatId - Target chat ID
 * @param {string} message - Message text
 * @param {object} options - Additional options
 */
async function sendWithChannelInfo(sock, chatId, message, options = {}) {
    const channelInfo = getChannelInfo(options.newsletterName);
    
    await sock.sendMessage(chatId, {
        text: message,
        ...channelInfo
    }, {
        quoted: options.quoted || null,
        ...options
    });
}

module.exports = {
    getChannelInfo,
    sendWithChannelInfo
};
