import { NextResponse } from "next/server";
import CryptoJS from "crypto-js";
import { NOCTURNE_TRACKS } from "../../../../data/nocturneData";
import { getGenreByName } from "../../../../data/genreData";

// In-memory caches to prevent redundant external API queries
const audioCache = new Map();
const searchCache = new Map();

// Known curated high-fidelity streams for Nocturne ambient tracks
const FALLBACK_TRACK_STREAMS = {
  "track-midnight-pulse": "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3",
  "track-shadows-in-blue": "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=chill-abstract-intention-12099.mp3",
  "track-aether-resonance": "https://cdn.pixabay.com/download/audio/2022/11/06/audio_2484643534.mp3?filename=lofi-chill-medium-version-159456.mp3",
  "track-kuroshio-current": "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=ambient-piano-amp-strings-10711.mp3",
  "track-tokyo-monorail": "https://cdn.pixabay.com/download/audio/2022/02/07/audio_1e592795f5.mp3?filename=japanese-chill-hop-115316.mp3",
};

const DEFAULT_FALLBACK_STREAM = "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3";

function decryptMediaUrl(encryptedUrl) {
  try {
    const key = CryptoJS.enc.Utf8.parse("38346591");
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encryptedUrl) },
      key,
      {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
      }
    );
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (err) {
    console.error("DES Decryption error:", err);
    return null;
  }
}

