const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

module.exports = {
  name: 'banner',
  usage: '.crew banner',
  ownerOnly: true,

  async execute(message, args) {
    const quotedMsg = message.quoted;

    if (!quotedMsg || !quotedMsg.message || !quotedMsg.message.imageMessage) {
      return message.reply(
        `❌ ERROR\n\nPlease reply to an image to set it as crew banner.\nUsage: Reply to image then run *.crew banner*`
      );
    }

    const imageUrl = quotedMsg.message.imageMessage.url;

    const crew = database.getCrew();
    database.updateCrew({ ...crew, banner: imageUrl });

    message.reply(
      `✅ SUCCESS\n\n🖼️ BANNER UPDATED\n\nCrew banner has been changed.\nAll members will see this update.`
    );
  }
};
