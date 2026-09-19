/**
 * Report Command - Report a message to admins
 */

const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
    name: 'report',
    aliases: ['flag', 'complain'],
    category: 'general',
    description: 'Report a message to the group admins',
    usage: '.report (reply to the message you want to report)',
    groupOnly: true,

    async execute(sock, msg, args, extra) {
        try {
            const from = extra.from;
            const sender = extra.sender;
            const metadata = extra.groupMetadata;

            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            if (!quotedMsg) {
                return extra.reply(
                    `❌ *ERROR*\n\n` +
                    `💡 Reply to a message to report it, ${pick(SLANG.vibe)}\n` +
                    `📝 *Usage:* .report <reason>\n` +
                    `💡 *Example:* Reply to a message → .report spam`
                );
            }

            const reportedText =
                quotedMsg.conversation ||
                quotedMsg.extendedTextMessage?.text ||
                quotedMsg.imageMessage?.caption ||
                quotedMsg.videoMessage?.caption ||
                '[media message]';

            const reportedBy = quotedMsg.extendedTextMessage?.contextInfo?.participant ||
                msg.message?.extendedTextMessage?.contextInfo?.participant ||
                'Unknown';

            const reason = args.join(' ').trim() || 'No reason given';

            const admins = metadata.participants
                .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                .map(p => p.id);

            if (admins.length === 0) {
                return extra.reply(`❌ *ERROR*\n\n💡 No admins found in this group, ${pick(SLANG.friend)}`);
            }

            const reportTime = new Date().toLocaleString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                month: 'short',
                day: 'numeric'
            });

            const reportText = [
                `🚨 *REPORT — PAY ATTENTION*`,
                ``,
                `👤 *Reported by:* @${sender.split('@')[0]}`,
                `📌 *Reported user:* @${reportedBy.split('@')[0]}`,
                `⏰ *Time:* ${reportTime}`,
                `📝 *Reason:* ${reason}`,
                ``,
                `----------`,
                `💬 *Message:*`,
                `${reportedText.substring(0, 500)}${reportedText.length > 500 ? '...' : ''}`,
                `----------`,
                ``,
                `_Please review this, ${pick(SLANG.vibe)} 🫡_`
            ].join('\n');

            await sock.sendMessage(from, {
                text: reportText,
                mentions: [sender, reportedBy, ...admins]
            }, { quoted: msg });

            await sock.sendMessage(from, {
                react: { text: '🚨', key: msg.key }
            });

        } catch (error) {
            await extra.reply(`❌ *ERROR*\n\n💡 ${pick(SLANG.error)} — ${error.message}`);
        }
    }
};
