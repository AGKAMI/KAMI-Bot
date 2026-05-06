/**
 * Video Downloader - Download video from YouTube using ytdl-core
 */

const yts = require('yt-search');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'ytvideo',
  aliases: ['ytv', 'ytmp4', 'ytvid', 'video'],
  category: 'media',
  description: 'Download video from YouTube',
  usage: '.video <video name or URL>',

  async execute(sock, msg, args) {
    try {
      const text = args.join(' ');
      const chatId = msg.key.remoteJid;

      if (!text) {
        return await sock.sendMessage(chatId, {
          text: 'What video do you want to download?'
        }, { quoted: msg });
      }

      let videoUrl;
      let videoTitle;
      let videoThumbnail;

      if (text.includes('youtube.com') || text.includes('youtu.be')) {
        videoUrl = text;
        const info = await ytdl.getInfo(text);
        videoTitle = info.videoDetails.title;
        videoThumbnail = info.videoDetails.thumbnails?.[0]?.url || info.videoDetails.thumbnails?.[info.videoDetails.thumbnails.length - 1]?.url;
      } else {
        const search = await yts(text);
        if (!search.videos.length) {
          return await sock.sendMessage(chatId, {
            text: 'No videos found!'
          }, { quoted: msg });
        }
        const video = search.videos[0];
        videoUrl = video.url;
        videoTitle = video.title;
        videoThumbnail = video.thumbnail;
      }

      await sock.sendMessage(chatId, {
        image: { url: videoThumbnail },
        caption: `📥 Downloading: *${videoTitle}*...`
      }, { quoted: msg });

      const tempPath = path.join(__dirname, `../../temp/${Date.now()}.mp4`);

      await new Promise((resolve, reject) => {
        const stream = ytdl(videoUrl, { 
          filter: 'videoandaudio',
          quality: 'highestvideo'
        });
        
        const writer = fs.createWriteStream(tempPath);
        stream.pipe(writer);
        
        writer.on('finish', resolve);
        writer.on('error', reject);
        stream.on('error', reject);
      });

      const videoBuffer = fs.readFileSync(tempPath);
      fs.unlinkSync(tempPath);

      await sock.sendMessage(chatId, {
        video: videoBuffer,
        mimetype: 'video/mp4',
        fileName: `${videoTitle.replace(/[^\w\s-]/g, '')}.mp4`,
        caption: `*${videoTitle}*\n\n> *ᴅᴏᴡɴʟᴏᴀᴅᴇᴅ ʙʏ KAMI Bot*`
      }, { quoted: msg });

    } catch (error) {
      console.error('[VIDEO] Command Error:', error.message);
      await sock.sendMessage(msg.key.remoteJid, {
        text: '❌ Failed to download video. Please try again.'
      }, { quoted: msg });
    }
  }
};