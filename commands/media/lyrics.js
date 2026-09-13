/**
 * Lyrics Finder
 * Primary: Genius scrape | Fallback: lrclib.net | Last resort: lyrics.ovh
 */

const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../../config');

module.exports = {
  name: 'lyrics',
  aliases: ['lyric', 'lirik'],
  category: 'media',
  description: 'Get lyrics of a song',
  usage: '.lyrics <song name>',

  async execute(sock, msg, args) {
    try {
      if (args.length === 0) {
        return await sock.sendMessage(msg.key.remoteJid, {
          text: `Give me a song name\n\nExample: ${config.prefix}lyrics Despacito`
        });
      }

      const query = args.join(' ');
      let lyricsData = null;

      // API 1: Genius scrape (best at understanding natural queries like "Despacito")
      try {
        const searchRes = await axios.get(`https://genius.com/api/search?q=${encodeURIComponent(query)}`, { timeout: 10000 });
        const hits = searchRes.data?.response?.hits;
        if (hits && hits.length > 0) {
          const result = hits[0].result;
          const pageRes = await axios.get(result.url, { timeout: 10000 });
          const $ = cheerio.load(pageRes.data);
          let lyricsHtml = '';
          $('[data-lyrics-container="true"]').each((i, el) => {
            lyricsHtml += $(el).html();
          });
          if (lyricsHtml) {
            let lyrics = lyricsHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
            lyrics = lyrics.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&#x60;/g, '`').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            // Strip header junk (contributors, translations, etc.)
            const lines = lyrics.split('\n');
            const startIdx = lines.findIndex(l => l.trim().startsWith('[') || l.trim().length > 20);
            lyrics = startIdx >= 0 ? lines.slice(startIdx).join('\n').trim() : lyrics.trim();
            if (lyrics.length > 50) {
              lyricsData = {
                title: result.songTitle || result.title || query,
                artist: result.primary_artist?.name || 'Unknown',
                album: '',
                duration: 0,
                lyrics: lyrics,
                source: 'Genius'
              };
            }
          }
        }
      } catch (err) {
        console.log('[lyrics] Genius failed:', err.message);
      }

      // API 2: lrclib.net search (good for exact matches)
      if (!lyricsData) {
        try {
          const response = await axios.get(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, { timeout: 10000 });
          if (response.data && Array.isArray(response.data) && response.data.length > 0) {
            // Pick best match - prefer exact title match, then most popular
            const best = response.data[0];
            if (best.plainLyrics) {
              lyricsData = {
                title: best.trackName || query,
                artist: best.artistName || 'Unknown',
                album: best.albumName || '',
                duration: best.duration || 0,
                lyrics: best.plainLyrics,
                source: 'lrclib.net'
              };
            }
          }
        } catch (err) {
          console.log('[lyrics] lrclib failed:', err.message);
        }
      }

      // API 3: lyrics.ovh (last resort - needs artist separated by -)
      if (!lyricsData) {
        try {
          const parts = query.split(' - ');
          const artist = parts.length > 1 ? parts[0].trim() : '';
          const track = parts.length > 1 ? parts.slice(1).join(' - ').trim() : query;

          const url = artist
            ? `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(track)}`
            : `https://api.lyrics.ovh/v1/?${encodeURIComponent(query)}`;

          const response = await axios.get(url, { timeout: 10000 });
          if (response.data && response.data.lyrics) {
            lyricsData = {
              title: track,
              artist: artist || 'Unknown',
              album: '',
              duration: 0,
              lyrics: response.data.lyrics,
              source: 'lyrics.ovh'
            };
          }
        } catch (err) {
          console.log('[lyrics] lyrics.ovh failed:', err.message);
        }
      }

      if (!lyricsData) {
        return await sock.sendMessage(msg.key.remoteJid, {
          text: `Could not find lyrics for "${query}"\n\nJust type: ${config.prefix}lyrics songname artist`
        });
      }

      // Format lyrics (limit to prevent message too long)
      let lyrics = lyricsData.lyrics;
      if (lyrics.length > 4000) {
        lyrics = lyrics.substring(0, 4000) + '...\n\n_Lyrics too long, showing first part only_';
      }

      const albumLine = lyricsData.album ? `\nAlbum: ${lyricsData.album}` : '';
      const caption = `*${lyricsData.title}*\n` +
                     `Artist: ${lyricsData.artist}${albumLine}\n\n` +
                     `${lyrics}\n\n` +
                     `_Powered by ${lyricsData.source}_`;

      await sock.sendMessage(msg.key.remoteJid, { text: caption });

    } catch (error) {
      console.error('[lyrics] Error:', error.message);
      await sock.sendMessage(msg.key.remoteJid, {
        text: 'An error occurred while fetching lyrics!'
      });
    }
  }
};
