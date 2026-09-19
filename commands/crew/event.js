const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

module.exports = {
  subName: '',
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
        text: `❌ ERROR\n\nNmsebenzisa: *.crew event <name> <time>*\nExample: *.crew event Friday Drift 20:30*\n\nUsitshele igama ledrift nemva kwesikhathi.`
      });
    }

    const time = args[args.length - 1];
    const name = args.slice(0, -1).join(' ');

    if (!/^\d{1,2}:\d{2}$/.test(time)) {
      return sock.sendMessage(jid, {
        text: `❌ ERROR\n\nIsikhathi kufanele sibe muhle: *HH:MM*\nExample: *20:30*\n\nWakwenzela: *${time}*`
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
      text: `📅 EVENT CREATED\n\n` +
        `🏎️ *Igama:* ${name}\n` +
        `⏰ *Isikhathi:* ${time}\n` +
        `👤 *Umdalile:* ${creatorName}\n` +
        `🆔 *Event ID:* ${eventId}\n\n` +
        `Buka yonke imihlangano nge: *.crew events*\n` +
        `Abantu bangadlala nge: *.crew attend ${eventId}*`
    });
  }
};
