/**
 * Lyrics Finder
 * Primary: lrclib.net | Fallback: lyrics.ovh
 */

const axios = require('axios');
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

      // API 1: lrclib.net (free, reliable, synced lyrics)
      try {
        const response = await axios.get(`https://lrclib.net/api/get?track_name=${encodeURIComponent(query)}`, {
          timeout: 10000
        });
        if (response.data && response.data.plainLyrics) {
          lyricsData = {
            title: response.data.trackName || query,
            artist: response.data.artistName || 'Unknown',
            album: response.data.albumName || '',
            duration: response.data.duration || 0,
            lyrics: response.data.plainLyrics,
            syncedLyrics: response.data.syncedLyrics || null
          };
        }
      } catch (err) {
        console.log('[lyrics] lrclib failed:', err.message);
      }

      // API 1b: lrclib search endpoint (if direct get fails)
      if (!lyricsData) {
        try {
          const response = await axios.get(`https://lrclib.net/api/search?track_name=${encodeURIComponent(query)}`, {
            timeout: 10000
          });
          if (response.data && Array.isArray(response.data) && response.data.length > 0) {
            const best = response.data[0];
            if (best.plainLyrics) {
              lyricsData = {
                title: best.trackName || query,
                artist: best.artistName || 'Unknown',
                album: best.albumName || '',
                duration: best.duration || 0,
                lyrics: best.plainLyrics,
                syncedLyrics: best.syncedLyrics || null
              };
            }
          }
        } catch (err) {
          console.log('[lyrics] lrclib search failed:', err.message);
        }
      }

      // API 2: lyrics.ovh (fallback)
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
              syncedLyrics: null
            };
          }
        } catch (err) {
          console.log('[lyrics] lyrics.ovh failed:', err.message);
        }
      }

      if (!lyricsData) {
        return await sock.sendMessage(msg.key.remoteJid, {
          text: `Could not find lyrics for "${query}"\n\nTip: Try "Artist - Title" format (e.g. ${config.prefix}lyrics Luis Fonsi - Despacito)`
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
                     `_Powered by lrclib.net_`;

      await sock.sendMessage(msg.key.remoteJid, { text: caption });

    } catch (error) {
      console.error('[lyrics] Error:', error.message);
      await sock.sendMessage(msg.key.remoteJid, {
        text: 'An error occurred while fetching lyrics!'
      });
    }
  }
};
