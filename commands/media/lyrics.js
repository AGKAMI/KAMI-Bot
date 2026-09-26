/**
 * Lyrics Finder
 * Primary: lrclib.net (with validation) | Fallback: Genius scrape | Last: lyrics.ovh
 */

const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../../config');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'lyrics',
  reactions: { received: '🎤', generating: '📜', done: '🎼' },
  aliases: ['lyric', 'lirik'],
  category: 'media',
  description: 'Get lyrics of a song',
  usage: '.lyrics <song name>',

  async execute(sock, msg, args) {
    try {
      if (args.length === 0) {
        return await sock.sendMessage(msg.key.remoteJid, {
          text: `📝 _${pick(SLANG.vibe)}, give me a song name_\n\n_Example:_ ${config.prefix}lyrics Despacito`
        });
      }

      const query = args.join(' ');
      let lyricsData = null;

      // API 1: lrclib.net search
      try {
        const response = await axios.get(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, { timeout: 10000 });
        if (response.data && Array.isArray(response.data)) {
          for (const item of response.data) {
            if (!item.plainLyrics) continue;
            // Skip garbage results where artist == track name
            if (item.artistName && item.trackName && item.artistName.toLowerCase() === item.trackName.toLowerCase()) continue;
            lyricsData = {
              title: item.trackName || query,
              artist: item.artistName || 'Unknown',
              album: item.albumName || '',
              duration: item.duration || 0,
              lyrics: item.plainLyrics,
              source: 'lrclib.net'
            };
            break;
          }
        }
      } catch (err) {
        console.log('[lyrics] lrclib failed:', err.message);
      }

      // API 2: lrclib get with artist parsing (if query has " - " or user gave artist)
      if (!lyricsData) {
        try {
          const parts = query.split(/\s*-\s*/);
          let artist = parts.length > 1 ? parts[0].trim() : '';
          let track = parts.length > 1 ? parts.slice(1).join(' - ').trim() : '';
          if (track) {
            const response = await axios.get(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(track)}`, { timeout: 10000 });
            if (response.data && response.data.plainLyrics) {
              lyricsData = {
                title: response.data.trackName || track,
                artist: response.data.artistName || artist,
                album: response.data.albumName || '',
                duration: response.data.duration || 0,
                lyrics: response.data.plainLyrics,
                source: 'lrclib.net'
              };
            }
          }
        } catch (err) {
          console.log('[lyrics] lrclib get failed:', err.message);
        }
      }

      // API 3: Genius scrape
      if (!lyricsData) {
        try {
          const searchRes = await axios.get(`https://genius.com/api/search?q=${encodeURIComponent(query)}`, { timeout: 8000 });
          const hits = searchRes.data?.response?.hits;
          if (hits && hits.length > 0) {
            const result = hits[0].result;
            const pageRes = await axios.get(result.url, { timeout: 8000 });
            const $ = cheerio.load(pageRes.data);
            let lyricsHtml = '';
            $('[data-lyrics-container="true"]').each((i, el) => {
              lyricsHtml += $(el).html();
            });
            if (lyricsHtml) {
              let lyrics = lyricsHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
              lyrics = lyrics.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&#x60;/g, '`').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
              // Strip everything before first section marker [Verse], [Chorus], etc.
              const sectionMatch = lyrics.match(/\[(?:Verse|Chorus|Bridge|Intro|Outro|Pre-Chorus|Post-Chorus|Hook|Interlude|Refrain|Tag|Coda|Spoken|Outro|Verse \d|Chorus \d)[^\]]*\]/i);
              if (sectionMatch) {
                lyrics = lyrics.substring(lyrics.indexOf(sectionMatch[0]));
              }
              lyrics = lyrics.trim();
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
      }

      // API 4: lyrics.ovh (last resort)
      if (!lyricsData) {
        try {
          const parts = query.split(/\s*-\s*/);
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
          text: `❌ _${pick(SLANG.error)}, could not find lyrics for "${query}"_\n\n_Just type:_ ${config.prefix}lyrics songname artist`
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
        text: `❌ _${pick(SLANG.error)} — error fetching lyrics hey_`
      });
    }
  }
};
