const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

module.exports = {
  name: 'leaderboard',
  alias: ['lb', 'top'],
  category: 'crew',
  usage: '.crew leaderboard',
  description: 'See the most active crew members',
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

      const sorted = members
        .sort((a, b) => (b.checkins || 0) - (a.checkins || 0))
        .slice(0, 10);

      let leaderboard = '';

      for (let i = 0; i < sorted.length; i++) {
        const member = sorted[i];
        const checkins = member.checkins || 0;
        let rank = '';

        if (i === 0) {
          rank = '🥇';
        } else if (i === 1) {
          rank = '🥈';
        } else if (i === 2) {
          rank = '🥉';
        } else {
          rank = `   ${i + 1}.`;
        }

        leaderboard += `${rank} ${bold(member.name)} — ${checkins} check-ins\n`;
      }

      const yourMember = await database.getCrewMember(jid);
      let yourRank = '';
      if (yourMember) {
        const allSorted = members.sort((a, b) => (b.checkins || 0) - (a.checkins || 0));
        const yourIndex = allSorted.findIndex(m => m.name === yourMember.name);
        if (yourIndex >= 0) {
          yourRank = `\n🇰 *Your rank:* #${yourIndex + 1}`;
        }
      }

      return msg.reply(
        `🏆 LEADERBOARD\n` +
        `\n` +
        `📅 *Slammed Society — Most Active*\n` +
        `\n` +
        leaderboard +
        yourRank +
        `\n` +
        `\n` +
        `_Check in daily to climb the ranks!_`
      );
    } catch (err) {
      return msg.reply(
        `❌ ERROR\n` +
        `\n` +
        `🇼 Something went wrong fetching leaderboard.\n` +
        `Try again later.`
      );
    }
  }
};
