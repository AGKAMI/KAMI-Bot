const database = require('../../database');

const config = require('../../config');
const { sendButtons } = require('../../utils/buttonHelper');
const { mention } = require('../../utils/format');
const { sortUpcoming } = require('./crewHelpers');
const { serverByKey, fmtCardDate } = require('./cpmData');

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
        text: `❌ *ERROR*\n\nNo events coming up.\nMake one with: \`${prefix}event\``
      }, { quoted: msg });
    }

    let response = `📅 *UPCOMING EVENTS*\n\n`;
    const mentions = [];

    upcoming.forEach(([id, evt], index) => {
      const going = Array.isArray(evt.attendees) ? evt.attendees : [];
      // v1 legacy events only have name+time; v2 cards carry the works
      const when = [evt.eventDate ? fmtCardDate(evt.eventDate) : null, evt.time || (evt.eventDate ? null : '⚡ now-now')].filter(Boolean).join(' · ');
      response += `*${index + 1}.* 🗓️ *${evt.name}* — ${when} · 👥 ${going.length} going\n`;
      if (going.length) {
        mentions.push(...going);
        response += `   ${going.map(a => mention(a)).join(' ')}\n`;
      }
      const hostBits = [];
      if (evt.host) hostBits.push(`👤 ${evt.host}`);
      if (evt.cpmId) hostBits.push(`🆔 ${evt.cpmId}`);
      if (hostBits.length) response += `   ${hostBits.join(' · ')}\n`;
      const carBits = [];
      const sv = evt.serverKey ? serverByKey(evt.serverKey) : null;
      if (sv) carBits.push(`🌐 ${sv.flag} ${sv.name}`);
      if (evt.carType) carBits.push(`🚗 ${evt.carType}`);
      if (carBits.length) response += `   ${carBits.join(' · ')}\n`;
    });

    response += `\n_tap ✅ to pull up — ${prefix}attend <nr> bails you out_`;

    // Max 10 buttons — cap events shown as buttons at 7 (+ refresh)
    const shown = upcoming.slice(0, 7);
    const buttons = shown.map(([id, evt], i) => ({
      id: `evrsvp:in:${id}`,
      text: `✅ ${i + 1}. ${evt.name.slice(0, 16)}`,
    }));
    buttons.push({ id: 'again:events', text: '🔄 Refresh' });

    return sendButtons(sock, jid, {
      text: response,
      footer: config.botName || 'KAMI Bot',
      buttons,
      mentions,
    }, msg);
  }
};
