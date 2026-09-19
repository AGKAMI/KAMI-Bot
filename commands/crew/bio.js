const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

module.exports = {
  name: 'bio',
  usage: '.crew bio <text>',
  ownerOnly: true,

  async execute(message, args) {
    const newBio = args.join(' ').trim();

    if (!newBio) {
      return message.reply(
        `❌ ERROR\n\nPlease provide a crew bio.\nUsage: *.crew bio <text>*`
      );
    }

    const crew = database.getCrew();
    database.updateCrew({ ...crew, bio: newBio });

    message.reply(
      `✅ SUCCESS\n\n📝 BIO UPDATED\n\nNew crew bio: *${newBio}*\n\nAll members will see this change.`
    );
  }
};
