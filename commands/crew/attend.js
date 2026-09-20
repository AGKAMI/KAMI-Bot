const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

module.exports = {
  subName: 'attend',
  name: null,
  description: 'RSVP to a crew event',
  usage: '.crew attend <event-id> or .crew attend',
  adminOnly: false,
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    const jid = extra.from;
    const sender = msg.key.participant || msg.key.remoteJid;

    let eventId;

    if (args && args.length > 0) {
      eventId = args[0];
    } else {
      const allEvents = database.getCrewEvents(jid);
      if (!allEvents || Object.keys(allEvents).length === 0) {
        return sock.sendMessage(jid, {
          text: `❌ *ERROR*\n\nNo upcoming events right now ${pick(SLANG.vibe)}\nMake one with: \`.crew event <name> <time>\``
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
          text: `❌ *ERROR*\n\nNo upcoming events right now ${pick(SLANG.vibe)}\nMake one with: \`.crew event <name> <time>\``
        });
      }

      eventId = upcoming[0][0];
    }

    const team = database.getTeam(jid);
    if (!team || !team.events || !team.events[eventId]) {
      return sock.sendMessage(jid, {
        text: `❌ *ERROR*\n\nThat event: *${eventId}* doesn't exist.\nSee all events with: \`.crew events\``
      });
    }

    const event = team.events[eventId];

    if (event.status !== 'upcoming') {
      return sock.sendMessage(jid, {
        text: `❌ *ERROR*\n\nThat event is done or already finished.\nSee all events with: \`.crew events\``
      });
    }

    if (!event.attendees) {
      event.attendees = [];
    }

    const isAttending = event.attendees.includes(sender);

    if (isAttending) {
      event.attendees = event.attendees.filter(a => a !== sender);
      database.updateTeam(jid, team);

      const member = database.getCrewMember(jid, sender);
      const name = member ? member.name : sender.split('@')[0];

      return sock.sendMessage(jid, {
        text: `✅ *SUCCESS*\n\n*${name}* unregistered from the event\n\n🏎️ *Event:* ${event.name}\n⏰ *Time:* ${event.time}\n👥 *Attending:* ${event.attendees.length}`
      });
    } else {
      event.attendees.push(sender);
      database.updateTeam(jid, team);

      const member = database.getCrewMember(jid, sender);
      const name = member ? member.name : sender.split('@')[0];

      return sock.sendMessage(jid, {
        text: `✅ *SUCCESS*\n\n*${name}* is in for this one!\n\n🏎️ *Event:* ${event.name}\n⏰ *Time:* ${event.time}\n👥 *Attending:* ${event.attendees.length}`
      });
    }
  }
};