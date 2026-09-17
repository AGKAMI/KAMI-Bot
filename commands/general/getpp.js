const axios = require('axios');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'getpp',
  aliases: ['gp', 'getpic'],
  category: 'general',
  description: 'Get profile picture of a user',
  usage: '.getpp (reply to message or tag user)',
  
  async execute(sock, msg, args, extra) {
    try {
      let targetUser = null;
      
      // Check if it's a reply
      const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (quotedMessage) {
        // Get the participant who sent the quoted message
        targetUser = msg.message.extendedTextMessage.contextInfo.participant;
      } else {
        // Check if user is tagged
        const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (mentionedJid && mentionedJid.length > 0) {
          targetUser = mentionedJid[0];
        } else {
          // If no reply or tag, use the sender of current message
          targetUser = extra.sender;
        }
      }
      
      if (!targetUser) {
        return extra.reply(`${italic('who are you looking for? reply to a message or tag someone')}`);
      }
      
      try {
        // Try to get the profile picture
        const ppUrl = await sock.profilePictureUrl(targetUser, 'image');
        
        if (!ppUrl) {
          return extra.reply(`❌ _${pick(SLANG.error)} — no profile pic found for this oke_`);
        }
        
        // Download the profile picture
        const response = await axios.get(ppUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        
        // Send the profile picture
        await sock.sendMessage(extra.from, { 
          image: buffer,
          caption: `${bold('Profile picture')} of @${targetUser.split('@')[0]}`,
          mentions: [targetUser]
        }, { quoted: msg });
        
      } catch (profileError) {
        // Handle different types of errors
        if (profileError.message?.includes('item-not-found') || 
            profileError.output?.statusCode === 404 || 
            profileError.output?.statusCode === 500 ||
            profileError.message?.includes('not found')) {
          return extra.reply(`❌ _${pick(SLANG.error)} — no profile pic found for this oke_`);
        } else if (profileError.output?.statusCode === 401 || 
                   profileError.message?.includes('forbidden') || 
                   profileError.message?.includes('unauthorized')) {
          return extra.reply(`❌ _${pick(SLANG.error)} — profile pic is private or not available_`);
        } else {
          return extra.reply(`❌ _${pick(SLANG.error)} — no profile pic found for this oke_`);
        }
      }
      
    } catch (error) {
      extra.reply(`❌ _${pick(SLANG.error)} — no profile pic found for this oke_`);
    }
  }
};