/**
 * NSFW Command - Toggle NSFW commands for this group
 * Gates every command flagged `nsfw: true` (handler.js checks
 * database.getGroupSettings(from).nsfw). Default is off — groups must
 * opt in via an admin.
 */

const database = require('../../database');
const config = require('../../config');
const { voice } = require('../../utils/format');

module.exports = {
    name: 'nsfw',
    reactions: { received: '🔞', done: '✅' },
    aliases: [],
    category: 'admin',
    description: 'Allow or block NSFW commands in this group',
    usage: '.nsfw <on/off/status>',
    groupOnly: true,
    adminOnly: true,

    async execute(sock, msg, args, extra) {
        try {
            const settings = database.getGroupSettings(extra.from);

            if (!args[0] || args[0].toLowerCase() === 'status') {
                const status = settings.nsfw ? 'ON' : 'OFF';
                return extra.reply(
                    `🔞 *NSFW STATUS*\n\n` +
                    `⚡ *Status:* ${status}\n\n` +
                    `_NSFW commands (hwaifu, hneko, milf, etc.) are ${
                        settings.nsfw ? 'allowed' : 'blocked'
                    } in this group._\n\n` +
                    `💡 *Usage:* ${config.prefix || '.'}nsfw on | ${config.prefix || '.'}nsfw off`
                );
            }

            const opt = args[0].toLowerCase();

            if (opt === 'on') {
                if (settings.nsfw) {
                    return extra.reply(`✅ *SUCCESS*\n\nNSFW was already on`);
                }
                database.updateGroupSettings(extra.from, { nsfw: true });
                return extra.reply(
                    `✅ *SUCCESS*\n\n` +
                    `🔞 NSFW commands *enabled* in this group\n\n` +
                    `_Admins take responsibility for what members pull, ${voice.tag('neutral')}_`
                );
            }

            if (opt === 'off') {
                if (!settings.nsfw) {
                    return extra.reply(`✅ *SUCCESS*\n\nNSFW was already off`);
                }
                database.updateGroupSettings(extra.from, { nsfw: false });
                return extra.reply(`✅ *SUCCESS*\n\n🔞 NSFW commands *disabled* in this group`);
            }

            extra.fail();
            return extra.reply(
                `❌ *ERROR*\n\n💡 *Usage:*\n` +
                `• ${config.prefix || '.'}nsfw on\n` +
                `• ${config.prefix || '.'}nsfw off\n` +
                `• ${config.prefix || '.'}nsfw status`
            );
        } catch (error) {
            extra.fail();
            await extra.reply(`❌ *ERROR*\n\n💡 ${voice.openErr()} — ${error.message}`);
        }
    }
};
