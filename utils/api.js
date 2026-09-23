/**
 * API Integration Utilities - with multi-fallback support
 */

const axios = require('axios');
const config = require('../config');

const api = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});

// Shared retry helper
const AX_DEFAULTS = {
  timeout: 60000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
  }
};

const tryReq = async (getter, attempts = 2) => {
  let lastError;
  for (let a = 1; a <= attempts; a++) {
    try { return await getter(); }
    catch (err) { lastError = err; if (a < attempts) await new Promise(r => setTimeout(r, 1000 * a)); }
  }
  throw lastError;
};

// Run an array of API fns, return first success
const firstSuccess = async (fns) => {
  let lastErr;
  for (const fn of fns) {
    try { return await fn(); }
    catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('All APIs failed');
};

// API Endpoints
const APIs = {
  // Image Generation
  generateImage: async (prompt) => {
    return firstSuccess([
      async () => {
        const encoded = encodeURIComponent(prompt);
        const url = `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true`;
        const r = await api.get(url, { timeout: 60000, responseType: 'arraybuffer' });
        if (r.data && r.data.length > 1000) return { imageBuffer: Buffer.from(r.data) };
        throw new Error('invalid image');
      }
    ]);
  },
  
  // AI Chat
  chatAI: async (text) => {
    return firstSuccess([
      async () => {
        const r = await api.get(`https://api.shizo.top/ai/gpt?apikey=shizo&query=${encodeURIComponent(text)}`);
        if (r.data && r.data.msg) return { msg: r.data.msg };
        return r.data;
      }
    ]);
  },
  
  // YouTube Download - uses loader.to
  ytDownload: async (url, type = 'audio') => {
    const format = type === 'video' ? '720' : 'mp3';
    const encodedUrl = encodeURIComponent(url);
    
    // Step 1: Start the download job with proper headers
    const startRes = await axios.get(`https://loader.to/ajax/download.php?format=${format}&url=${encodedUrl}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://loader.to/',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      timeout: 15000
    });
    
    if (!startRes.data || !startRes.data.success || !startRes.data.id) {
      throw new Error('Failed to start download');
    }
    
    const jobId = startRes.data.id;
    const title = startRes.data.title || 'YouTube Download';
    const thumbnail = startRes.data.thumbnail_url || startRes.data.info?.image;
    const progressUrl = startRes.data.progress_url;
    
    if (!progressUrl) throw new Error('No progress URL');
    
    // Step 2: Poll progress until complete
    const maxAttempts = 60; // 60 * 2 seconds = 2 minutes max
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 2000));
      
      try {
        const progressRes = await axios.get(progressUrl, { timeout: 10000 });
        const progress = progressRes.data;
        
        if (progress.download_url) {
          return {
            download: progress.download_url,
            title: progress.title || title,
            thumbnail: progress.thumbnail_url || thumbnail,
            format: format
          };
        }
        
        if (progress.progress === 1000 || progress.text === 'Finished') {
          if (progress.download_url) {
            return {
              download: progress.download_url,
              title: progress.title || title,
              thumbnail: progress.thumbnail_url || thumbnail,
              format: format
            };
          }
          throw new Error('Progress finished but no download URL');
        }
        
        // Check for errors
        if (progress.success === 0 || progress.text?.includes('error')) {
          throw new Error(progress.text || 'Download failed');
        }
      } catch (pollErr) {
        if (pollErr.message === 'Download failed') throw pollErr;
        // Continue polling on network errors
      }
    }
    
    throw new Error('Download timed out');
  },
  
  // Instagram Download - uses FastSaver API
  igDownload: async (url) => {
    return firstSuccess([
      async () => {
        const r = await api.get('https://api.fastsaver.io/v1/fetch', {
          params: { url },
          headers: { 'X-Api-Key': config.apiKeys?.fastSaver || 'fs_sk_8n3p7x0j1y2w8d6n9t8e1t3s2i3i' },
          timeout: 15000
        });
        if (r.data && r.data.ok && r.data.download_url) {
          return { url: r.data.download_url, type: r.data.type || 'video' };
        }
        throw new Error('no download');
      }
    ]);
  },
  
  // TikTok Download
  tiktokDownload: async (url) => {
    return firstSuccess([
      async () => {
        const r = await api.get('https://api.siputzx.my.id/api/d/tiktok', { params: { url } });
        return r.data;
      },
      async () => {
        const r = await api.get('https://api.ryzendesu.vip/api/downloader/tiktok', { params: { url } });
        return r.data;
      },
      async () => {
        const r = await api.get('https://api.akuari.my.id/downloader/tiktok', { params: { url } });
        return r.data;
      }
    ]);
  },
  
  // Translate
  translate: async (text, to = 'en') => {
    return firstSuccess([
      async () => {
        const r = await api.get('https://api.siputzx.my.id/api/tools/translate', { params: { text, to } });
        return r.data;
      },
      async () => {
        const r = await api.get('https://api.ryzendesu.vip/api/tools/translate', { params: { text, to } });
        return r.data;
      },
      async () => {
        const { default: translate } = await import('@vitalets/google-translate-api');
        const r = await translate(text, { to });
        return { text: r.text };
      }
    ]);
  },
  
  // Random Meme
  getMeme: async () => {
    return firstSuccess([
      async () => {
        const r = await api.get('https://meme-api.com/gimme');
        return r.data;
      },
      async () => {
        const r = await api.get('https://www.reddit.com/r/memes/random/.json');
        const post = r.data[0]?.data?.children[0]?.data;
        return post ? { title: post.title, url: post.url, nsfw: post.over_18 } : null;
      }
    ]);
  },
  
  // Random Quote
  getQuote: async () => {
    return firstSuccess([
      async () => {
        const r = await api.get('https://zenquotes.io/api/random');
        if (r.data && r.data[0]) return { content: r.data[0].q, author: r.data[0].a };
        throw new Error('no quote');
      }
    ]);
  },
  
  // Random Joke
  getJoke: async () => {
    return firstSuccess([
      async () => {
        const r = await api.get('https://official-joke-api.appspot.com/random_joke');
        return r.data;
      },
      async () => {
        const r = await api.get('https://v2.jokeapi.dev/joke/Any?type=twopart');
        if (r.data && r.data.setup) return { setup: r.data.setup, punchline: r.data.delivery };
        throw new Error('no joke');
      }
    ]);
  },
  
  // Weather
  getWeather: async (city) => {
    return firstSuccess([
      async () => {
        const r = await api.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { timeout: 10000 });
        const data = r.data;
        const current = data.current_condition?.[0];
        if (!current) throw new Error('no data');
        return {
          city: city,
          temp: current.temp_C,
          feelsLike: current.FeelsLikeC,
          humidity: current.humidity,
          wind: current.windspeedKmph,
          desc: current.weatherDesc?.[0]?.value || 'Unknown',
          country: data.nearest_area?.[0]?.country?.[0]?.value || ''
        };
      },
      async () => {
        const r = await api.get(`https://wttr.in/${encodeURIComponent(city)}?format=%C+%t+%w+%h`);
        if (r.data) return { text: r.data, city };
        throw new Error('no weather');
      }
    ]);
  },
  
  // Shorten URL
  shortenUrl: async (url) => {
    return firstSuccess([
      async () => {
        const r = await api.get('https://tinyurl.com/api-create.php', { params: { url } });
        return r.data;
      },
      async () => {
        const r = await api.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`);
        return r.data;
      }
    ]);
  },
  
  // Wikipedia Search
  wikiSearch: async (query) => {
    const r = await api.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
    return r.data;
  },
  
  // Screenshot Website API
  screenshotWebsite: async (url) => {
    return firstSuccess([
      async () => {
        const apiUrl = `https://image.thum.io/get/width/1920/crop/1080/png?url=${encodeURIComponent(url)}`;
        const r = await axios.get(apiUrl, { timeout: 30000, responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (r.data && r.data.length > 1000) return Buffer.from(r.data);
        throw new Error('empty response');
      },
      async () => {
        const apiUrl = `https://api.screenshotone.com/take?url=${encodeURIComponent(url)}&viewport_width=1920&viewport_height=1080&format=png&delay=3`;
        const r = await axios.get(apiUrl, { timeout: 30000, responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (r.data && r.data.length > 1000) return Buffer.from(r.data);
        throw new Error('empty response');
      },
      async () => {
        const apiUrl = `https://eliteprotech-apis.zone.id/ssweb?url=${encodeURIComponent(url)}`;
        const r = await axios.get(apiUrl, { timeout: 30000, responseType: 'arraybuffer', headers: { 'accept': '*/*', 'User-Agent': 'Mozilla/5.0' } });
        if (r.headers['content-type']?.includes('image')) return Buffer.from(r.data);
        throw new Error('not an image');
      }
    ]);
  },
  
  // Text to Speech API
  textToSpeech: async (text) => {
    return firstSuccess([
      async () => {
        const r = await api.get(`https://www.laurine.site/api/tts/tts-nova?text=${encodeURIComponent(text)}`, { timeout: 30000, responseType: 'arraybuffer' });
        if (r.data) {
          if (typeof r.data === 'string' && (r.data.startsWith('http://') || r.data.startsWith('https://'))) return r.data;
          if (r.data.data) {
            const d = r.data.data;
            if (d.URL) return d.URL; if (d.url) return d.url; if (d.MP3) return `https://ttsmp3.com/created_mp3_ai/${d.MP3}`;
          }
          if (r.data.URL) return r.data.URL; if (r.data.url) return r.data.url;
          if (r.data.MP3) return `https://ttsmp3.com/created_mp3_ai/${r.data.MP3}`;
          return Buffer.from(r.data);
        }
        throw new Error('Invalid API response');
      },
      async () => {
        // Fallback: use Google Translate TTS
        const encoded = encodeURIComponent(text.substring(0, 200));
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=en&client=tw-ob`;
        const r = await api.get(url, { timeout: 15000, responseType: 'arraybuffer' });
        if (r.data && r.data.length > 1000) return Buffer.from(r.data);
        throw new Error('no audio');
      }
    ]);
  }
};

module.exports = APIs;
