/**
 * TikTok Downloader - Download TikTok videos
 */

const { ttdl } = require('ruhend-scraper');
const axios = require('axios');
const APIs = require('../../utils/api');
const config = require('../../config');

const processedMessages = new Set();

module.exports = {
  name: 'tiktok',
  aliases: ['tt', 'ttdl', 'tiktokdl'],
  category: 'media',
  description: 'Download TikTok videos',
  usage: '.tiktok <TikTok URL>',
  
  async execute(sock, msg, args) {
    try {
      if (processedMessages.has(msg.key.id)) {
        return;
      }
      
      processedMessages.add(msg.key.id);
      
      setTimeout(() => {
        processedMessages.delete(msg.key.id);
      }, 5 * 60 * 1000);
      
      const text = msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text ||
                   args.join(' ');
      
      if (!text) {
        return await sock.sendMessage(msg.key.remoteJid, { 
          text: 'Please provide a TikTok link for the video.' 
        }, { quoted: msg });
      }
      
      const url = text.split(' ').slice(1).join(' ').trim();
      
      if (!url) {
        return await sock.sendMessage(msg.key.remoteJid, { 
          text: 'Please provide a TikTok link for the video.' 
        }, { quoted: msg });
      }
      
      const tiktokPatterns = [
        /https?:\/\/(?:www\.)?tiktok\.com\//,
        /https?:\/\/(?:vm\.)?tiktok\.com\//,
        /https?:\/\/(?:vt\.)?tiktok\.com\//,
        /https?:\/\/(?:www\.)?tiktok\.com\/@/,
        /https?:\/\/(?:www\.)?tiktok\.com\/t\//
      ];
      
      const isValidUrl = tiktokPatterns.some(pattern => pattern.test(url));
      
      if (!isValidUrl) {
        return await sock.sendMessage(msg.key.remoteJid, { 
          text: 'That is not a valid TikTok link. Please provide a valid TikTok video link.' 
        }, { quoted: msg });
      }
      
      await sock.sendMessage(msg.key.remoteJid, {
        react: { text: '🔄', key: msg.key }
      });
      
      let videoUrl = null;
      let title = null;
      let audioUrl = null;
      let thumbnail = null;
      
      try {
        const result = await APIs.getTikTokDownload(url);
        videoUrl = result.videoUrl;
        title = result.title;
        audioUrl = result.audioUrl;
        thumbnail = result.thumbnail;
      } catch (apiError) {
        console.error(`Siputzx API failed: ${apiError.message}`);
      }
      
      if (!videoUrl) {
        try {
          const downloadData = await ttdl(url);
          if (downloadData && downloadData.data && downloadData.data.length > 0) {
            const mediaData = downloadData.data;
            for (let i = 0; i < Math.min(20, mediaData.length); i++) {
              const media = mediaData[i];
              const mediaUrl = media.url;
              const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl) || media.type === 'video';
              
              if (isVideo) {
                await sock.sendMessage(msg.key.remoteJid, {
                  video: { url: mediaUrl },
                  mimetype: 'video/mp4',
                  caption: `*DOWNLOADED BY ${config.botName.toUpperCase()}*`
                }, { quoted: msg });
              } else {
                await sock.sendMessage(msg.key.remoteJid, {
                  image: { url: mediaUrl },
                  caption: `*DOWNLOADED BY ${config.botName.toUpperCase()}*`
                }, { quoted: msg });
              }
            }
            return;
          }
        } catch (ttdlError) {
          console.error('ttdl fallback also failed:', ttdlError.message);
        }
      }

      // Additional fallback: try direct TikTok API
      if (!videoUrl) {
        try {
          const tiktokApiResponse = await axios.get(`https://www.tiktok.com/api/item/detail/?itemId=${url.split('/').pop().split('?')[0]}`, {
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          if (tiktokApiResponse?.data?.itemInfo?.itemStruct) {
            const item = tiktokApiResponse.data.itemInfo.itemStruct;
            videoUrl = item.video?.playAddr?.[0] || item.video?.downloadAddr?.[0];
            title = item.desc || 'TikTok Video';
            thumbnail = item.video?.cover;
          }
        } catch (tiktokApiError) {
          console.error('TikTok direct API failed:', tiktokApiError.message);
        }
      }

      // Another fallback: try ssstik
      if (!videoUrl) {
        try {
          const ssstikResponse = await axios.get(`https://ssstik.io/ajax`, {
            params: { url },
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0'
            }
          });
          
          if (ssstikResponse?.data?.data) {
            videoUrl = ssstikResponse.data.data;
          }
        } catch (ssstikError) {
          console.error('ssstik fallback failed:', ssstikError.message);
        }
      }
      
      if (videoUrl) {
        try {
          const videoResponse = await axios.get(videoUrl, {
            responseType: 'arraybuffer',
            timeout: 60000,
            maxContentLength: 100 * 1024 * 1024,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'video/mp4,video/*,*/*;q=0.9',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'Connection': 'keep-alive',
              'Referer': 'https://www.tiktok.com/'
            }
          });
          
          const videoBuffer = Buffer.from(videoResponse.data);
          
          if (videoBuffer.length === 0) {
            throw new Error('Video buffer is empty');
          }
          
          const botName = config.botName.toUpperCase();
          const caption = title ? `*DOWNLOADED BY ${botName}*\n\n📝 Title: ${title}` : `*DOWNLOADED BY ${botName}*`;
          
          await sock.sendMessage(msg.key.remoteJid, {
            video: videoBuffer,
            mimetype: 'video/mp4',
            caption: caption
          }, { quoted: msg });
          
          return;
        } catch (downloadError) {
          console.error(`Failed to download video: ${downloadError.message}`);
          try {
            const botName = config.botName.toUpperCase();
            const caption = title ? `*DOWNLOADED BY ${botName}*\n\n📝 Title: ${title}` : `*DOWNLOADED BY ${botName}*`;
            
            await sock.sendMessage(msg.key.remoteJid, {
              video: { url: videoUrl },
              mimetype: 'video/mp4',
              caption: caption
            }, { quoted: msg });
            return;
          } catch (urlError) {
            console.error(`URL method also failed: ${urlError.message}`);
          }
        }
      }
      
      return await sock.sendMessage(msg.key.remoteJid, { 
        text: '❌ Failed to download TikTok video. All download methods failed. Please try again with a different link.' 
      }, { quoted: msg });
      
    } catch (error) {
      console.error('Error in TikTok command:', error);
      await sock.sendMessage(msg.key.remoteJid, { 
        text: 'An error occurred while processing the request. Please try again later.' 
      }, { quoted: msg });
    }
  }
};