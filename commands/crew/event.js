const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

module.exports = {
  subName: 'event',
  name: null,
  description: 'Schedule a new crew event',
  usage: '.crew event <name> <time>',
  adminOnly: true,
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    const jid = extra.from;
    const sender = msg.key.participant || msg.key.remoteJid;

    if (!args || args.length < 2) {
      return sock.sendMessage(jid, {
        text: `❌ *ERROR*\n\nUsage: \`.crew event <name> <time>\`\nExample: \`.crew event Friday Drift 20:30\`\n\nGive us the event name and the time, ${pick(SLANG.friend)}.`
      });
    }

    const time = args[args.length - 1];
    const name = args.slice(0, -1).join(' ');

    if (!/^\d{1,2}:\d{2}$/.test(time)) {
      return sock.sendMessage(jid, {
        text: `❌ *ERROR*\n\nTime must be in *HH:MM* format\nExample: *20:30*\n\nYou sent: *${time}*`
      });
    }

    const eventId = `evt_${Date.now()}`;

    database.addCrewEvent(jid, eventId, {
      name,
      time,
      createdBy: sender,
      attendees: [],
      status: 'upcoming',
      createdAt: new Date().toISOString()
    });

    const member = database.getCrewMember(jid, sender);
    const creatorName = member ? member.name : sender.split('@')[0];

    return sock.sendMessage(jid, {
      text: `📅 *EVENT CREATED*\n\n` +
        `🏎️ *Name:* ${name}\n` +
        `⏰ *Time:* ${time}\n` +
        `👤 *Created by:* ${creatorName}\n` +
        `🆔 *Event ID:* ${eventId}\n\n` +
        `See all events with: \`.crew events\`\n` +
        `Members can RSVP with: \`.crew attend ${eventId}\``
    });
  }
};