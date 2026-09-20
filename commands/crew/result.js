const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

module.exports = {
  subName: 'result',
  name: null,
  description: 'Log event results',
  usage: '.crew result <event-id> <winner>',
  adminOnly: true,
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    const jid = extra.from;
    const sender = msg.key.participant || msg.key.remoteJid;

    if (!args || args.length < 2) {
      return sock.sendMessage(jid, {
        text: `❌ *ERROR*\n\nUsage: \`.crew result <event-id> <winner>\`\nExample: \`.crew result evt_1234567890 Mfowethu\`\n\nLog the results of the event.`
      });
    }

    const eventId = args[0];
    const winner = args.slice(1).join(' ');

    const team = database.getTeam(jid);
    if (!team || !team.events || !team.events[eventId]) {
      return sock.sendMessage(jid, {
        text: `❌ *ERROR*\n\nThat event: *${eventId}* doesn't exist.\nSee all events with: \`.crew events\``
      });
    }

    const event = team.events[eventId];

    if (event.status === 'completed') {
      return sock.sendMessage(jid, {
        text: `❌ *ERROR*\n\nThat event is already done. Results are already logged.\n\n🏆 *Winner:* ${event.winner}`
      });
    }

    event.status = 'completed';
    event.winner = winner;
    event.completedAt = new Date().toISOString();
    database.updateTeam(jid, team);

    const winnerMember = database.getCrewMember(jid, winner);
    const winnerDisplay = winnerMember ? winnerMember.name : winner;

    return sock.sendMessage(jid, {
      text: `🏁 *EVENT RESULT*\n\n` +
        `🏆 *Winner:* ${winnerDisplay}\n\n` +
        `🏎️ *Event:* ${event.name}\n` +
        `⏰ *Time:* ${event.time}\n` +
        `👥 *Attending:* ${event.attendees ? event.attendees.length : 0}\n` +
        `📅 *Completed:* ${new Date().toLocaleString()}\n\n` +
        `_Lekka one, mfowethu! 🏎️💨_`
    });
  }
};