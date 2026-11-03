import CryptoJS from "crypto-js";
import { NOCTURNE_TRACKS } from "../data/nocturneData.js";
import { getGenreByName } from "../data/genreData.js";
import { rankAllSearchEntities, rankSongs, normalizeText } from "./searchRanking/index.js";

// In-memory cache for search queries
const searchCache = new Map();
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export const JIOSAAVN_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "X-Forwarded-For": "103.211.54.1",
  "CF-Connecting-IP": "103.211.54.1",
  "X-Real-IP": "103.211.54.1",
  Cookie:
    "geo=103.211.54.1%2CIN%2CKerala%2CKochi%2C682507; CH=G03%2CA07%2CO00%2CL03; L=english%2Chindi; _pl=website-;",
};

export function decryptMediaUrl(encryptedUrl) {
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
    return null;
  }
}

export function cleanHtmlText(str) {
  if (!str) return "";
  return str
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export function cleanStr(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeSongTitle(t) {
  if (!t) return "";
  return t
    .replace(/&quot;/g, "")
    .replace(/&#039;/g, "")
    .replace(/&#39;/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s*[\(\[](?:from|feat\.?|with|soundtrack|version|remix|acoustic|karaoke|live)[^\)\]]*[\)\]]/gi, "")
    .replace(/[^a-z0-9]/gi, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function parsePlayCount(raw) {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number") return isNaN(raw) ? 0 : Math.round(raw);
  const str = String(raw).trim().toUpperCase();
  if (!str) return 0;
  const match = str.match(/^([\d,.]+)\s*([BKM])?$/);
  if (match) {
    const numPart = parseFloat(match[1].replace(/,/g, ""));
    if (isNaN(numPart)) return 0;
    const suffix = match[2];
    if (suffix === "B") return Math.round(numPart * 1000000000);
    if (suffix === "M") return Math.round(numPart * 1000000);
    if (suffix === "K") return Math.round(numPart * 1000);
    return Math.round(numPart);
  }
  const num = parseFloat(str.replace(/[^0-9.]/g, ""));
  return isNaN(num) ? 0 : Math.round(num);
}

export function formatDuration(secs) {
  if (isNaN(secs) || secs <= 0) return "3:30";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function formatPlayCount(count) {
  if (!count || isNaN(count) || count <= 0) return null;
  if (count >= 1000000000) return `${(count / 1000000000).toFixed(1)}B`;
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return `${count}`;
}

export function rankAndDeduplicateSongs(songs, rawQuery, topArtistHint = "") {
  if (!Array.isArray(songs) || songs.length === 0) return [];
  return rankSongs(songs, rawQuery, {
    matchedArtistName: normalizeText(topArtistHint),
  });
}

/**
 * Core reference search function for JioSaavn.
 * Returns the exact same response structure as the main Search page (/api/audio/search).
 *
 * @param {string} rawQuery
 * @param {object} [options]
 * @param {number} [options.page=1]
 * @param {number} [options.limit=40]
 * @returns {Promise<{ success: boolean, query: string, page: number, topMatch: any, songs: Array<any>, artists: Array<any>, albums: Array<any>, playlists: Array<any>, tracks: Array<any>, results: Array<any> }>}
 */
export async function searchJioSaavnCatalog(rawQuery, options = {}) {
  const query = (rawQuery || "").trim();
  const page = parseInt(options.page || 1, 10) || 1;
  const limit = parseInt(options.limit || 40, 10) || 40;

  if (!query) {
    return {
      success: true,
      query: "",
      page: 1,
      topMatch: null,
      songs: [],
      artists: [],
      albums: [],
      playlists: [],
      tracks: [],
      results: [],
    };
  }

  const normalizedQuery = query.toLowerCase();
  const cacheKey = `jio_catalog:::${normalizedQuery}:::p${page}:::n${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const isMovieQuery = /\bmovie\b/i.test(query);
    const movieCleanQuery = query.replace(/\bmovie\b/gi, "").trim();

    const autocompleteUrl = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&query=${encodeURIComponent(query)}`;
    const searchResultsUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&q=${encodeURIComponent(query)}&p=${page}&n=${limit}`;
    const playlistResultsUrl = `https://www.jiosaavn.com/api.php?__call=search.getPlaylistResults&_format=json&q=${encodeURIComponent(query)}&p=1&n=30`;
    const albumResultsUrl = `https://www.jiosaavn.com/api.php?__call=search.getAlbumResults&_format=json&q=${encodeURIComponent(query)}&p=1&n=30`;
    const artistResultsUrl = `https://www.jiosaavn.com/api.php?__call=search.getArtistResults&_format=json&q=${encodeURIComponent(query)}&p=1&n=30`;

    const headers = JIOSAAVN_HEADERS;

    const fetchPromises = [
      page === 1 ? fetch(autocompleteUrl, { headers, next: { revalidate: 300 } }).catch(() => null) : Promise.resolve(null),
      fetch(searchResultsUrl, { headers, next: { revalidate: 300 } }).catch(() => null),
      page === 1 ? fetch(playlistResultsUrl, { headers, next: { revalidate: 300 } }).catch(() => null) : Promise.resolve(null),
      page === 1 ? fetch(albumResultsUrl, { headers, next: { revalidate: 300 } }).catch(() => null) : Promise.resolve(null),
      page === 1 ? fetch(artistResultsUrl, { headers, next: { revalidate: 300 } }).catch(() => null) : Promise.resolve(null),
    ];

    if (isMovieQuery && movieCleanQuery && page === 1) {
      const movieAlbumUrl = `https://www.jiosaavn.com/api.php?__call=search.getAlbumResults&_format=json&q=${encodeURIComponent(movieCleanQuery)}&p=1&n=20`;
      const movieSearchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&q=${encodeURIComponent(movieCleanQuery)}&p=1&n=30`;
      const movieAutoUrl = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&query=${encodeURIComponent(movieCleanQuery)}`;
      fetchPromises.push(
        fetch(movieAlbumUrl, { headers, next: { revalidate: 300 } }).catch(() => null),
        fetch(movieSearchUrl, { headers, next: { revalidate: 300 } }).catch(() => null),
        fetch(movieAutoUrl, { headers, next: { revalidate: 300 } }).catch(() => null)
      );
    }

    const [resAutocomplete, resResults, resPlaylists, resAlbums, resArtists, resMovieAlbums, resMovieSearch, resMovieAuto] = await Promise.all(fetchPromises);

    let data = {};
    if (resAutocomplete && resAutocomplete.ok) {
      try {
        data = await resAutocomplete.json();
      } catch (_) {}
    }

    let searchDataResults = [];
    if (resResults && resResults.ok) {
      try {
        const searchJson = await resResults.json();
        searchDataResults = searchJson.results || [];
      } catch (_) {}
    }

    let movieAlbumResults = [];
    if (resMovieAlbums && resMovieAlbums.ok) {
      try {
        const mAlbJson = await resMovieAlbums.json();
        movieAlbumResults = mAlbJson.results || [];
      } catch (_) {}
    }
    if (resMovieSearch && resMovieSearch.ok) {
      try {
        const mSearchJson = await resMovieSearch.json();
        if (Array.isArray(mSearchJson.results)) {
          searchDataResults = [...mSearchJson.results, ...searchDataResults];
        }
      } catch (_) {}
    }
    if (resMovieAuto && resMovieAuto.ok) {
      try {
        const mAutoJson = await resMovieAuto.json();
        if (mAutoJson.albums?.data && (!data.albums?.data || data.albums.data.length === 0)) {
          data.albums = mAutoJson.albums;
        }
        if (mAutoJson.songs?.data && (!data.songs?.data || data.songs.data.length === 0)) {
          data.songs = mAutoJson.songs;
        }
      } catch (_) {}
    }

    let movieFullSongs = [];
    let primaryMovieAlbum = null;
    if (isMovieQuery && movieCleanQuery) {
      const candidateMovieAlbums = [
        ...(movieAlbumResults || []),
        ...(data.albums?.data || []),
      ];
      const matched =
        candidateMovieAlbums.find((alb) => {
          const title = cleanStr(alb.title || alb.name || "");
          const target = cleanStr(movieCleanQuery);
          return title === target || title.includes(target) || target.includes(title);
        }) || candidateMovieAlbums[0];

      if (matched) {
        const mAlbumId = String(matched.id || matched.albumid || "");
        primaryMovieAlbum = {
          id: mAlbumId,
          title: cleanHtmlText(matched.title || matched.name || movieCleanQuery),
          artist: cleanHtmlText(matched.music || matched.primary_artists || matched.artist || "Soundtrack"),
          year: matched.year || matched.more_info?.year || null,
          image: matched.image,
          isMovie: true,
        };
        if (mAlbumId && /^\d+$/.test(mAlbumId)) {
          try {
            const albumDetailsUrl = `https://www.jiosaavn.com/api.php?__call=content.getAlbumDetails&_format=json&albumid=${encodeURIComponent(mAlbumId)}`;
            const albRes = await fetch(albumDetailsUrl, { headers, next: { revalidate: 3600 } });
            if (albRes.ok) {
              const albDetails = await albRes.json();
              if (albDetails && Array.isArray(albDetails.songs)) {
                movieFullSongs = albDetails.songs;
                if (albDetails.title) primaryMovieAlbum.title = cleanHtmlText(albDetails.title);
              }
            }
          } catch (_) {}
        }
      }
    }

    const formatImage = (img) => (img || "").replace(/50x50|150x150/, "500x500");

    // Build media map for decrypted audio stream URLs
    const searchMediaMap = new Map();
    for (const s of searchDataResults) {
      if (!s.id) continue;
      const encUrl = s.more_info?.encrypted_media_url || s.encrypted_media_url;
      if (encUrl) {
        const rawDecrypted = decryptMediaUrl(encUrl);
        if (rawDecrypted && rawDecrypted.startsWith("http")) {
          searchMediaMap.set(String(s.id), rawDecrypted.replace(/_96\.mp4/, "_320.mp4"));
        }
      }
    }

    // 1. Process candidate songs from genre, autocomplete, search results, and movie songs
    const rawCandidateSongs = [];
    const seenRawIds = new Set();

    const matchedGenre = getGenreByName(query);
    if (matchedGenre && Array.isArray(matchedGenre.tracks)) {
      for (const gt of matchedGenre.tracks) {
        if (!seenRawIds.has(gt.id)) {
          seenRawIds.add(gt.id);
          rawCandidateSongs.push({
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
            playCount: gt.plays ? 1000000 : 0,
            playCountFormatted: gt.plays || null,
            bitrate: "320kbps",
            type: "song",
            audioUrl: gt.audioUrl,
            badge: gt.badge,
            badgeType: gt.badgeType,
          });
        }
      }
    }

    if (Array.isArray(movieFullSongs) && movieFullSongs.length > 0) {
      for (const s of movieFullSongs) {
        if (!s.id || seenRawIds.has(s.id)) continue;
        seenRawIds.add(s.id);
        const cleanTitle = cleanHtmlText(s.song || s.title);
        const primaryArtists = cleanHtmlText(s.more_info?.primary_artists || s.singers || primaryMovieAlbum?.artist || "Soundtrack");
        const albumTitle = cleanHtmlText(primaryMovieAlbum?.title || s.album || movieCleanQuery);
        const rawYear = s.year || s.more_info?.year || primaryMovieAlbum?.year || null;
        const rawPlays = s.play_count || s.more_info?.play_count || s.ctr || 0;
        const playCount = parsePlayCount(rawPlays);
        const durationSec = parseInt(s.duration || s.more_info?.duration || "210", 10);
        const encUrl = s.more_info?.encrypted_media_url || s.encrypted_media_url;
        let directAudioUrl = null;
        if (encUrl) {
          const rawDecrypted = decryptMediaUrl(encUrl);
          if (rawDecrypted && rawDecrypted.startsWith("http")) {
            directAudioUrl = rawDecrypted.replace(/_96\.mp4/, "_320.mp4");
          }
        }
        if (!directAudioUrl && searchMediaMap.has(String(s.id))) {
          directAudioUrl = searchMediaMap.get(String(s.id));
        }
        rawCandidateSongs.push({
          id: String(s.id),
          title: cleanTitle,
          artist: primaryArtists,
          album: albumTitle,
          album_id: s.albumid || s.more_info?.album_id || primaryMovieAlbum?.id || "",
          image: formatImage(s.image || primaryMovieAlbum?.image),
          thumbnail: formatImage(s.image || primaryMovieAlbum?.image),
          coverUrl: formatImage(s.image || primaryMovieAlbum?.image),
          year: rawYear ? String(rawYear) : null,
          duration: durationSec,
          durationFormatted: formatDuration(durationSec),
          ctr: playCount,
          ctrFormatted: formatPlayCount(playCount),
          playCount: playCount,
          playCountFormatted: formatPlayCount(playCount),
          bitrate: "320kbps",
          type: "song",
          audioUrl: directAudioUrl,
          isMovieTrack: true,
          movieName: movieCleanQuery,
          language: cleanHtmlText(s.language || s.more_info?.language || primaryMovieAlbum?.language || "").toLowerCase(),
        });
      }
    }

    for (const s of data.songs?.data || []) {
      if (!s.id || seenRawIds.has(String(s.id))) continue;
      seenRawIds.add(String(s.id));
      const cleanTitle = cleanHtmlText(s.title || s.song);
      const primaryArtists = cleanHtmlText(s.more_info?.primary_artists || s.singers || "");
      const albumTitle = cleanHtmlText(s.album || s.more_info?.album || "");
      const artist = primaryArtists || cleanHtmlText(s.description?.split("·")[1]?.trim() || "Various Artists");
      const rawYear = s.more_info?.year || s.year || s.description?.match(/\b(19\d\d|20\d\d)\b/)?.[1] || null;
      const year = rawYear ? String(rawYear) : null;
      const rawPlays = s.more_info?.play_count || s.ctr || 0;
      const playCount = parsePlayCount(rawPlays);
      const durationSec = parseInt(s.more_info?.duration || "210", 10);

      let directAudioUrl = null;
      const encUrl = s.more_info?.encrypted_media_url || s.encrypted_media_url;
      if (encUrl) {
        const rawDecrypted = decryptMediaUrl(encUrl);
        if (rawDecrypted && rawDecrypted.startsWith("http")) {
          directAudioUrl = rawDecrypted.replace(/_96\.mp4/, "_320.mp4");
        }
      }
      if (!directAudioUrl && searchMediaMap.has(String(s.id))) {
        directAudioUrl = searchMediaMap.get(String(s.id));
      }

      rawCandidateSongs.push({
        id: String(s.id),
        title: cleanTitle,
        artist: artist,
        album: albumTitle || artist,
        album_id: s.albumid || s.more_info?.album_id || "",
        image: formatImage(s.image),
        thumbnail: formatImage(s.image),
        coverUrl: formatImage(s.image),
        year: year,
        duration: durationSec,
        durationFormatted: formatDuration(durationSec),
        ctr: playCount,
        ctrFormatted: formatPlayCount(playCount) || (playCount > 0 ? `${playCount}` : null),
        playCount: playCount,
        playCountFormatted: formatPlayCount(playCount),
        bitrate: "320kbps",
        type: "song",
        audioUrl: directAudioUrl,
        language: cleanHtmlText(s.language || s.more_info?.language || "").toLowerCase(),
      });
    }

    for (const s of searchDataResults) {
      if (!s.id) continue;
      const cleanTitle = cleanHtmlText(s.song || s.title);
      const artist = cleanHtmlText(s.primary_artists || s.singers || s.music || "Various Artists");
      const albumTitle = cleanHtmlText(s.album || "");
      const rawYear = s.year || s.more_info?.year || (s.release_date ? s.release_date.split("-")[0] : null);
      const durationSec = parseInt(s.duration || s.more_info?.duration || "210", 10);
      const directAudioUrl = searchMediaMap.get(String(s.id)) || null;
      const rawPlays = s.play_count || s.more_info?.play_count || 0;
      const playCount = parsePlayCount(rawPlays);

      if (seenRawIds.has(String(s.id))) {
        const existing = rawCandidateSongs.find((item) => String(item.id) === String(s.id));
        if (existing) {
          if (!existing.audioUrl && directAudioUrl) {
            existing.audioUrl = directAudioUrl;
          }
          if (playCount > (existing.playCount || 0)) {
            existing.playCount = playCount;
            existing.playCountFormatted = formatPlayCount(playCount);
            existing.ctr = playCount;
            existing.ctrFormatted = formatPlayCount(playCount);
          }
          if (!existing.language && (s.language || s.more_info?.language)) {
            existing.language = cleanHtmlText(s.language || s.more_info?.language).toLowerCase();
          }
        }
        continue;
      }

      seenRawIds.add(String(s.id));
      rawCandidateSongs.push({
        id: String(s.id),
        title: cleanTitle,
        artist: artist,
        album: albumTitle || artist,
        album_id: s.albumid || s.more_info?.album_id || "",
        image: formatImage(s.image),
        thumbnail: formatImage(s.image),
        coverUrl: formatImage(s.image),
        year: rawYear ? String(rawYear) : null,
        duration: durationSec,
        durationFormatted: formatDuration(durationSec),
        ctr: playCount,
        ctrFormatted: formatPlayCount(playCount),
        playCount: playCount,
        playCountFormatted: formatPlayCount(playCount),
        bitrate: "320kbps",
        type: "song",
        audioUrl: directAudioUrl,
        language: cleanHtmlText(s.language || s.more_info?.language || "").toLowerCase(),
      });
    }

    const rawTopArtist =
      data.topquery?.data?.[0]?.more_info?.primary_artists ||
      data.topquery?.data?.[0]?.music ||
      (data.topquery?.data?.[0]?.description || "").replace(/^Song by\s*/i, "").split("·")[0].trim() ||
      data.songs?.data?.[0]?.more_info?.primary_artists ||
      data.artists?.data?.[0]?.title ||
      "";

    const songs = rankAndDeduplicateSongs(rawCandidateSongs, query, rawTopArtist);

    // 2. Process Artists
    const seenArtistKeys = new Set();
    const artists = [];
    for (const a of data.artists?.data || []) {
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
        for (const a of artJson.results || []) {
          const name = cleanHtmlText(a.name || a.title);
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
            role: cleanHtmlText(a.role || a.description || "Artist"),
            ctr: 0,
            type: "artist",
          });
        }
      } catch (_) {}
    }

    // 3. Process Albums
    const seenAlbumIds = new Set();
    const albums = [];
    if (primaryMovieAlbum) {
      albums.push(primaryMovieAlbum);
      seenAlbumIds.add(String(primaryMovieAlbum.id));
    }

    for (const alb of data.albums?.data || []) {
      const id = String(alb.albumid || alb.id || "");
      if (!id || seenAlbumIds.has(id)) continue;
      seenAlbumIds.add(id);
      const title = cleanHtmlText(alb.title);
      const artist = cleanHtmlText(alb.music || alb.artist || alb.description?.split("·")[1]?.trim() || "Soundtrack");
      const rawYear = alb.year || alb.more_info?.year || (alb.description?.match(/\b(19\d\d|20\d\d)\b/)?.[1]) || null;
      const isMovie = alb.is_movie === "1" || (alb.query || "").toLowerCase().includes("movie") || (isMovieQuery && cleanStr(title).includes(cleanStr(movieCleanQuery)));
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
        for (const alb of albJson.results || []) {
          const id = String(alb.albumid || alb.id || "");
          if (!id || seenAlbumIds.has(id)) continue;
          seenAlbumIds.add(id);
          const title = cleanHtmlText(alb.title);
          const artist = cleanHtmlText(alb.primary_artists || alb.music || (typeof alb.artist === "string" ? alb.artist : "") || "Soundtrack");
          const rawYear = alb.year || null;
          const isMovie = alb.is_movie === "1" || (alb.query || "").toLowerCase().includes("movie") || (isMovieQuery && cleanStr(title).includes(cleanStr(movieCleanQuery)));
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
    for (const pl of data.playlists?.data || []) {
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
        for (const pl of plJson.results || []) {
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

    // 5. Intelligent Top Match
    let topMatch = null;
    const rawTop = data.topquery?.data?.[0];
    const topSong = songs[0] || null;
    const cleanQ = cleanStr(query);
    const normQ = normalizeSongTitle(query);

    const topSongClean = topSong ? cleanStr(topSong.title) : "";
    const topSongNorm = topSong ? normalizeSongTitle(topSong.title) : "";
    const isTopSongExactMatch = topSong && (topSongClean === cleanQ || topSongNorm === normQ);

    const matchedArtist = artists.find((a) => cleanStr(a.name) === cleanQ);
    const isArtistSearch = Boolean(
      matchedArtist &&
      (!isTopSongExactMatch || (rawTop?.type === "artist" && rawTop?.id === matchedArtist.id))
    );

    const isExplicitRemixOrCover = /\b(remix|mix|acoustic|cover|instrumental|karaoke|slowed|live)\b/i.test(query);
    const isRawTopDegraded =
      rawTop &&
      !isExplicitRemixOrCover &&
      (/\b(remix|acoustic|cover|instrumental|karaoke|slowed|rendition)\b/i.test(rawTop.title || "") ||
        /\b(originally performed|tribute)\b/i.test(rawTop.description || ""));

    if (rawTop && !isRawTopDegraded && !isArtistSearch) {
      const topId = String(rawTop.id);
      const enrichedSong = songs.find((s) => String(s.id) === topId);
      if (enrichedSong) {
        topMatch = {
          ...enrichedSong,
          type: "song",
          badge: enrichedSong.badge || "Top Song",
          badgeType: enrichedSong.badgeType || "top",
        };
      } else {
        const topType = rawTop.type || "song";
        topMatch = {
          id: topId,
          title: cleanHtmlText(rawTop.title),
          artist: cleanHtmlText(rawTop.more_info?.primary_artists || rawTop.description || ""),
          album: cleanHtmlText(rawTop.more_info?.album || rawTop.album || ""),
          image: formatImage(rawTop.image),
          thumbnail: formatImage(rawTop.image),
          coverUrl: formatImage(rawTop.image),
          type: topType,
          badge: "Top Result",
          badgeType: "top",
        };
      }
    } else if (isArtistSearch && matchedArtist) {
      topMatch = {
        ...matchedArtist,
        type: "artist",
        badge: "Top Artist",
        badgeType: "artist",
      };
    } else if (topSong) {
      topMatch = {
        ...topSong,
        badge: "Top Song",
        badgeType: "top",
      };
    }

    const rankedOutput = rankAllSearchEntities(
      {
        songs: rawCandidateSongs,
        artists,
        albums,
        playlists,
        topMatch,
      },
      query,
      {
        matchedArtistName: normalizeText(rawTopArtist),
      }
    );

    const result = {
      success: true,
      query,
      page,
      topMatch: rankedOutput.topMatch || topMatch,
      songs: rankedOutput.songs,
      artists: rankedOutput.artists,
      albums: rankedOutput.albums,
      playlists: rankedOutput.playlists,
      tracks: rankedOutput.songs,
      results: rankedOutput.songs,
    };

    searchCache.set(cacheKey, { timestamp: Date.now(), data: result });
    if (searchCache.size > 500) {
      const oldestKey = searchCache.keys().next().value;
      searchCache.delete(oldestKey);
    }

    return result;
  } catch (err) {
    console.error("[JioSaavn Search Service] Error:", err?.message || err);
    // Fallback to local nocturne tracks if totally offline
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

    return {
      success: true,
      query,
      page,
      topMatch: localFallback[0] || null,
      songs: localFallback,
      artists: [],
      albums: [],
      playlists: [],
      tracks: localFallback,
      results: localFallback,
    };
  }
}

/**
 * Searches JioSaavn specifically for song tracks using the reference search catalog.
 * Guarantees 100% parity with the songs displayed on Ceepeefy's main Search page.
 *
 * @param {string} query
 * @param {object} [options]
 * @returns {Promise<Array<any>>}
 */
export async function searchJioSaavnSongs(query, options = {}) {
  const catalog = await searchJioSaavnCatalog(query, options);
  return Array.isArray(catalog.songs) ? catalog.songs : [];
}
