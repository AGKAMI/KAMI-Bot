/**
 * Song Downloader - Download audio from YouTube using ytdl-core
 */

const yts = require('yt-search');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');
const { toAudio } = require('../../utils/converter');

module.exports = {
  name: 'song',
  aliases: ['play', 'music', 'yta'],
  category: 'media',
  description: 'Download audio from YouTube',
  usage: '.song <song name or YouTube link>',
  
  async execute(sock, msg, args) {
    try {
      const text = args.join(' ');
      const chatId = msg.key.remoteJid;
      
      if (!text) {
        return await sock.sendMessage(chatId, { 
          text: 'Usage: .song <song name or YouTube link>' 
        }, { quoted: msg });
      }
      
      let videoUrl;
      let videoTitle;
      let videoThumbnail;
      let videoTimestamp;
      
      if (text.includes('youtube.com') || text.includes('youtu.be')) {
        videoUrl = text;
        const info = await ytdl.getInfo(text);
        videoTitle = info.videoDetails.title;
        videoThumbnail = info.videoDetails.thumbnails?.[0]?.url || info.videoDetails.thumbnails?.[info.videoDetails.thumbnails.length - 1]?.url;
        videoTimestamp = info.videoDetails.lengthSeconds ? ytdl.formatDuration(info.videoDetails.lengthSeconds) : '0:00';
      } else {
        const search = await yts(text);
        if (!search || !search.videos.length) {
          return await sock.sendMessage(chatId, { 
            text: 'No results found.' 
          }, { quoted: msg });
        }
        const video = search.videos[0];
        videoUrl = video.url;
        videoTitle = video.title;
        videoThumbnail = video.thumbnail;
        videoTimestamp = video.timestamp;
      }
      
      await sock.sendMessage(chatId, {
        image: { url: videoThumbnail },
        caption: `🎵 Downloading: *${videoTitle}*\n⏱ Duration: ${videoTimestamp}`
      }, { quoted: msg });
      
      const tempPath = path.join(__dirname, `../../temp/${Date.now()}.mp4`);
      
      await new Promise((resolve, reject) => {
        const stream = ytdl(videoUrl, { 
          filter: 'audioonly',
          quality: 'highestaudio'
        });
        
        const writer = fs.createWriteStream(tempPath);
        stream.pipe(writer);
        
        writer.on('finish', resolve);
        writer.on('error', reject);
        stream.on('error', reject);
      });
      
      const audioBuffer = fs.readFileSync(tempPath);
      fs.unlinkSync(tempPath);
      
      let finalBuffer = audioBuffer;
      let finalExtension = 'm4a';
      
      const firstBytes = audioBuffer.slice(0, 12);
      const asciiSignature = firstBytes.toString('ascii', 4, 8);
      
      if (asciiSignature === 'ftyp') {
        try {
          finalBuffer = await toAudio(audioBuffer, 'm4a');
          finalExtension = 'mp3';
        } catch (convErr) {
          finalBuffer = audioBuffer;
          finalExtension = 'm4a';
        }
      }
      
      await sock.sendMessage(chatId, {
        audio: finalBuffer,
        mimetype: 'audio/mpeg',
        fileName: `${videoTitle.replace(/[^\w\s-]/g, '')}.${finalExtension}`,
        ptt: false
      }, { quoted: msg });
      
    } catch (err) {
      console.error('Song command error:', err);
      await sock.sendMessage(msg.key.remoteJid, { 
        text: '❌ Failed to download song. Please try again.' 
      }, { quoted: msg });
    }
  }
};