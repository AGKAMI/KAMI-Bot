const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

module.exports = {
  name: 'events',
  description: 'View upcoming crew events',
  usage: '.crew events',
  adminOnly: false,
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    const jid = extra.from;

    const allEvents = database.getCrewEvents(jid);

    if (!allEvents || Object.keys(allEvents).length === 0) {
      return sock.sendMessage(jid, {
        text: `❌ ERROR\n\nAkukho mehlangano ezayo khona manje.\nUmdalile ngenye nge: *.crew event <name> <time>*`
      });
    }

    const now = new Date();
    const upcomingEvents = Object.entries(allEvents)
      .filter(([id, evt]) => evt.status === 'upcoming')
      .sort((a, b) => {
        const timeA = a[1].time.split(':').map(Number);
        const timeB = b[1].time.split(':').map(Number);
        return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
      });

    if (upcomingEvents.length === 0) {
      return sock.sendMessage(jid, {
        text: `❌ ERROR\n\nAkukho mehlangano ezayo khona manje.\nUmdalile ngenye nge: *.crew event <name> <time>*`
      });
    }

    let response = `📅 UPCOMING EVENTS\n\n`;

    upcomingEvents.forEach(([id, evt], index) => {
      const attendeeCount = evt.attendees ? evt.attendees.length : 0;
      response += `🗓️ *${evt.name}*\n`;
      response += `   ⏰ Isikhathi: *${evt.time}*\n`;
      response += `   👥 Abadlalayo: *${attendeeCount}*\n`;
      response += `   🆔 ID: *${id}*\n`;
      if (index < upcomingEvents.length - 1) {
        response += `\n`;
      }
    });

    response += `\nQhafaza kumhlangano nge: *.crew attend <event-id>*`;

    return sock.sendMessage(jid, { text: response });
  }
};
