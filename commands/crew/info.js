const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

module.exports = {
  name: 'info',
  usage: '.crew info',
  ownerOnly: false,

  async execute(message, args) {
    const crew = database.getCrew();
    const stats = database.getCrewStats();

    if (!crew || !crew.name) {
      return message.reply(
        `❌ ERROR\n\nNo crew has been created yet.\nOwner must run *.crew name <name>* first.`
      );
    }

    let response = `🔰 CREW INFO\n\n`;
    response += `🏷️ Name: *${crew.name}*\n`;
    response += `📝 Bio: ${crew.bio || 'Not set'}\n\n`;

    response += `👥 MEMBERS\n`;
    response += `• Total: *${stats.members}*\n`;
    response += `• Pending: *${stats.pending}*\n`;

    if (stats.teams && Object.keys(stats.teams).length > 0) {
      response += `\n🏗️ TEAMS\n`;
      for (const [team, count] of Object.entries(stats.teams)) {
        response += `• ${bold(team)}: *${count}*\n`;
      }
    }

    response += `\n📅 EVENTS: *${stats.events}*\n`;

    if (crew.createdAt) {
      response += `\n📆 Created: ${new Date(crew.createdAt).toLocaleDateString()}\n`;
    }

    message.reply(response);
  }
};
