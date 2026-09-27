/**
 * Pinterest Downloader - Download images/videos from Pinterest
 */

const axios = require('axios');
const config = require('../../config');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');

// Store processed message IDs to prevent duplicates
const processedMessages = new Map(); // id → timestamp

// Periodic sweep every 5 min
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, ts] of processedMessages) {
    if (ts < cutoff) processedMessages.delete(id);
  }
}, 5 * 60 * 1000);

module.exports = {
  name: 'pinterest',
  reactions: { received: '📌', generating: '⬇️', done: '🖼️' },
  aliases: ['pin', 'pindl', 'pinterestdl'],
  category: 'media',
  description: 'Download images/videos from Pinterest',
  usage: '.pinterest <Pinterest URL>',
  
  async execute(sock, msg, args, extra) {
    try {
      // Check if message has already been processed
      if (processedMessages.has(msg.key.id)) {
        return;
      }
      
      // Add message ID to processed set
      processedMessages.set(msg.key.id, Date.now());
      
      const text = msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text ||
                   args.join(' ');
      
      if (!text) {
        return await extra.reply(
          `*📌 Pinterest Downloader*\n\n` +
          `_Download images or videos from Pinterest._\n\n` +
          `_Usage:_ ${config.prefix}pinterest <Pinterest URL>\n\n` +
          `_Example:_\n` +
          `${config.prefix}pinterest https://in.pinterest.com/pin/1109363320773690068/`
        );
      }
      
      // Extract URL from text - match Pinterest pin URLs (including pin.it shortened URLs)
      let urlMatch = text.match(/https?:\/\/[^\s]*pinterest[^\s]*\/pin\/[^\s]+/i);
      
      // Also match pin.it shortened URLs
      if (!urlMatch) {
        urlMatch = text.match(/https?:\/\/pin\.it\/[^\s]+/i);
      }
      
      // Match pin.it without https
      if (!urlMatch) {
        urlMatch = text.match(/pin\.it\/[^\s]+/i);
      }
      
      if (!urlMatch) {
        extra.fail();
        return await extra.reply(`❌ _${voice.openErr()}, need a valid pinterest pin URL_\n\n_Examples:_\n• _https://in.pinterest.com/pin/1109363320773690068/_\n• _https://pin.it/dddddd_\n• _pin.it/dddddd_`);
      }
      
      const pinterestUrl = urlMatch[0];
      
      // Call Pinterest API
      const apiUrl = `https://api.nexray.web.id/downloader/pinterest?url=${encodeURIComponent(pinterestUrl)}`;
      
      let response;
      try {
        response = await axios.get(apiUrl, {
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
      } catch (error) {
        console.error('Pinterest API Error:', error);
        if (error.response) {
          const status = error.response.status;
          if (status === 400) {
            extra.fail();
            return await extra.reply(`❌ _${voice.openErr()}, that Pinterest link is off — check it hey_`);
          } else if (status === 429) {
            extra.fail();
            return await extra.reply(`❌ _${voice.openErr()}, rate limit — try again later_`);
          } else if (status === 500) {
            extra.fail();
            return await extra.reply(`❌ _${voice.openErr()}, server error — try again later_`);
          }
        }
        extra.fail();
        return await extra.reply(`❌ _${voice.openErr()}, couldn't pull the Pinterest content — try again_`);
      }
      
      if (!response.data || !response.data.status || !response.data.result) {
        extra.fail();
        return await extra.reply(`❌ _${voice.openErr()}, bad response — the pin might not exist or be private_`);
      }
      
      const pinData = response.data.result;
      
      // Log full response for debugging videos
      console.log('Pinterest API Response:', JSON.stringify(pinData, null, 2));
      
      // Check for both image and video fields (videos might have different field name)
      // If video field exists, it's definitely a video
      const isVideo = !!pinData.video;
      const imageUrl = pinData.video || pinData.image || pinData.url;
      const thumbnail = pinData.thumbnail;
      const title = pinData.title || 'Pinterest Pin';
      const author = pinData.author || 'Unknown';
      
      console.log('Media URL found:', imageUrl);
      console.log('Is video check:', {
        hasVideoField: !!pinData.video,
        hasImageField: !!pinData.image,
        isVideo: isVideo,
        url: imageUrl
      });
      
      // Debug: log the response structure if no media URL found
      if (!imageUrl) {
        console.error('Pinterest API response structure:', JSON.stringify(pinData, null, 2));
        extra.fail();
        return await extra.reply(`❌ _${voice.openErr()}, no media URL — it might be a video or another format_`);
      }
      
      // Build caption
      let caption = `📌 *${title}*\n\n`;
      if (author && author !== 'Unknown') {
        caption += `👤 Author: ${author}\n`;
      }
      caption += `\n${bold('Downloaded by ' + config.botName)}\n_${voice.lead('affirm')}, enjoy_`;
      
      // Send only the main media (not thumbnail separately to avoid duplicates)
      if (isVideo) {
        // Download video as buffer (Pinterest tokenized URLs need to be downloaded)
        try {
          const videoResponse = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 120000, // 2 minutes for video download
            maxContentLength: 16 * 1024 * 1024, // 16MB — WhatsApp limit
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'video/mp4,video/*,*/*',
              'Referer': 'https://www.pinterest.com/'
            }
          });
          
          const videoBuffer = Buffer.from(videoResponse.data);
          
          if (!videoBuffer || videoBuffer.length === 0) {
            throw new Error('Empty video buffer');
          }
          
          // Basic validation - just check size
          if (videoBuffer.length < 100) {
            throw new Error('Video buffer too small, likely corrupted');
          }
          
          console.log(`Video downloaded successfully: ${(videoBuffer.length / 1024 / 1024).toFixed(2)}MB`);
          
          // Send video buffer - let WhatsApp auto-detect mimetype
          await sock.sendMessage(extra.from, {
            video: videoBuffer,
            caption: caption
          }, { quoted: msg });
        } catch (videoError) {
          console.error('Video download/send error:', videoError.message);
          extra.fail();
          return await extra.reply(`❌ _${voice.openErr()}, couldn't grab the video — it might be expired or need auth_`);
        }
      } else {
        // For images, use the main image URL (not thumbnail)
        await sock.sendMessage(extra.from, {
          image: { url: imageUrl },
          caption: caption
        }, { quoted: msg });
      }
      
    } catch (error) {
      console.error('Error in pinterest command:', error);
      extra.fail();
      return await extra.reply(`❌ _${voice.openErr()} — ${error.message || 'Unknown error occurred'}_`);
    }
  },
};

