/**
 * Facebook Downloader - Download Facebook videos
 */

const axios = require('axios');
const config = require('../../config');

const processedMessages = new Set();

const fbAPIs = [
  // API 1: FBDown
  async (url) => {
    const response = await axios.get(`https://fbdown.vercel.app/api/get?url=${encodeURIComponent(url)}`, { timeout: 20000 });
    if (response.data && (response.data.hd || response.data.sd)) {
      console.log('FBDown got URL:', response.data.hd ? 'HD' : 'SD');
      return { 
        url: response.data.hd || response.data.sd, 
        title: response.data.title || 'Facebook Video'
      };
    }
    throw new Error('FBDown returned no video');
  },
  // API 2: GetMyIP (FB Downloader)
  async (url) => {
    const response = await axios.get(`https://api.getmyip.co.id/api/v1/fb?url=${encodeURIComponent(url)}`, { timeout: 20000 });
    if (response.data && response.data.data && response.data.data.url) {
      console.log('GetMyIP got URL');
      return { url: response.data.data.url, title: response.data.data.title || 'Facebook Video' };
    }
    throw new Error('GetMyIP failed');
  },
  // API 3: Savemedia
  async (url) => {
    const response = await axios.get(`https://save-media.xyz/fb?url=${encodeURIComponent(url)}`, { timeout: 20000 });
    if (response.data && response.data.url) {
      console.log('Savemedia got URL');
      return { url: response.data.url, title: response.data.title || 'Facebook Video' };
    }
    throw new Error('Savemedia failed');
  },
  // API 4: Siputzx
  async (url) => {
    const response = await axios.get(`https://api.siputzx.my.id/api/d/fb?url=${encodeURIComponent(url)}`, { timeout: 20000 });
    if (response.data && response.data.status && response.data.data) {
      console.log('Siputzx got URL');
      return { url: response.data.data.url, title: response.data.data.title };
    }
    throw new Error('Siputzx failed');
  },
  // API 5: Ryzendesu
  async (url) => {
    const response = await axios.get(`https://api.ryzendesu.vip/api/downloader/fb?url=${encodeURIComponent(url)}`, { timeout: 20000 });
    if (response.data && (response.data.result?.url || response.data.url || response.data.data?.url)) {
      console.log('Ryzendesu got URL');
      return { url: response.data.result?.url || response.data.url || response.data.data?.url, title: response.data.result?.title || response.data.title || 'Facebook Video' };
    }
    throw new Error('Ryzendesu failed');
  },
  // API 6: Akuari
  async (url) => {
    const response = await axios.get(`https://api.akuari.my.id/downloader/facebook?url=${encodeURIComponent(url)}`, { timeout: 20000 });
    if (response.data && (response.data.result?.url || response.data.url || response.data.data?.url)) {
      console.log('Akuari got URL');
      return { url: response.data.result?.url || response.data.url || response.data.data?.url, title: response.data.result?.title || response.data.title || 'Facebook Video' };
    }
    throw new Error('Akuari failed');
  },
  // API 7: Agatz
  async (url) => {
    const response = await axios.get(`https://api.agatz.xyz/api/facebook?url=${encodeURIComponent(url)}`, { timeout: 20000 });
    if (response.data && (response.data.data?.url || response.data.url || response.data.result?.url)) {
      console.log('Agatz got URL');
      return { url: response.data.data?.url || response.data.url || response.data.result?.url, title: response.data.data?.title || response.data.title || 'Facebook Video' };
    }
    throw new Error('Agatz failed');
  }
];

