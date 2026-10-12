const database = require('../../database');

const config = require('../../config');
const { sendButtons } = require('../../utils/buttonHelper');
const { sortUpcoming } = require('./crewHelpers');

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

    response += `\n_tap to RSVP (taps again to cancel):_`;

    // Max 10 buttons — cap events shown as buttons at 7 (+ refresh + menu)
    const shown = upcoming.slice(0, 7);
    const buttons = shown.map(([, evt], i) => ({
      id: `again:attend:${i + 1}`,
      text: `✅ ${evt.name.slice(0, 18)} ${i + 1}`,
    }));
    buttons.push({ id: 'again:events', text: '🔄 Refresh' });

    return sendButtons(sock, jid, {
      text: response,
      footer: config.botName || 'KAMI Bot',
      buttons,
    }, msg);
  }
};
