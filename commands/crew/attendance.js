const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

module.exports = {
  name: 'attendance',
  alias: ['attend'],
  category: 'crew',
  usage: '.crew attendance [event-id]',
  description: 'See who attended the last event or a specific event',
  groupOnly: true,

  async execute(msg, args) {
    const jid = msg.sender;

    try {
      const members = await database.getCrewMembers();

      if (!members || !Array.isArray(members) || members.length === 0) {
        return msg.reply(
          `❌ ERROR\n` +
          `\n` +
          `🇼 No crew members found.\n` +
          `Something wrong with the system.`
        );
      }

      let eventId = args[0] || null;
      let eventTitle = '';
      let attendees = [];

      if (eventId) {
        eventTitle = `*Event ${eventId}*`;

        const allCheckins = await database.getCheckins();
        if (Array.isArray(allCheckins) && allCheckins.length > 0) {
          for (const checkin of allCheckins) {
            if (checkin.eventId && String(checkin.eventId) === String(eventId)) {
              attendees.push(checkin);
            }
          }
        }
      } else {
        eventTitle = 'Last Event';

        const today = new Date().toISOString().slice(0, 10);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().slice(0, 10);

        const todayCheckins = await database.getCheckins(today);
        if (Array.isArray(todayCheckins) && todayCheckins.length > 0) {
          attendees = todayCheckins;
          eventTitle = `Today (${today})`;
        } else {
          const yesterdayCheckins = await database.getCheckins(yesterdayStr);
          if (Array.isArray(yesterdayCheckins) && yesterdayCheckins.length > 0) {
            attendees = yesterdayCheckins;
            eventTitle = `Yesterday (${yesterdayStr})`;
          }
        }
      }

      let attendeeList = '';
      if (attendees.length === 0) {
        attendeeList = `   No attendance recorded yet.`;
      } else {
        for (let i = 0; i < attendees.length; i++) {
          const att = attendees[i];
          const name = att.name || att.memberName || att.jid || `Member ${i + 1}`;
          attendeeList += `   ${i + 1}. ${bold(name)}\n`;
        }
      }

      return msg.reply(
        `📋 ATTENDANCE\n` +
        `\n` +
        `🎉 *${eventTitle}*\n` +
        `👥 *Attendees:* ${attendees.length}\n` +
        `\n` +
        attendeeList +
        `\n` +
        `_Missing out means you falling behind. Be there!_`
      );
    } catch (err) {
      return msg.reply(
        `❌ ERROR\n` +
        `\n` +
        `🇼 Something went wrong fetching attendance.\n` +
        `Try again later.`
      );
    }
  }
};
