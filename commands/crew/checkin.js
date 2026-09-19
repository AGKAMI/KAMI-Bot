const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

module.exports = {
  name: 'checkin',
  alias: [],
  category: 'crew',
  usage: '.crew checkin',
  description: 'Daily check-in to track your crew activity',
  groupOnly: true,

  async execute(msg, args) {
    const jid = msg.sender;

    try {
      const today = new Date().toISOString().slice(0, 10);
      const member = await database.getCrewMember(jid);

      if (!member) {
        return msg.reply(
          `❌ ERROR\n` +
          `\n` +
          `🇼 You not part of any crew.\n` +
          `Join a crew first before tryna check in.`
        );
      }

      if (member.lastCheckin === today) {
        return msg.reply(
          `❌ ERROR\n` +
          `\n` +
          `🇼 You already checked in today, ${bold(member.name)}!\n` +
          `No need to double up. See you tomorrow.`
        );
      }

      await database.addCheckin(jid);

      const updated = await database.getCrewMember(jid);
      const checkinCount = updated.checkins || 1;

      let streakText = '';
      if (checkinCount >= 7) {
        streakText = `\n🔥 *Streak:* ${checkinCount} days — you not playing!`;
      } else if (checkinCount >= 3) {
        streakText = `\n💪 *Streak:* ${checkinCount} days — keep it going!`;
      } else {
        streakText = `\n📋 *Total check-ins:* ${checkinCount}`;
      }

      const checkinsToday = await database.getCheckins(today);
      const totalChecked = Array.isArray(checkinsToday) ? checkinsToday.length : 0;

      return msg.reply(
        `✅ CHECKED IN\n` +
        `\n` +
        `🇰 ${bold(member.name)} checked in for today!\n` +
        `📅 *Date:* ${today}\n` +
        `👥 *Crew checked in today:* ${totalChecked}` +
        streakText +
        `\n` +
        `\n` +
        `_Keep that streak going, don't slack!_`
      );
    } catch (err) {
      return msg.reply(
        `❌ ERROR\n` +
        `\n` +
        `🇼 Something went wrong with the check-in.\n` +
        `Try again later.`
      );
    }
  }
};
