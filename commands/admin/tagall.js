/**
 * Tag All Command - Mention all group members
 */

const { bold, pick, SLANG, mention } = require('../../utils/format');

module.exports = {
    name: 'tagall',
    reactions: { received: '👥', done: '📣' },
    aliases: ['mentionall', 'everyone'],
    category: 'admin',
    description: 'Tag all group members',
    usage: '.tagall <message>',
    groupOnly: true,
    adminOnly: true,
    botAdminNeeded: true,
    
    async execute(sock, msg, args, extra) {
      try {
        const message = args.join(' ') || 'Everyone!';

        // groupMetadata can be null (the owner bypasses groupOnly and can
        // run this from a DM; a 403/forbidden group also yields null) —
        // dereferencing .participants on it threw "Cannot read properties
        // of null" straight at the user.
        const participants = (extra.groupMetadata?.participants || []).map(p => p.id);

        if (participants.length === 0) {
          extra.fail();
          return extra.reply(`❌ *ERROR*\n\nCouldn't read this group's member list`);
        }

        let text = `📢 *GROUP ANNOUNCEMENT*\n\n`;
        text += `${message}\n\n`;
        text += `👥 *Tagged Members*:\n`;

        participants.forEach((participant, index) => {
          text += `${index + 1}. ${mention(participant)}\n`;
        });

        await sock.sendMessage(extra.from, {
          text,
          mentions: participants
        }, { quoted: msg });

      } catch (error) {
        extra.fail();
        // Never surface a raw JS message ("Cannot read properties of …").
        // Command-local error text, or nothing at all.
        extra.reply(`❌ *ERROR*\n\nCouldn't tag the group — try again`);
      }
    }
  };
  