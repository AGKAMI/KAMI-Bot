const database = require('../../database');

const config = require('../../config');

// Same time-of-day sort used by attend.js — keep both in sync.
// Missing status = upcoming (events written before status was persisted).
const sortUpcoming = (allEvents) => Object.entries(allEvents)
  .filter(([, evt]) => !evt.status || evt.status === 'upcoming')
  .sort((a, b) => {
    const timeA = a[1].time.split(':').map(Number);
    const timeB = b[1].time.split(':').map(Number);
    return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
  });

module.exports = {
  subName: 'events',
  name: 'events',
  category: 'crew',
  description: 'View upcoming crew events',
  usage: '.events',
  adminOnly: false,
  groupOnly: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    const jid = extra.from;

    const allEvents = database.getCrewEvents(jid);
    const upcoming = allEvents ? sortUpcoming(allEvents) : [];

    if (upcoming.length === 0) {
      return sock.sendMessage(jid, {
        text: `❌ *ERROR*\n\nNo events coming up.\nMake one with: \`${prefix}event <name> <time>\``
      });
    }

    let response = `📅 *UPCOMING EVENTS*\n\n`;

    upcoming.forEach(([id, evt], index) => {
      const attendeeCount = evt.attendees ? evt.attendees.length : 0;
      response += `*${index + 1}.* 🗓️ *${evt.name}*\n`;
      response += `   ⏰ ${evt.time} · 👥 ${attendeeCount} going\n`;
    });

    response += `\nRSVP: \`${prefix}attend <number>\` — eg \`${prefix}attend 1\``;

    return sock.sendMessage(jid, { text: response });
  }
};
