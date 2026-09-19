const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

module.exports = {
  name: 'name',
  usage: '.crew name <name>',
  ownerOnly: true,

  async execute(message, args) {
    const newName = args.join(' ').trim();

    if (!newName) {
      return message.reply(
        `❌ ERROR\n\nPlease provide a crew name.\nUsage: *.crew name <name>*`
      );
    }

    const crew = database.getCrew();
    database.updateCrew({ ...crew, name: newName });

    message.reply(
      `✅ SUCCESS\n\n📝 NAME UPDATED\n\nNew crew name: *${newName}*\n\nAll members will see this change.`
    );
  }
};
