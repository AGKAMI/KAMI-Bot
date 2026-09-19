const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

module.exports = {
  name: 'activity',
  alias: [],
  category: 'crew',
  usage: '.crew activity [period]',
  description: 'See who is active or inactive in the crew',
  groupOnly: true,

  async execute(msg, args) {
    const jid = msg.sender;

    try {
      const period = args[0] || '1d';
      const days = parseInt(period) || 1;

      const members = await database.getCrewMembers();

      if (!members || !Array.isArray(members) || members.length === 0) {
        return msg.reply(
          `❌ ERROR\n` +
          `\n` +
          `🇼 No crew members found.\n` +
          `Something wrong with the system.`
        );
      }

      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(now.getDate() - days);

      let active = [];
      let inactive = [];

      for (const member of members) {
        const lastCheckin = member.lastCheckin;
        if (!lastCheckin) {
          inactive.push({ name: member.name, checkins: member.checkins || 0 });
          continue;
        }

        const lastDate = new Date(lastCheckin);
        if (lastDate >= startDate) {
          active.push({ name: member.name, checkins: member.checkins || 0 });
        } else {
          inactive.push({ name: member.name, checkins: member.checkins || 0 });
        }
      }

      let activeList = '';
      if (active.length === 0) {
        activeList = `   No one checked in this period.`;
      } else {
        for (const m of active) {
          activeList += `   ✅ ${bold(m.name)} — ${m.checkins} check-ins\n`;
        }
      }

      let inactiveList = '';
      if (inactive.length === 0) {
        inactiveList = `   Everyone active!`;
      } else {
        for (const m of inactive) {
          inactiveList += `   ❌ ${bold(m.name)} — ${m.checkins} check-ins\n`;
        }
      }

      return msg.reply(
        `📊 ACTIVITY\n` +
        `\n` +
        `📅 *Period:* Last ${days} day(s)\n` +
        `👥 *Total members:* ${members.length}\n` +
        `\n` +
        `✅ *ACTIVE* (${active.length})\n` +
        activeList +
        `\n` +
        `❌ *INACTIVE* (${inactive.length})\n` +
        inactiveList +
        `\n` +
        `_If you inactive, you slipping. Check in!_`
      );
    } catch (err) {
      return msg.reply(
        `❌ ERROR\n` +
        `\n` +
        `🇼 Something went wrong fetching activity.\n` +
        `Try again later.`
      );
    }
  }
};