function cleanHtmlText(str) {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function cleanStr(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatDuration(secs) {
  if (isNaN(secs) || secs <= 0) return "3:30";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function formatPlayCount(count) {
  if (!count || isNaN(count) || count <= 0) return null;
  if (count >= 1000000000) return `${(count / 1000000000).toFixed(1)}B`;
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return `${count}`;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim() || searchParams.get("q")?.trim() || "";

  // -------------------------------------------------------------
  // Mode 1: Federated Predictive Autocomplete Search
  // -------------------------------------------------------------
  if (query) {
    const normalizedQuery = query.toLowerCase();
    const cacheKey = `ac:::${normalizedQuery}`;
    if (searchCache.has(cacheKey)) {
      return NextResponse.json(searchCache.get(cacheKey));
    }

    try {
      const autocompleteUrl = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&query=${encodeURIComponent(query)}`;
      const searchResultsUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&q=${encodeURIComponent(query)}&p=1&n=25`;
      const playlistResultsUrl = `https://www.jiosaavn.com/api.php?__call=search.getPlaylistResults&_format=json&q=${encodeURIComponent(query)}&p=1&n=30`;
      const albumResultsUrl = `https://www.jiosaavn.com/api.php?__call=search.getAlbumResults&_format=json&q=${encodeURIComponent(query)}&p=1&n=30`;
      const artistResultsUrl = `https://www.jiosaavn.com/api.php?__call=search.getArtistResults&_format=json&q=${encodeURIComponent(query)}&p=1&n=30`;

      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
      };

      const [resAutocomplete, resResults, resPlaylists, resAlbums, resArtists] = await Promise.all([
        fetch(autocompleteUrl, { headers, next: { revalidate: 300 } }),
        fetch(searchResultsUrl, { headers, next: { revalidate: 300 } }).catch(() => null),
        fetch(playlistResultsUrl, { headers, next: { revalidate: 300 } }).catch(() => null),
        fetch(albumResultsUrl, { headers, next: { revalidate: 300 } }).catch(() => null),
        fetch(artistResultsUrl, { headers, next: { revalidate: 300 } }).catch(() => null),
      ]);

      if (!resAutocomplete.ok) {
        throw new Error(`JioSaavn autocomplete API responded with status ${resAutocomplete.status}`);
      }

      const data = await resAutocomplete.json();
      let searchDataResults = [];
      if (resResults && resResults.ok) {
        try {
          const searchJson = await resResults.json();
          searchDataResults = searchJson.results || [];
        } catch (_) {}
      }

      const formatImage = (img) => (img || "").replace(/50x50|150x150/, "500x500");

      // 1. Process Songs: Start with high-priority predictive autocomplete songs
      const seenSongIds = new Set();
      const songs = [];

      // Prioritize curated perfect songs if query matches a known genre (e.g. Pop, Hip-Hop, Chill, Classical, etc.)
      const matchedGenre = getGenreByName(query);
      if (matchedGenre && Array.isArray(matchedGenre.tracks)) {
        for (const gt of matchedGenre.tracks) {
          if (!seenSongIds.has(gt.id)) {
            seenSongIds.add(gt.id);
            songs.push({
              id: gt.id,
              title: gt.title,
              artist: gt.artist,
              album: gt.album,
              image: gt.coverUrl,
              thumbnail: gt.coverUrl,
              coverUrl: gt.coverUrl,
              duration: gt.duration,
              durationFormatted: gt.durationFormatted,
              ctr: gt.plays ? 1000000 : 0,
              ctrFormatted: gt.plays || null,
              bitrate: "320kbps",
              type: "song",
              audioUrl: gt.audioUrl,
              badge: gt.badge,
              badgeType: gt.badgeType,
            });
          }
        }
      }

      for (const s of (data.songs?.data || [])) {
        if (!s.id || seenSongIds.has(s.id)) continue;
        seenSongIds.add(s.id);
        const cleanTitle = cleanHtmlText(s.title || s.song);
        const primaryArtists = cleanHtmlText(s.more_info?.primary_artists || s.singers || "");
        const albumTitle = cleanHtmlText(s.album || s.more_info?.album || "");
        const artist = primaryArtists || cleanHtmlText(s.description?.split("·")[1]?.trim() || "Various Artists");
        const rawYear = s.more_info?.year || s.year || (s.description?.match(/\b(19\d\d|20\d\d)\b/)?.[1]) || null;
        const year = rawYear ? String(rawYear) : null;
        const ctr = parseInt(s.ctr || "0", 10) || 0;
        const durationSec = parseInt(s.more_info?.duration || "210", 10);

        // Direct CDN Linking: decrypt media URL if available so client streams directly from CDN
        let directAudioUrl = null;
        const encUrl = s.more_info?.encrypted_media_url || s.encrypted_media_url;
        if (encUrl) {
          const rawDecrypted = decryptMediaUrl(encUrl);
          if (rawDecrypted && rawDecrypted.startsWith("http")) {
            directAudioUrl = rawDecrypted.replace(/_96\.mp4/, "_320.mp4");
          }
        }

        songs.push({
          id: s.id,
          title: cleanTitle,
          artist: artist,
          album: albumTitle || artist,
          image: formatImage(s.image),
          thumbnail: formatImage(s.image),
          coverUrl: formatImage(s.image),
          year: year,
          duration: durationSec,
          durationFormatted: formatDuration(durationSec),
          ctr: ctr,
          ctrFormatted: formatPlayCount(ctr) || (ctr > 0 ? `${ctr}` : null),
          bitrate: "320kbps",
          type: "song",
          audioUrl: directAudioUrl, // direct JioSaavn CDN string URL
        });
      }

      // Ensure minimum 15-20 songs by enriching from results without altering the predictive algorithm
      for (const s of searchDataResults) {
        if (!s.id || seenSongIds.has(s.id)) continue;
        seenSongIds.add(s.id);
        const cleanTitle = cleanHtmlText(s.song || s.title);
        const artist = cleanHtmlText(s.primary_artists || s.singers || s.music || "Various Artists");
        const albumTitle = cleanHtmlText(s.album || "");
        const rawYear = s.year || s.more_info?.year || (s.release_date ? s.release_date.split("-")[0] : null);
        const durationSec = parseInt(s.duration || s.more_info?.duration || "210", 10);

        // Direct CDN Linking: decrypt media URL into direct string URL
        let directAudioUrl = null;
        const encUrl = s.more_info?.encrypted_media_url || s.encrypted_media_url;
        if (encUrl) {
          const rawDecrypted = decryptMediaUrl(encUrl);
          if (rawDecrypted && rawDecrypted.startsWith("http")) {
            directAudioUrl = rawDecrypted.replace(/_96\.mp4/, "_320.mp4");
          }
        }

        songs.push({
          id: s.id,
          title: cleanTitle,
          artist: artist,
          album: albumTitle || artist,
          image: formatImage(s.image),
          thumbnail: formatImage(s.image),
          coverUrl: formatImage(s.image),
          year: rawYear ? String(rawYear) : null,
          duration: durationSec,
          durationFormatted: formatDuration(durationSec),
          ctr: 0,
          ctrFormatted: null,
          bitrate: "320kbps",
          type: "song",
          audioUrl: directAudioUrl, // direct JioSaavn CDN string URL
        });

        if (songs.length >= 25) break;
      }

      // 2. Process Artists
      const seenArtistKeys = new Set();
      const artists = [];

      for (const a of (data.artists?.data || [])) {
        const name = cleanHtmlText(a.title || a.name);
        const key = cleanStr(name);
        if (!name || seenArtistKeys.has(key)) continue;
        seenArtistKeys.add(key);
        const avatar = formatImage(a.image);
        artists.push({
          id: a.id || `artist-${key}`,
          name: name,
          title: name,
          avatar: avatar,
          image: avatar,
          role: cleanHtmlText(a.description || a.extra || "Artist"),
          ctr: parseInt(a.ctr || "0", 10) || 0,
          type: "artist",
        });
      }

      if (resArtists && resArtists.ok) {
        try {
          const artJson = await resArtists.json();
          const rawArtists = artJson.results || [];
          for (const a of rawArtists) {
            const name = cleanHtmlText(a.name || a.title);
            const key = cleanStr(name);
            if (!name || seenArtistKeys.has(key)) continue;
            seenArtistKeys.add(key);
            const avatar = formatImage(a.image);
            artists.push({
              id: String(a.id || `artist-${key}`),
              name: name,
              title: name,
              avatar: avatar,
              image: avatar,
              role: cleanHtmlText(a.role || "Artist"),
              ctr: parseInt(a.ctr || "0", 10) || 0,
              type: "artist",
            });
          }
        } catch (_) {}
      }

      // 3. Process Albums
      const seenAlbumIds = new Set();
      const albums = [];

      for (const alb of (data.albums?.data || [])) {
        const id = String(alb.id || alb.albumid || "");
        if (!id || seenAlbumIds.has(id)) continue;
        seenAlbumIds.add(id);
        const title = cleanHtmlText(alb.title);
        const artist = cleanHtmlText(alb.music || alb.more_info?.primary_artists || alb.description?.split("·")?.pop()?.trim() || "Soundtrack");
        const rawYear = alb.more_info?.year || (alb.description?.match(/\b(19\d\d|20\d\d)\b/)?.[1]) || null;
        const isMovie = alb.more_info?.is_movie === "1" || (alb.description || "").toLowerCase().includes("film");
        albums.push({
          id: id,
          title: title,
          artist: artist,
          music: artist,
          year: rawYear ? String(rawYear) : null,
          image: formatImage(alb.image),
          thumbnail: formatImage(alb.image),
          coverUrl: formatImage(alb.image),
          isMovie: isMovie,
          ctr: parseInt(alb.ctr || "0", 10) || 0,
          type: "album",
        });
      }

      if (resAlbums && resAlbums.ok) {
        try {
          const albJson = await resAlbums.json();
          const rawAlbums = albJson.results || [];
          for (const alb of rawAlbums) {
            const id = String(alb.albumid || alb.id || "");
            if (!id || seenAlbumIds.has(id)) continue;
            seenAlbumIds.add(id);
            const title = cleanHtmlText(alb.title);
            const artist = cleanHtmlText(alb.primary_artists || alb.music || (typeof alb.artist === "string" ? alb.artist : "") || "Soundtrack");
            const rawYear = alb.year || null;
            const isMovie = alb.is_movie === "1" || (alb.query || "").toLowerCase().includes("movie");
            albums.push({
              id: id,
              title: title,
              artist: artist,
              music: artist,
              year: rawYear ? String(rawYear) : null,
              image: formatImage(alb.image),
              thumbnail: formatImage(alb.image),
              coverUrl: formatImage(alb.image),
              isMovie: isMovie,
              ctr: 0,
              type: "album",
            });
          }
        } catch (_) {}
      }

      // 4. Process Playlists
      const seenPlaylistIds = new Set();
      const playlists = [];

      for (const pl of (data.playlists?.data || [])) {
        if (!pl.id || seenPlaylistIds.has(String(pl.id))) continue;
        seenPlaylistIds.add(String(pl.id));
        const title = cleanHtmlText(pl.title);
        const curator = cleanHtmlText(pl.extra || pl.description || "JioSaavn Editor");
        playlists.push({
          id: String(pl.id),
          title: title,
          subtitle: cleanHtmlText(pl.description || pl.extra || "Curated Playlist"),
          description: cleanHtmlText(pl.description || pl.extra || "Curated Playlist"),
          curator: curator,
          songCount: 25,
          image: formatImage(pl.image),
          thumbnail: formatImage(pl.image),
          coverUrl: formatImage(pl.image),
          language: pl.language || "",
          type: "playlist",
        });
      }

      if (resPlaylists && resPlaylists.ok) {
        try {
          const plJson = await resPlaylists.json();
          const rawPls = plJson.results || [];
          for (const pl of rawPls) {
            const pid = String(pl.listid || pl.id || "");
            if (!pid || seenPlaylistIds.has(pid)) continue;
            seenPlaylistIds.add(pid);
            const title = cleanHtmlText(pl.listname || pl.title || "Playlist");
            const curator = cleanHtmlText(pl.firstname || pl.username || "JioSaavn Editor");
            const count = pl.count || pl.song_count || null;
            const subtitle = count ? `${curator} • ${count} tracks` : curator;
            playlists.push({
              id: pid,
              title: title,
              subtitle: subtitle,
              description: subtitle,
              curator: curator,
              songCount: count,
              image: formatImage(pl.image),
              thumbnail: formatImage(pl.image),
              coverUrl: formatImage(pl.image),
              language: pl.language || "",
              type: "playlist",
            });
          }
        } catch (_) {}
      }

      // 5. Process Top Match
      let topMatch = null;
      const rawTop = data.topquery?.data?.[0];
      if (rawTop) {
        const topType = (rawTop.type || "song").toLowerCase();
        let subtitle = "";
        if (topType === "artist") {
          subtitle = "Artist";
        } else if (topType === "album") {
          const albArtist = cleanHtmlText(rawTop.music || rawTop.more_info?.primary_artists || rawTop.description || "");
          const albYear = rawTop.more_info?.year || "";
          subtitle = albArtist ? (albYear ? `${albArtist} • ${albYear}` : albArtist) : "Album";
        } else {
          // song
          const songArtist = cleanHtmlText(rawTop.more_info?.primary_artists || rawTop.description || "");
          const songAlbum = cleanHtmlText(rawTop.album || "");
          subtitle = songArtist ? (songAlbum ? `${songArtist} • ${songAlbum}` : songArtist) : "Song";
        }

        topMatch = {
          id: rawTop.id,
          title: cleanHtmlText(rawTop.title),
          type: topType,
          image: formatImage(rawTop.image),
          thumbnail: formatImage(rawTop.image),
          coverUrl: formatImage(rawTop.image),
          subtitle: subtitle,
          artist: cleanHtmlText(rawTop.more_info?.primary_artists || rawTop.music || rawTop.extra || ""),
          album: cleanHtmlText(rawTop.album || ""),
          year: rawTop.more_info?.year || null,
          ctr: parseInt(rawTop.ctr || "0", 10) || 0,
          ctrFormatted: formatPlayCount(parseInt(rawTop.ctr || "0", 10)),
        };
      } else if (songs.length > 0) {
        topMatch = {
          ...songs[0],
          subtitle: `${songs[0].artist} • ${songs[0].album}`,
          type: "song",
        };
      } else if (artists.length > 0) {
        topMatch = {
          ...artists[0],
          subtitle: "Artist",
          type: "artist",
        };
      } else if (albums.length > 0) {
        topMatch = {
          ...albums[0],
          subtitle: `${albums[0].artist}${albums[0].year ? ` • ${albums[0].year}` : ""}`,
          type: "album",
        };
      }

      const responsePayload = {
        success: true,
        query,
        topMatch,
        songs,
        artists,
        albums,
        playlists,
        tracks: songs, // backwards compatibility
        results: songs,
      };

      searchCache.set(cacheKey, responsePayload);
      return NextResponse.json(responsePayload);
    } catch (err) {
      console.error("Predictive autocomplete search error:", err);
      const localFallback = NOCTURNE_TRACKS.filter(
        (t) =>
          t.title.toLowerCase().includes(normalizedQuery) ||
          t.artist.toLowerCase().includes(normalizedQuery)
      ).map((t) => ({
        ...t,
        thumbnail: t.coverUrl,
        bitrate: "320kbps",
        type: "song",
      }));

      return NextResponse.json({
        success: true,
        query,
        topMatch: localFallback[0] || null,
        songs: localFallback,
        artists: [],
        albums: [],
        playlists: [],
        tracks: localFallback,
        results: localFallback,
      });
    }
  }

  // -------------------------------------------------------------
  // Mode 2: Single Track Audio Stream Resolution
  // -------------------------------------------------------------
  const title = searchParams.get("title")?.trim() || "";
  const artist = searchParams.get("artist")?.trim() || "";
  const trackId = searchParams.get("trackId")?.trim() || "";

  if (!title && !trackId) {
    return NextResponse.json({ error: "query, title, or trackId is required" }, { status: 400 });
  }

  const cacheKey = trackId ? `audio-id:::${trackId}` : `audio:::${title.toLowerCase()}---${artist.toLowerCase()}`;
  if (audioCache.has(cacheKey)) {
    return NextResponse.json(audioCache.get(cacheKey));
  }

  if (trackId && FALLBACK_TRACK_STREAMS[trackId]) {
    const fallbackResponse = {
      success: true,
      source: "curated_ambient",
      title: title || "Nocturne Track",
      artist: artist || "Nocturne Audio",
      audioUrl: FALLBACK_TRACK_STREAMS[trackId],
      bitrate: "320kbps",
    };
    audioCache.set(cacheKey, fallbackResponse);
    return NextResponse.json(fallbackResponse);
  }

  // Primary Path: Resolve directly by trackId via song.getDetails (fast & high fidelity 320kbps stream)
  if (trackId) {
    try {
      const detailsUrl = `https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${encodeURIComponent(trackId)}&_format=json`;
      const res = await fetch(detailsUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
        },
        next: { revalidate: 3600 },
      });

      if (res.ok) {
        const detailsData = await res.json();
        const song = detailsData[trackId] || Object.values(detailsData)[0];
        const encryptedMediaUrl = song?.more_info?.encrypted_media_url || song?.encrypted_media_url;

        if (encryptedMediaUrl) {
          const rawDecryptedUrl = decryptMediaUrl(encryptedMediaUrl);
          if (rawDecryptedUrl && rawDecryptedUrl.startsWith("http")) {
            const highBitrateUrl = rawDecryptedUrl.replace(/_96\.mp4/, "_320.mp4");
            const responseData = {
              success: true,
              source: "jiosaavn_pid",
              songId: song.id || trackId,
              title: cleanHtmlText(song.song || song.title || title),
              artist: cleanHtmlText(song.primary_artists || song.singers || artist),
              album: cleanHtmlText(song.album || ""),
              year: song.year || null,
              audioUrl: highBitrateUrl,
              fallbackAudioUrl: rawDecryptedUrl,
              bitrate: "320kbps",
              duration: parseInt(song.more_info?.duration || song.duration || "210", 10),
              coverUrl: (song.image || "").replace(/50x50|150x150/, "500x500") || null,
            };
            audioCache.set(cacheKey, responseData);
            // DIRECT CDN LINKING: Strictly return JSON with CDN string URL - never stream binary
            return NextResponse.json(responseData, {
              headers: {
                "Cache-Control": "public, max-age=3600, s-maxage=3600",
              },
            });
          }
        }
      }
    } catch (err) {
      console.warn("Direct trackId resolution failed, trying fallback search:", err);
    }
  }

  // Secondary Fallback Path: Search by title & artist
  const queryStr = artist ? `${title} ${artist}` : title;
  const searchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&p=1&n=5&q=${encodeURIComponent(queryStr)}`;

  try {
    const apiRes = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
      },
      next: { revalidate: 3600 },
    });

    if (!apiRes.ok) {
      throw new Error(`JioSaavn API responded with status ${apiRes.status}`);
    }

    const data = await apiRes.json();
    const results = data.results || [];

    if (results.length > 0) {
      const topSong = results[0];
      const encryptedMediaUrl = topSong.more_info?.encrypted_media_url || topSong.encrypted_media_url;

      if (encryptedMediaUrl) {
        const rawDecryptedUrl = decryptMediaUrl(encryptedMediaUrl);

        if (rawDecryptedUrl && rawDecryptedUrl.startsWith("http")) {
          const highBitrateUrl = rawDecryptedUrl.replace(/_96\.mp4/, "_320.mp4");

          const responseData = {
            success: true,
            source: "jiosaavn_search",
            songId: topSong.id,
            title: cleanHtmlText(topSong.song || title),
            artist: cleanHtmlText(topSong.primary_artists || artist),
            album: cleanHtmlText(topSong.album || ""),
            year: topSong.year,
            audioUrl: highBitrateUrl,
            fallbackAudioUrl: rawDecryptedUrl,
            bitrate: "320kbps",
            duration: parseInt(topSong.more_info?.duration || "210", 10),
            coverUrl: topSong.image?.replace("150x150", "500x500") || null,
          };

          audioCache.set(cacheKey, responseData);
          // DIRECT CDN LINKING: Return pure JSON with direct CDN URL string
          return NextResponse.json(responseData, {
            headers: {
              "Cache-Control": "public, max-age=3600, s-maxage=3600",
            },
          });
        }
      }
    }

    const fallbackUrl = (trackId && FALLBACK_TRACK_STREAMS[trackId]) || DEFAULT_FALLBACK_STREAM;
    const fallbackData = {
      success: true,
      source: "fallback",
      title,
      artist,
      audioUrl: fallbackUrl,
      bitrate: "192kbps",
      duration: 210,
    };
    audioCache.set(cacheKey, fallbackData);
    return NextResponse.json(fallbackData);
  } catch (error) {
    console.error("Audio stream resolution error:", error);
    const fallbackUrl = (trackId && FALLBACK_TRACK_STREAMS[trackId]) || DEFAULT_FALLBACK_STREAM;
    return NextResponse.json({
      success: true,
      source: "fallback_error",
      title,
      artist,
      audioUrl: fallbackUrl,
      bitrate: "192kbps",
      duration: 210,
    });
  }
}
