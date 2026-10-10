const database = require('../../database');

const config = require('../../config');

// Same time-of-day sort used by events.js — keep both in sync.
// Missing status = upcoming (events written before status was persisted).
const sortUpcoming = (allEvents) => Object.entries(allEvents)
  .filter(([, evt]) => !evt.status || evt.status === 'upcoming')
  .sort((a, b) => {
    const timeA = a[1].time.split(':').map(Number);
    const timeB = b[1].time.split(':').map(Number);
    return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
  });

module.exports = {
  subName: 'attend',
  name: 'attend',
  category: 'crew',
  description: 'RSVP to a crew event — toggles you in/out',
  usage: '.attend [number] · no number = first/only event',
  adminOnly: false,
  groupOnly: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    const jid = extra.from;
    const sender = msg.key.participant || msg.key.remoteJid;

    const allEvents = database.getCrewEvents(jid);
    const upcoming = allEvents ? sortUpcoming(allEvents) : [];

    if (upcoming.length === 0) {
      return sock.sendMessage(jid, {
        text: `❌ *ERROR*\n\nNo events coming up.\nMake one with: \`${prefix}event <name> <time>\``
      });
    }

    // Resolve which event: number from .events list, bare ID, or the only/first one
    let eventId;
    const arg = args && args[0];

    if (arg && /^\d+$/.test(arg)) {
      const idx = parseInt(arg, 10) - 1;
      if (!upcoming[idx]) {
        return sock.sendMessage(jid, {
          text: `❌ *ERROR*\n\nOnly ${upcoming.length} event${upcoming.length === 1 ? '' : 's'} coming up.\nSee them with: \`${prefix}events\``
        });
      }
      eventId = upcoming[idx][0];
    } else if (arg && allEvents[arg]) {
      eventId = arg; // old-style evt_xxx ID still works
    } else {
      eventId = upcoming[0][0]; // no arg → first/only event
    }

    const team = database.getTeam(jid);
    const event = team && team.events ? team.events[eventId] : null;

    if (!event) {
      return sock.sendMessage(jid, {
        text: `❌ *ERROR*\n\nNo event with that number.\nSee them with: \`${prefix}events\``
      });
    }

    if (event.status && event.status !== 'upcoming') {
      return sock.sendMessage(jid, {
        text: `❌ *ERROR*\n\nThat one is done and dusted.\nSee what's next with: \`${prefix}events\``
      });
    }

    if (!event.attendees) {
      event.attendees = [];
    }

    const isAttending = event.attendees.includes(sender);
    const count = () => event.attendees.length;

    if (isAttending) {
      event.attendees = event.attendees.filter(a => a !== sender);
      database.updateTeam(jid, team);
      return sock.sendMessage(jid, {
        text: `✅ You're out of *${event.name}* (${count()} going)`
      });
    }

    event.attendees.push(sender);
    database.updateTeam(jid, team);
    return sock.sendMessage(jid, {
      text: `✅ You're locked in for *${event.name}* at *${event.time}* (${count()} going)`
    });
  }
};
