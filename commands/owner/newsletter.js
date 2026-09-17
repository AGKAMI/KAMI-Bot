/**
 * Newsletter Command - Get newsletter information from WhatsApp channel link
 */

const { bold, italic, pick, SLANG } = require('../../utils/format');

/**
 * Extract invite code from WhatsApp channel link
 * @param {string} link - Channel link (e.g., https://whatsapp.com/channel/0029VaAbCdEfGhIJkL)
 * @returns {string|null} - Invite code or null if invalid
 */
function getChannelInviteCode(link) {
  try {
    // Clean the link
    let cleanLink = link.trim();
    
    // Remove any query parameters or fragments
    cleanLink = cleanLink.split('?')[0].split('#')[0];
    
    // Try to parse as URL first
    try {
      const url = new URL(cleanLink);
      const parts = url.pathname.split('/').filter(Boolean);
      const code = parts[parts.length - 1];
      if (code && code.length > 0) {
        return code;
      }
    } catch (urlError) {
      // If URL parsing fails, try regex extraction
    }
    
    // Regex patterns to extract invite code
    const patterns = [
      /(?:whatsapp\.com|wa\.me)\/channel\/([A-Za-z0-9]+)/i,
      /\/channel\/([A-Za-z0-9]+)/i,
      /channel\/([A-Za-z0-9]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = cleanLink.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    // If no pattern matches, check if the link itself is just the code
    if (/^[A-Za-z0-9]+$/.test(cleanLink)) {
      return cleanLink;
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting invite code:', error);
    return null;
  }
}


module.exports = {
  name: 'newsletter',
  aliases: ['channel', 'channelinfo', 'nl'],
  category: 'owner',
  description: 'Get newsletter information from WhatsApp channel link',
  usage: '.newsletter <channel link>',
  ownerOnly: true,
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      
      // Get link from args or message text
      const text = msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text ||
                   args.join(' ');
      
      if (!text || text.trim().length === 0) {
        return extra.reply(`${bold('📰 NEWSLETTER')}\n\n_${pick(SLANG.error)} — need a whatsapp channel link_\n\nExample: .newsletter https://whatsapp.com/channel/0029VaAbCdEfGhIJkL`);
      }
      
      let link = text.replace(/^\.(newsletter|nl|channel|channelinfo)\s+/i, '').trim() || args.join(' ').trim();
      
      if (!link || link.length === 0) {
        return extra.reply(`${bold('📰 NEWSLETTER')}\n\n_${pick(SLANG.error)} — need a whatsapp channel link_\n\nExample: .newsletter https://whatsapp.com/channel/0029VaAbCdEfGhIJkL`);
      }
      
      // Try to extract invite code first (works with or without full URL)
      const inviteCode = getChannelInviteCode(link);
      
      if (!inviteCode) {
        return extra.reply(`${bold(pick(SLANG.error))} — couldn't extract the invite code\n\nPlease provide a valid WhatsApp channel link.\nExample: https://whatsapp.com/channel/0029VaAbCdEfGhIJkL\n\nOr just the invite code: .newsletter 0029VaAbCdEfGhIJkL`);
      }
      
      // Use the extracted invite code directly
      link = inviteCode;
      
     
      
      try {
        // Get newsletter metadata using the invite code directly
        const meta = await sock.newsletterMetadata('invite', link);
        
        if (!meta) {
          throw new Error('Newsletter not found');
        }
        
        // Format the response
        let infoText = `${bold('📰 NEWSLETTER INFO')}\n\n${meta.id || 'N/A'}`;
        
        if (meta.description) {
          infoText += `\n${bold('Description:')} ${meta.description}`;
        }
        
        if (meta.invite) {
          infoText += `\n${bold('Invite Code:')} \`${meta.invite}\``;
        }
        
        if (meta.subscriberCount !== undefined) {
          infoText += `\n${bold('Subscribers:')} ${meta.subscriberCount.toLocaleString()}`;
        }
        
        if (meta.creationTime) {
          const date = new Date(meta.creationTime * 1000);
          infoText += `\n${bold('Created:')} ${date.toLocaleDateString()}`;
        }
        
        if (meta.image) {
          // Send with image if available
          await sock.sendMessage(chatId, {
            image: { url: meta.image },
            caption: infoText
          }, { quoted: msg });
        } else {
          // Send text only
          await sock.sendMessage(chatId, {
            text: infoText
          }, { quoted: msg });
        }
        
      } catch (error) {
        console.error('Newsletter command error:', error);
        
        if (error.message.includes('Invalid channel link')) {
          await extra.reply(`${bold(pick(SLANG.error))} — invalid channel link format\n\nPlease provide a valid WhatsApp channel link.\nExample: https://whatsapp.com/channel/0029VaAbCdEfGhIJkL`);
        } else if (error.message.includes('Newsletter not found')) {
          await extra.reply(`${bold(pick(SLANG.error))} — newsletter not found, ${pick(SLANG.vibe)}\n\nThe channel link might be invalid or the newsletter might not exist.`);
        } else if (error.message.includes('newsletterMetadata')) {
          await extra.reply(`${bold(pick(SLANG.error))} — newsletter feature not available\n\nMake sure you are using Baileys v7.0.0-rc or higher.`);
        } else {
          await extra.reply(`_${pick(SLANG.error)} — couldn't get newsletter info: ${error.message}_`);
        }
      }
      
    } catch (error) {
      console.error('Newsletter command error:', error);
      await extra.reply(`_${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};

