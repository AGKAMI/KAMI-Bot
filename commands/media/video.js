/**
 * Video Downloader - Download video from YouTube
 */

const yts = require('yt-search');
const axios = require('axios');
const APIs = require('../../utils/api');
const config = require('../../config');

module.exports = {
  name: 'ytvideo',
  aliases: ['ytv', 'ytmp4', 'ytvid', 'video'],
  category: 'media',
  description: 'Download video from YouTube',
  usage: '.video <video name or URL>',

  async execute(sock, msg, args) {
    try {
      const instanceConfig = config.getConfigFromSocket(sock);
      const text = args.join(' ');
      const chatId = msg.key.remoteJid;
      const searchQuery = text.trim();

      if (!searchQuery) {
        return await sock.sendMessage(chatId, {
          text: 'What video do you want to download?'
        }, { quoted: msg });
      }

      let videoUrl = '';
      let videoTitle = '';
      let videoThumbnail = '';

      if (searchQuery.startsWith('http://') || searchQuery.startsWith('https://')) {
        videoUrl = searchQuery;
      } else {
        const { videos } = await yts(searchQuery);
        if (!videos || videos.length === 0) {
          return await sock.sendMessage(chatId, {
            text: 'No videos found!'
          }, { quoted: msg });
        }
        videoUrl = videos[0].url;
        videoTitle = videos[0].title;
        videoThumbnail = videos[0].thumbnail;
      }

      const ytId = (videoUrl.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
      const thumb = videoThumbnail || (ytId ? `https://i.ytimg.com/vi/${ytId}/sddefault.jpg` : undefined);
      const captionTitle = videoTitle || searchQuery;
      if (thumb) {
        await sock.sendMessage(chatId, {
          image: { url: thumb },
          caption: `*${captionTitle}*\nDownloading...`
        }, { quoted: msg });
      }

      if (!ytId) {
        return await sock.sendMessage(chatId, {
          text: 'This is not a valid YouTube link!'
        }, { quoted: msg });
      }

      // Try multiple download methods
      let downloadUrl = null;
      let finalTitle = videoTitle || 'Video';
      let methodUsed = '';

      // Method 1: Try bochilteam scraper-youtube youtubedl (y2mate)
      try {
        const { youtubedl } = require('@bochilteam/scraper-youtube');
        const data = await youtubedl(videoUrl);
        if (data?.video) {
          const qualities = ['720p', '480p', '360p'];
          for (const q of qualities) {
            if (data.video[q]) {
              downloadUrl = await data.video[q].download();
              finalTitle = data.title;
              methodUsed = 'y2mate';
              break;
            }
          }
        }
      } catch (e) {
        console.log('[VIDEO] y2mate failed:', e.message);
      }

      // Method 2: Try youtubedlv2 (ssyoutube)
      if (!downloadUrl) {
        try {
          const { youtubedlv2 } = require('@bochilteam/scraper-youtube');
          const data = await youtubedlv2(videoUrl);
          if (data?.video) {
            const qualities = ['720p', '480p', '360p'];
            for (const q of qualities) {
              if (data.video[q]) {
                downloadUrl = typeof data.video[q].download === 'function' ? await data.video[q].download() : data.video[q].download;
                finalTitle = data.title;
                methodUsed = 'ssyoutube';
                break;
              }
            }
          }
        } catch (e) {
          console.log('[VIDEO] ssyoutube failed:', e.message);
        }
      }

      // Method 3: Try existing API fallbacks
      if (!downloadUrl) {
        try {
          const videoData = await APIs.getEliteProTechVideoByUrl(videoUrl);
          downloadUrl = videoData.download;
          finalTitle = videoData.title || finalTitle;
          methodUsed = 'eliteprotech';
        } catch (e1) {
          try {
            const videoData = await APIs.getYupraVideoByUrl(videoUrl);
            downloadUrl = videoData.download;
            finalTitle = videoData.title || finalTitle;
            methodUsed = 'yupra';
          } catch (e2) {
            try {
              const videoData = await APIs.getOkatsuVideoByUrl(videoUrl);
              downloadUrl = videoData.download;
              finalTitle = videoData.title || finalTitle;
              methodUsed = 'okatsu';
            } catch (e3) {
              console.log('[VIDEO] API fallbacks all failed');
            }
          }
        }
      }

      // Method 4: Try direct ytdl-core
      if (!downloadUrl) {
        try {
          const ytdl = require('ytdl-core');
          const info = await ytdl.getInfo(videoUrl);
          const format = info.formats
            .filter(f => f.hasVideo && f.hasAudio)
            .sort((a, b) => (b.qualityLabel?.includes('720p') ? 1 : 0) - (a.qualityLabel?.includes('720p') ? 1 : 0))
            .find(f => f.url);
          if (format?.url) {
            downloadUrl = format.url;
            finalTitle = info.videoDetails.title;
            methodUsed = 'ytdl-core';
          }
        } catch (e) {
          console.log('[VIDEO] ytdl-core failed:', e.message);
        }
      }

      // Method 5: Try siputzx API
      if (!downloadUrl) {
        try {
          const res = await axios.get(`https://api.siputzx.my.id/api/d/ytmp4`, {
            params: { url: videoUrl },
            timeout: 20000
          });
          if (res?.data?.data?.url) {
            downloadUrl = res.data.data.url;
            finalTitle = res.data.data.title || finalTitle;
            methodUsed = 'siputzx';
          }
        } catch (e) {
          console.log('[VIDEO] siputzx failed:', e.message);
        }
      }

      if (!downloadUrl) {
        throw new Error('All download methods failed');
      }

      await sock.sendMessage(chatId, {
        video: { url: downloadUrl },
        mimetype: 'video/mp4',
        fileName: `${finalTitle.replace(/[^\w\s-]/g, '')}.mp4`,
        caption: `*${finalTitle}*\n\n> *_Downloaded by ${instanceConfig.botName}_*`
      }, { quoted: msg });

    } catch (error) {
      console.error('[VIDEO] Command Error:', error?.message || error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: 'Download failed: ' + (error?.message || 'Unknown error')
      }, { quoted: msg });
    }
  }
};
