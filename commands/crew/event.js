const database = require('../../database');

const config = require('../../config');
module.exports = {
  subName: 'event',
  name: 'event',
  category: 'crew',
  description: 'Line up a new crew event',
  usage: '.event <name> <time>',
  adminOnly: true,
  groupOnly: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    const jid = extra.from;
    const sender = msg.key.participant || msg.key.remoteJid;

    if (!args || args.length < 2) {
      return sock.sendMessage(jid, {
        text: `❌ *ERROR*\n\nUsage: \`${prefix}event <name> <time>\`\nExample: \`${prefix}event Friday Drift 20:30\`\n\nDrop the event name and the time.`
      });
    }

    const time = args[args.length - 1];
    const name = args.slice(0, -1).join(' ');

    if (!/^\d{1,2}:\d{2}$/.test(time)) {
      return sock.sendMessage(jid, {
        text: `❌ *ERROR*\n\nTime must be *HH:MM*\nExample: *20:30*\n\nYou sent: *${time}*`
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

    return sock.sendMessage(jid, {
      text: `📅 *EVENT CREATED*\n\n` +
        `🏎️ *${name}*\n` +
        `⏰ *${time}*\n\n` +
        `Everyone RSVPs with: \`${prefix}attend\``
    });
  }
};
