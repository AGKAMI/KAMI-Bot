/**
 * Owner Command - Sends bot owner's contact card (vCard)
 */

const config = require('../../config');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');
const { sendButtons } = require('../../utils/buttonHelper');

module.exports = {
    name: 'owner',
    reactions: { received: '👑', done: '🏠' },
    aliases: ['creator', 'dev', 'botowner'],
    category: 'general',
    description: 'Show the bot owner\'s contact details',
    usage: '.owner',
    ownerOnly: false,

    async execute(sock, msg, args, extra) {
        try {
            const chatId = extra.from;

            // Owner numbers array -> convert each to a vCard.
            // Skip LID-form entries (e.g. xxx@lid) — they're internal identities, not dialable numbers
            const ownerNames = Array.isArray(config.ownerName) ? config.ownerName : [config.ownerName];
            const dialableNumbers = config.ownerNumber.filter(num => !String(num).includes('@lid'));
            const vCards = dialableNumbers.map((num, index) => {
                const name = ownerNames[index] || ownerNames[0] || 'Bot Owner';
                return {
                    vcard: `
BEGIN:VCARD
VERSION:3.0
FN:${name}
TEL;waid=${num}:${num}
END:VCARD
                    `.trim()
                };
            });

            const displayName = ownerNames[0] || config.ownerName || 'Bot Owner';

            await sock.sendMessage(chatId, {
                contacts: {
                    displayName: displayName,
                    contacts: vCards
                }
            });

            // Copy button only — nobody calls the owner, they text
            const firstNumber = dialableNumbers[0] ? String(dialableNumbers[0]).replace(/\D/g, '') : null;
            const actionButtons = [];
            if (firstNumber) {
                actionButtons.push({
                    text: '📋 Copy Number',
                    displayText: firstNumber,
                });
            }

            if (actionButtons.length > 0) {
                await sendButtons(sock, chatId, {
                    text: `👑 *OWNER CONTACT*\n💡 _here's my owner's contact_`,
                    footer: config.botName || 'KAMI Bot',
                    buttons: actionButtons,
                }, msg);
            } else {
                await extra.reply(`👑 *OWNER CONTACT*\n💡 _here's my owner's contact_`);
            }

        } catch (error) {
            console.error('Owner command error:', error);
            extra.fail();
            await extra.reply(`❌ *ERROR*\n💡 ${voice.openErr()} — ${error.message}`);
        }
    }
};
