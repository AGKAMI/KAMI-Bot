/**
 * API Integration Utilities - with multi-fallback support
 */

const axios = require('axios');

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
        const r = await api.get('https://api.siputzx.my.id/api/ai/stablediffusion', { params: { prompt } });
        return r.data;
      },
      async () => {
        const r = await api.get('https://api.ryzendesu.vip/api/ai/diffusion', { params: { prompt, style: 'anime' } });
        return r.data;
      },
      async () => {
        const r = await api.get('https://api.alyachan.my.id/api/ai/imagetoimage', { params: { text: prompt } });
        return r.data;
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
      },
      async () => {
        const r = await api.get(`https://api.ryzendesu.vip/api/ai/gpt?text=${encodeURIComponent(text)}`);
        if (r.data && (r.data.answer || r.data.response || r.data.msg)) {
          return { msg: r.data.answer || r.data.response || r.data.msg };
        }
        throw new Error('no response');
      },
      async () => {
        const r = await api.get(`https://api.alyachan.my.id/api/gpt?q=${encodeURIComponent(text)}`);
        if (r.data && (r.data.message || r.data.result || r.data.response || r.data.msg)) {
          return { msg: r.data.message || r.data.result || r.data.response || r.data.msg };
        }
        throw new Error('no response');
      },
      async () => {
        const r = await api.get(`https://api.agatz.xyz/api/chatgpt?message=${encodeURIComponent(text)}`);
        if (r.data && (r.data.data || r.data.response || r.data.msg)) {
          return { msg: r.data.data || r.data.response || r.data.msg };
        }
        throw new Error('no response');
      }
    ]);
  },
  
  // YouTube Download
  ytDownload: async (url, type = 'audio') => {
    return firstSuccess([
      async () => {
        const r = await api.get('https://api.siputzx.my.id/api/d/ytmp3', { params: { url } });
        return r.data;
      },
      async () => {
        const r = await api.get('https://api.ryzendesu.vip/api/downloader/ytmp3', { params: { url } });
        return r.data;
      },
      async () => {
        const r = await api.get('https://api.akuari.my.id/downloader/ytmp3', { params: { url } });
        return r.data;
      }
    ]);
  },
  
  // Instagram Download
  igDownload: async (url) => {
    return firstSuccess([
      async () => {
        const r = await api.get('https://api.siputzx.my.id/api/d/igdl', { params: { url } });
        return r.data;
      },
      async () => {
        const r = await api.get('https://api.ryzendesu.vip/api/downloader/igdl', { params: { url } });
        return r.data;
      },
      async () => {
        const r = await api.get('https://api.akuari.my.id/downloader/instagram', { params: { url } });
        return r.data;
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
        const r = await api.get('https://api.quotable.io/random');
        return r.data;
      },
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
        const r = await api.get('https://api.siputzx.my.id/api/tools/weather', { params: { city } });
        return r.data;
      },
      async () => {
        const r = await api.get('https://api.ryzendesu.vip/api/tools/weather', { params: { city } });
        return r.data;
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
  
  // Song Download APIs
  getIzumiDownloadByUrl: async (youtubeUrl) => {
    const apiUrl = `https://izumiiiiiiii.dpdns.org/downloader/youtube?url=${encodeURIComponent(youtubeUrl)}&format=mp3`;
    const res = await tryReq(() => axios.get(apiUrl, AX_DEFAULTS));
    if (res?.data?.result?.download) return res.data.result;
    throw new Error('Izumi youtube?url returned no download');
  },
  
  getIzumiDownloadByQuery: async (query) => {
    const apiUrl = `https://izumiiiiiiii.dpdns.org/downloader/youtube-play?query=${encodeURIComponent(query)}`;
    const res = await tryReq(() => axios.get(apiUrl, AX_DEFAULTS));
    if (res?.data?.result?.download) return res.data.result;
    throw new Error('Izumi youtube-play returned no download');
  },
  
  getYupraDownloadByUrl: async (youtubeUrl) => {
    return firstSuccess([
      async () => {
        const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
        const res = await tryReq(() => axios.get(apiUrl, AX_DEFAULTS));
        if (res?.data?.success && res?.data?.data?.download_url) {
          return { download: res.data.data.download_url, title: res.data.data.title, thumbnail: res.data.data.thumbnail };
        }
        throw new Error('Yupra returned no download');
      },
      async () => {
        const apiUrl = `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
        const res = await tryReq(() => axios.get(apiUrl, AX_DEFAULTS));
        if (res?.data?.result?.download || res?.data?.download?.url) {
          return { download: res.data.result?.download || res.data.download?.url, title: res.data.result?.title || res.data.title };
        }
        throw new Error('Ryzendesu ytmp3 returned no download');
      }
    ]);
  },
  
  getOkatsuDownloadByUrl: async (youtubeUrl) => {
    return firstSuccess([
      async () => {
        const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
        const res = await tryReq(() => axios.get(apiUrl, AX_DEFAULTS));
        if (res?.data?.dl) {
          return { download: res.data.dl, title: res.data.title, thumbnail: res.data.thumb };
        }
        throw new Error('Okatsu ytmp3 returned no download');
      },
      async () => {
        const apiUrl = `https://api.akuari.my.id/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
        const res = await tryReq(() => axios.get(apiUrl, AX_DEFAULTS));
        if (res?.data?.result?.url || res?.data?.url) {
          return { download: res.data.result?.url || res.data.url, title: res.data.result?.title || res.data.title };
        }
        throw new Error('Akuari ytmp3 returned no download');
      }
    ]);
  },
  
  getEliteProTechDownloadByUrl: async (youtubeUrl) => {
    return firstSuccess([
      async () => {
        const apiUrl = `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(youtubeUrl)}&format=mp3`;
        const res = await tryReq(() => axios.get(apiUrl, AX_DEFAULTS));
        if (res?.data?.success && res?.data?.downloadURL) {
          return { download: res.data.downloadURL, title: res.data.title };
        }
        throw new Error('EliteProTech ytdown returned no download');
      },
      async () => {
        const apiUrl = `https://api.agatz.xyz/api/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
        const res = await tryReq(() => axios.get(apiUrl, AX_DEFAULTS));
        if (res?.data?.data?.url || res?.data?.url) {
          return { download: res.data.data?.url || res.data.url, title: res.data.data?.title || res.data.title };
        }
        throw new Error('Agatz ytmp3 returned no download');
      }
    ]);
  },
  
  getAkuariDownloadByUrl: async (youtubeUrl) => {
    const apiUrl = `https://api.akuari.my.id/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryReq(() => axios.get(apiUrl, AX_DEFAULTS));
    if (res?.data?.result?.url || res?.data?.url) {
      return { download: res.data.result?.url || res.data.url, title: res.data.result?.title || res.data.title };
    }
    throw new Error('Akuari ytmp3 returned no download');
  },
  
  getRyzendesuDownloadByUrl: async (youtubeUrl) => {
    const apiUrl = `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryReq(() => axios.get(apiUrl, AX_DEFAULTS));
    if (res?.data?.result?.download || res?.data?.download?.url) {
      return { download: res.data.result?.download || res.data.download?.url, title: res.data.result?.title || res.data.title };
    }
    throw new Error('Ryzendesu ytmp3 returned no download');
  },
  
  getEliteProTechVideoByUrl: async (youtubeUrl) => {
    return firstSuccess([
      async () => {
        const apiUrl = `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(youtubeUrl)}&format=mp4`;
        const res = await tryReq(() => axios.get(apiUrl, AX_DEFAULTS));
        if (res?.data?.success && res?.data?.downloadURL) {
          return { download: res.data.downloadURL, title: res.data.title };
        }
        throw new Error('EliteProTech ytdown video returned no download');
      },
      async () => {
        const apiUrl = `https://api.ryzendesu.vip/api/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
        const res = await tryReq(() => axios.get(apiUrl, AX_DEFAULTS));
        if (res?.data?.result?.url || res?.data?.download?.url) {
          return { download: res.data.result?.url || res.data.download?.url, title: res.data.result?.title || res.data.title };
        }
        throw new Error('Ryzendesu ytmp4 returned no download');
      }
    ]);
  },
  
  // Video Download APIs
  getYupraVideoByUrl: async (youtubeUrl) => {
    return firstSuccess([
      async () => {
        const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
        const res = await tryReq(() => axios.get(apiUrl, AX_DEFAULTS));
        if (res?.data?.success && res?.data?.data?.download_url) {
          return { download: res.data.data.download_url, title: res.data.data.title, thumbnail: res.data.data.thumbnail };
        }
        throw new Error('Yupra returned no download');
      },
      async () => {
        const apiUrl = `https://api.akuari.my.id/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
        const res = await tryReq(() => axios.get(apiUrl, AX_DEFAULTS));
        if (res?.data?.result?.url || res?.data?.url) {
          return { download: res.data.result?.url || res.data.url, title: res.data.result?.title || res.data.title };
        }
        throw new Error('Akuari ytmp4 returned no download');
      }
    ]);
  },
  
  getAkuariVideoByUrl: async (youtubeUrl) => {
    const apiUrl = `https://api.akuari.my.id/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryReq(() => axios.get(apiUrl, AX_DEFAULTS));
    if (res?.data?.result?.url || res?.data?.url) {
      return { download: res.data.result?.url || res.data.url, title: res.data.result?.title || res.data.title };
    }
    throw new Error('Akuari ytmp4 returned no download');
  },
  
  getRyzendesuVideoByUrl: async (youtubeUrl) => {
    const apiUrl = `https://api.ryzendesu.vip/api/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryReq(() => axios.get(apiUrl, AX_DEFAULTS));
    if (res?.data?.result?.url || res?.data?.download?.url) {
      return { download: res.data.result?.url || res.data.download?.url, title: res.data.result?.title || res.data.title };
    }
    throw new Error('Ryzendesu ytmp4 returned no download');
  },
  
  getOkatsuVideoByUrl: async (youtubeUrl) => {
    return firstSuccess([
      async () => {
        const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
        const res = await tryReq(() => axios.get(apiUrl, AX_DEFAULTS));
        if (res?.data?.result?.mp4) {
          return { download: res.data.result.mp4, title: res.data.result.title };
        }
        throw new Error('Okatsu ytmp4 returned no mp4');
      },
      async () => {
        const apiUrl = `https://api.agatz.xyz/api/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
        const res = await tryReq(() => axios.get(apiUrl, AX_DEFAULTS));
        if (res?.data?.data?.url || res?.data?.url) {
          return { download: res.data.data?.url || res.data.url, title: res.data.data?.title || res.data.title };
        }
        throw new Error('Agatz ytmp4 returned no download');
      }
    ]);
  },
  
  // TikTok Download API (for commands that call this directly)
  getTikTokDownload: async (url) => {
    return firstSuccess([
      async () => {
        const r = await api.get(`https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(url)}`, { timeout: 15000 });
        if (r.data && r.data.status && r.data.data) {
          let videoUrl = null;
          let title = null;
          if (r.data.data.urls && Array.isArray(r.data.data.urls) && r.data.data.urls.length > 0) {
            videoUrl = r.data.data.urls[0]; title = r.data.data.metadata?.title || 'TikTok Video';
          } else if (r.data.data.video_url) { videoUrl = r.data.data.video_url; title = r.data.data.metadata?.title || 'TikTok Video'; }
          else if (r.data.data.url) { videoUrl = r.data.data.url; title = r.data.data.metadata?.title || 'TikTok Video'; }
          else if (r.data.data.download_url) { videoUrl = r.data.data.download_url; title = r.data.data.metadata?.title || 'TikTok Video'; }
          if (videoUrl) return { videoUrl, title };
        }
        throw new Error('Invalid API response');
      },
      async () => {
        const r = await api.get(`https://api.ryzendesu.vip/api/downloader/tiktok?url=${encodeURIComponent(url)}`, { timeout: 15000 });
        if (r.data && (r.data.result?.url || r.data.url || r.data.video_url)) {
          return { videoUrl: r.data.result?.url || r.data.url || r.data.video_url, title: r.data.result?.title || r.data.title || 'TikTok Video' };
        }
        throw new Error('Ryzendesu TikTok no url');
      },
      async () => {
        const r = await api.get(`https://api.akuari.my.id/downloader/tiktok?url=${encodeURIComponent(url)}`, { timeout: 15000 });
        if (r.data && (r.data.result?.url || r.data.url || r.data.download_url)) {
          return { videoUrl: r.data.result?.url || r.data.url || r.data.download_url, title: r.data.result?.title || r.data.title || 'TikTok Video' };
        }
        throw new Error('Akuari TikTok no url');
      }
    ]);
  },
  
  // Screenshot Website API
  screenshotWebsite: async (url) => {
    return firstSuccess([
      async () => {
        const apiUrl = `https://eliteprotech-apis.zone.id/ssweb?url=${encodeURIComponent(url)}`;
        const r = await axios.get(apiUrl, { timeout: 30000, responseType: 'arraybuffer', headers: { 'accept': '*/*', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
        if (r.headers['content-type']?.includes('image')) return Buffer.from(r.data);
        try {
          const data = JSON.parse(Buffer.from(r.data).toString());
          return data.url || data.data?.url || data.image || null;
        } catch (e) { return Buffer.from(r.data); }
      },
      async () => {
        const r = await api.get(`https://api.ryzendesu.vip/api/tools/ssweb?url=${encodeURIComponent(url)}`, { timeout: 30000, responseType: 'arraybuffer' });
        return Buffer.from(r.data);
      },
      async () => {
        const r = await api.get(`https://api.akuari.my.id/tools/screenshot?url=${encodeURIComponent(url)}`, { timeout: 30000, responseType: 'arraybuffer' });
        return Buffer.from(r.data);
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
        const r = await api.get(`https://api.ryzendesu.vip/api/tools/tts?text=${encodeURIComponent(text)}`, { timeout: 30000, responseType: 'arraybuffer' });
        return Buffer.from(r.data);
      }
    ]);
  }
};

module.exports = APIs;
