const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

module.exports = {
  name: 'attend',
  description: 'RSVP to a crew event',
  usage: '.crew attend <event-id> or .crew attend',
  adminOnly: false,
  groupOnly: true,

  async execute(message, args, sock) {
    const jid = message.key.remoteJid;
    const sender = message.key.participant || message.key.remoteJid;

    let eventId;

    if (args && args.length > 0) {
      eventId = args[0];
    } else {
      const allEvents = database.getCrewEvents();
      if (!allEvents || Object.keys(allEvents).length === 0) {
        return sock.sendMessage(jid, {
          text: `❌ ERROR\n\nAkukho mehlangano ezayo khona manje.\nUmdalile ngenye nge: *.crew event <name> <time>*`
        });
      }

      const upcoming = Object.entries(allEvents)
        .filter(([id, evt]) => evt.status === 'upcoming')
        .sort((a, b) => {
          const timeA = a[1].time.split(':').map(Number);
          const timeB = b[1].time.split(':').map(Number);
          return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
        });

      if (upcoming.length === 0) {
        return sock.sendMessage(jid, {
          text: `❌ ERROR\n\nAkukho mehlangano ezayo khona manje.\nUmdalile ngenye nge: *.crew event <name> <time>*`
        });
      }

      eventId = upcoming[0][0];
    }

    const crew = database.getCrew();
    if (!crew.events || !crew.events[eventId]) {
      return sock.sendMessage(jid, {
        text: `❌ ERROR\n\nMehlangano leyo: *${eventId}* ayikho.\nBuka yonke imihlangano nge: *.crew events*`
      });
    }

    const event = crew.events[eventId];

    if (event.status !== 'upcoming') {
      return sock.sendMessage(jid, {
        text: `❌ ERROR\n\nMehlangano leyo seyidlulile noma isiqedile.\nBuka yonke imihlangano nge: *.crew events*`
      });
    }

    if (!event.attendees) {
      event.attendees = [];
    }

    const isAttending = event.attendees.includes(sender);

    if (isAttending) {
      event.attendees = event.attendees.filter(a => a !== sender);
      database.updateCrew(crew);

      const member = database.getCrewMember(sender);
      const name = member ? member.name : sender.split('@')[0];

      return sock.sendMessage(jid, {
        text: `✅ SUCCESS\n\n*${name}* ususiwe ebhalisweni\n\n🏎️ *Mehlangano:* ${event.name}\n⏰ *Isikhathi:* ${event.time}\n👥 *Abadlalayo:* ${event.attendees.length}`
      });
    } else {
      event.attendees.push(sender);
      database.updateCrew(crew);

      const member = database.getCrewMember(sender);
      const name = member ? member.name : sender.split('@')[0];

      return sock.sendMessage(jid, {
        text: `✅ SUCCESS\n\n*${name}* ungenile ebhalisweni!\n\n🏎️ *Mehlangano:* ${event.name}\n⏰ *Isikhathi:* ${event.time}\n👥 *Abadlalayo:* ${event.attendees.length}`
      });
    }
  }
};
