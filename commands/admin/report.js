/**
 * Report Command - DM reports to admins, block admin reports
 */

const { bold, pick, SLANG } = require('../../utils/format');

const reportStore = new Map();
const reportCounters = new Map();

module.exports = {
    name: 'report',
    aliases: ['flag', 'complain'],
    category: 'admin',
    description: 'Report a message to admins via DM',
    usage: '.report <reason> | .report anon | .report queue | .report dismiss <number>',
    groupOnly: true,

    async execute(sock, msg, args, extra) {
        try {
            const from = extra.from;
            const sender = extra.sender;
            const metadata = extra.groupMetadata;

            if (!reportStore.has(from)) {
                reportStore.set(from, []);
            }

            if (!reportCounters.has(from)) {
                reportCounters.set(from, 0);
            }

            const groupReports = reportStore.get(from);

            // .report queue
            if (args.length >= 1 && args[0].toLowerCase() === 'queue') {
                const pending = groupReports.filter(r => r.status === 'pending');

                if (pending.length === 0) {
                    return extra.reply(
                        `✅ SUCCESS\n\n` +
                        `📋 Pending Reports: None\n\n` +
                        `_All clear ${pick(SLANG.vibe)}_`
                    );
                }

                const lines = [
                    `📋 *REPORT QUEUE*`,
                    ``,
                    `_Pending: ${pending.length}_`,
                    ``,
                ];

                for (const r of pending) {
                    lines.push(`*#${r.number}* — ${r.status.toUpperCase()}`);
                    lines.push(`👤 @${r.reportedBy.split('@')[0]}`);
                    lines.push(`📝 ${r.reason}`);
                    lines.push(`----------`);
                }

                lines.push(`_Use .report dismiss <number> to acknowledge_`);

                const mentions = pending.map(r => r.reportedBy);

                return sock.sendMessage(from, {
                    text: lines.join('\n'),
                    mentions
                }, { quoted: msg });
            }

            // .report dismiss <number>
            if (args.length >= 2 && args[0].toLowerCase() === 'dismiss') {
                const isGroupAdmin = metadata.participants.some(p =>
                    (p.id === sender) && (p.admin === 'admin' || p.admin === 'superadmin')
                );

                if (!isGroupAdmin) {
                    return extra.reply(`❌ ERROR\n\nOnly admins can dismiss reports`);
                }

                const number = parseInt(args[1]);
                const report = groupReports.find(r => r.number === number);

                if (!report) {
                    return extra.reply(
                        `❌ ERROR\n\nReport #${number} not found\nUse .report queue to see pending reports`
                    );
                }

                if (report.status === 'dismissed') {
                    return extra.reply(`❌ ERROR\n\nReport #${number} is already dismissed`);
                }

                report.status = 'dismissed';

                return extra.reply(
                    `✅ SUCCESS\n\n🗑️ Report #${number} Dismissed\n📝 Reason: ${report.reason}`
                );
            }

            // .report or .report anon — needs quoted message
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            if (!quotedMsg) {
                return extra.reply(
                    `❌ ERROR\n\nReply to a message to report it\n\n` +
                    `📝 Usage:\n` +
                    `• Reply → .report <reason>\n` +
                    `• Reply → .report anon <reason>\n` +
                    `• .report queue\n` +
                    `• .report dismiss <number>`
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

            // Block admin reports
            const isReportedAdmin = metadata.participants.some(p =>
                (p.id === reportedBy) && (p.admin === 'admin' || p.admin === 'superadmin')
            );

            if (isReportedAdmin) {
                // Check if owner is in the group
                const config = require('../../config');
                const ownerJids = (config.ownerNumber || []).map(n => {
                    const clean = n.replace(/\D/g, '');
                    return clean + '@s.whatsapp.net';
                });
                const ownerInGroup = metadata.participants.some(p => ownerJids.includes(p.id));

                if (ownerInGroup) {
                    const ownerJid = ownerJids.find(jid => 
                        metadata.participants.some(p => p.id === jid)
                    );
                    return sock.sendMessage(from, {
                        text: `❌ ERROR\n\nYou can't report admins\n\nIf you have an issue with an admin's conduct, DM the owner`,
                        mentions: [ownerJid]
                    }, { quoted: msg });
                } else {
                    return extra.reply(
                        `❌ ERROR\n\nYou can't report admins\n\nIf you have an issue with an admin's conduct, DM the owner at *084 082 0712*`
                    );
                }
            }

            let isAnonymous = false;
            let reasonParts = [...args];
            if (args.length >= 1 && args[0].toLowerCase() === 'anon') {
                isAnonymous = true;
                reasonParts = args.slice(1);
            }
            const reason = reasonParts.join(' ').trim() || 'No reason given';

            const admins = metadata.participants
                .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                .map(p => p.id);

            if (admins.length === 0) {
                return extra.reply(`❌ ERROR\n\nNo admins found in this group`);
            }

            const reportNum = reportCounters.get(from) + 1;
            reportCounters.set(from, reportNum);

            const reportData = {
                number: reportNum,
                reportedBy: sender,
                reportedUser: reportedBy,
                reason,
                message: reportedText,
                time: Date.now(),
                status: 'pending',
                anonymous: isAnonymous,
                groupName: metadata.subject || 'Unknown Group'
            };
            groupReports.push(reportData);

            if (groupReports.length > 20) {
                groupReports.shift();
            }

            const reportTime = new Date().toLocaleString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                month: 'short',
                day: 'numeric'
            });

            const reporterLine = isAnonymous
                ? `👤 Reported by: Anonymous`
                : `👤 Reported by: @${sender.split('@')[0]}`;

            const reportText = [
                `🚨 *REPORT #${reportNum}*`,
                ``,
                `📍 Group: ${metadata.subject}`,
                reporterLine,
                `📌 Reported user: @${reportedBy.split('@')[0]}`,
                `⏰ Time: ${reportTime}`,
                `📝 Reason: ${reason}`,
                `📊 Status: PENDING`,
                ``,
                `----------`,
                `💬 Message:`,
                `${reportedText.substring(0, 500)}${reportedText.length > 500 ? '...' : ''}`,
                `----------`,
                ``,
                `_Use .report dismiss ${reportNum} in the group to acknowledge_`
            ].join('\n');

            // DM each admin
            let dmed = 0;
            for (const adminJid of admins) {
                try {
                    await sock.sendMessage(adminJid, {
                        text: reportText,
                        mentions: isAnonymous ? [reportedBy] : [sender, reportedBy]
                    });
                    dmed++;
                } catch (e) {
                    console.error(`[REPORT] Failed to DM admin ${adminJid}:`, e.message);
                }
            }

            // Confirm to reporter
            const reporterMsg = isAnonymous
                ? `✅ SUCCESS\n\n🚨 Anonymous report #${reportNum} sent to ${dmed} admin(s)`
                : `✅ SUCCESS\n\n🚨 Report #${reportNum} sent to ${dmed} admin(s)`;

            await extra.reply(reporterMsg);

            await sock.sendMessage(from, {
                react: { text: '🚨', key: msg.key }
            });

        } catch (error) {
            await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — ${error.message}`);
        }
    }
};