module.exports = {
  name: 'facebook',
  aliases: ['fb', 'fbdl', 'facebookdl'],
  category: 'media',
  description: 'Download Facebook videos',
  usage: '.fb <Facebook video link>',
  
  async execute(sock, msg, args, extra) {
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
        return await extra.reply('Please provide a Facebook link for the video.');
      }
      
      const url = text.split(' ').slice(1).join(' ').trim();
      
      if (!url) {
        return await extra.reply('Please provide a Facebook link for the video.');
      }

      // Resolve redirect URL for share links
      let resolvedUrl = url;
      try {
        const headResponse = await axios.head(url, { 
          timeout: 10000,
          maxRedirects: 5,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (headResponse.request.res.responseUrl) {
          resolvedUrl = headResponse.request.res.responseUrl;
        }
      } catch (e) {
        console.log('URL redirect resolution failed, trying original');
      }
      
      const facebookPatterns = [
        /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\//,
        /https?:\/\/(?:www\.|m\.|web\.)?fb\.com\//,
        /https?:\/\/fb\.watch\//,
        /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/watch/,
        /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/.*\/videos\//,
        /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/share\//
      ];
      
      const isValidUrl = facebookPatterns.some(pattern => pattern.test(url));
      
      if (!isValidUrl) {
        return await extra.reply('❌ Invalid Facebook link.\n\nUse: .fb <facebook video link>\n\nSupported: facebook.com, fb.com, fb.watch, share links, watch links');
      }
      
      await sock.sendMessage(extra.from, {
        react: { text: '🔄', key: msg.key }
      });
      
      let videoData = null;
      let lastError = null;
      
      // Try each API with resolved URL
      console.log('Testing with resolved URL:', resolvedUrl);
      for (let i = 0; i < fbAPIs.length; i++) {
        try {
          console.log(`Trying FB API ${i + 1}...`);
          videoData = await fbAPIs[i](resolvedUrl);
          if (videoData && videoData.url) {
            console.log(`✅ FB API ${i + 1} succeeded!`);
            break;
          }
        } catch (err) {
          lastError = err;
          console.log(`❌ FB API ${i + 1} failed:`, err.message);
        }
      }

      // If APIs failed, try with original URL
      if (!videoData || !videoData.url) {
        console.log('Trying with original URL...');
        for (let i = 0; i < fbAPIs.length; i++) {
          try {
            videoData = await fbAPIs[i](url);
            if (videoData && videoData.url) {
              console.log(`✅ FB API ${i + 1} worked with original URL`);
              break;
            }
          } catch (err) {
            console.log(`❌ FB API ${i + 1} failed:`, err.message);
          }
        }
      }
      
      if (!videoData || !videoData.url) {
        console.log('All FB APIs failed, last error:', lastError?.message);
        return await extra.reply('❌ Could not get video link.\n\nAll download sources failed.\n\nTry using a direct video link instead.');
      }
      
      console.log('Got video URL, attempting to send...');
      const caption = `*DOWNLOADED BY KAMI BOT*\n\n${videoData.title ? '📝 ' + videoData.title : ''}`;
      
      // Try multiple send methods
      let sendSuccess = false;
      
      // Method 1: Direct URL (often works best)
      try {
        console.log('Method 1: Direct URL send');
        await sock.sendMessage(extra.from, {
          video: { url: videoData.url },
          caption: caption
        }, { quoted: msg });
        console.log('✅ Method 1 worked!');
        sendSuccess = true;
      } catch (e1) {
        console.log('Method 1 failed:', e1.message);
        
        // Method 2: Download via API proxy
        try {
          console.log('Method 2: Trying via allorigins proxy');
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(videoData.url)}`;
          const response = await axios.get(proxyUrl, {
            responseType: 'arraybuffer',
            timeout: 120000
          });
          const buffer = Buffer.from(response.data);
          
          await sock.sendMessage(extra.from, {
            video: buffer,
            mimetype: 'video/mp4',
            caption: caption
          }, { quoted: msg });
          console.log('✅ Method 2 worked!');
          sendSuccess = true;
        } catch (e2) {
          console.log('Method 2 failed:', e2.message);
          
          // Method 3: Direct buffer with different timeout
          try {
            console.log('Method 3: Direct buffer download');
            const videoResponse = await axios.get(videoData.url, {
              responseType: 'arraybuffer',
              timeout: 90000,
              maxContentLength: 100 * 1024 * 1024,
              proxy: false
            });
            
            const buffer = Buffer.from(videoResponse.data);
            await sock.sendMessage(extra.from, {
              video: buffer,
              mimetype: 'video/mp4',
              caption: caption
            }, { quoted: msg });
            console.log('✅ Method 3 worked!');
            sendSuccess = true;
          } catch (e3) {
            console.log('Method 3 failed:', e3.message);
          }
        }
      }
      
      if (!sendSuccess) {
        return await extra.reply('❌ Network issue.\n\nCould not download from Facebook servers.\n\nTry:\n• Using a VPN\n• A different internet connection\n• Using browser to download manually');
      }
      
    } catch (error) {
      console.error('Error in Facebook command:', error.message || error);
      await extra.reply('❌ Error: ' + (error.message || 'Please try again later.'));
    }
  }
};

