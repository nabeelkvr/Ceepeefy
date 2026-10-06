import { NextResponse } from "next/server";
import CryptoJS from "crypto-js";
import { NOCTURNE_TRACKS } from "../../../../data/nocturneData";
import { getGenreByName } from "../../../../data/genreData";

// In-memory caches to prevent redundant external API queries
const audioCache = new Map();
const searchCache = new Map();

const JIOSAAVN_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "X-Forwarded-For": "103.211.54.1",
  "CF-Connecting-IP": "103.211.54.1",
  "X-Real-IP": "103.211.54.1",
  Cookie:
    "geo=103.211.54.1%2CIN%2CKerala%2CKochi%2C682507; CH=G03%2CA07%2CO00%2CL03; L=english%2Chindi; _pl=website-;",
};

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

function normalizeSongTitle(t) {
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

function parsePlayCount(raw) {
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

function rankAndDeduplicateSongs(songs, rawQuery, topArtistHint = "") {
  if (!Array.isArray(songs) || songs.length === 0) return [];
  const q = (rawQuery || "").toLowerCase().trim();
  const qNorm = normalizeSongTitle(q);
  const qClean = cleanStr(q);
  const hintClean = cleanStr(topArtistHint);

  const isExplicitRemix = /\b(remix|mix|mashup)\b/i.test(q);
  const isExplicitAcoustic = /\b(acoustic|unplugged)\b/i.test(q);
  const isExplicitCover = /\b(cover|tribute|piano|karaoke|instrumental)\b/i.test(q);
  const isExplicitLive = /\b(live|concert|tour)\b/i.test(q);
  const isMovieSearch = /\bmovie\b/i.test(rawQuery);
  const movieTarget = cleanStr((rawQuery || "").replace(/\bmovie\b/gi, "").trim());

  // 1. Deduplicate identical tracks (retaining the version with audioUrl and highest play count)
  // Note: Legitimate remixes and alternate versions are preserved as distinct entries
  const dedupMap = new Map();
  for (const s of songs) {
    if (!s || !s.title) continue;
    const titleKey = cleanStr(normalizeSongTitle(s.title) || s.title);
    const artistKey = cleanStr(s.artist);
    const isSpecialVariant = /\b(remix|mix|acoustic|unplugged|live|cover|karaoke|instrumental|version|edit)\b/i.test(s.title);
    const variantTag = isSpecialVariant ? `:::${cleanStr(s.title)}` : "";
    const key = `${titleKey}:::${artistKey}${variantTag}`;

    const trackPlays = parsePlayCount(s.playCount ?? s.play_count ?? s.plays ?? s.ctr ?? 0);
    const existing = dedupMap.get(key);

    if (!existing) {
      dedupMap.set(key, { ...s, playCount: trackPlays });
    } else {
      const existingPlays = existing.playCount || 0;
      const higherPlays = Math.max(trackPlays, existingPlays);
      const winner = (trackPlays >= existingPlays) ? s : existing;
      dedupMap.set(key, {
        ...winner,
        audioUrl: winner.audioUrl || existing.audioUrl || s.audioUrl,
        playCount: higherPlays,
        ctr: higherPlays,
        ctrFormatted: formatPlayCount(higherPlays),
        isMovieTrack: Boolean(s.isMovieTrack || existing.isMovieTrack),
        movieName: s.movieName || existing.movieName || winner.movieName,
      });
    }
  }

  const deduped = Array.from(dedupMap.values());

  // 2. Multi-factor intelligent relevance scoring
  const scored = deduped.map((s) => {
    let score = 0;
    const title = (s.title || "").toLowerCase();
    const titleNorm = normalizeSongTitle(title);
    const titleClean = cleanStr(title);
    const artist = (s.artist || "").toLowerCase();
    const artistClean = cleanStr(artist);
    const albumClean = cleanStr(s.album);
    const movieClean = cleanStr(s.movieName);

    // Movie search priority: If user searched "<movie> movie" or "movie <movie>", give top boost to that movie's songs
    if (isMovieSearch && movieTarget) {
      if (
        s.isMovieTrack ||
        (albumClean && (albumClean.includes(movieTarget) || movieTarget.includes(albumClean))) ||
        (movieClean && movieClean.includes(movieTarget)) ||
        (titleClean && (titleClean.includes(movieTarget) || movieTarget.includes(titleClean)))
      ) {
        score += 2000;
      }
    }

    // Exact title match: highest priority
    if (titleClean === qClean || titleNorm === qNorm) {
      score += 1200;
    } else if (titleClean.startsWith(qClean) || titleNorm.startsWith(qNorm)) {
      score += 650;
    } else if (titleClean.includes(qClean) || titleNorm.includes(qNorm)) {
      score += 350;
    }

    // Artist spam penalty: if artist name is identical to the song title or search query
    if (artistClean && (artistClean === titleClean || artistClean === qClean)) {
      score -= 800;
    }

    // Official artist boost from topquery hint or prominent artist match
    if (hintClean && (artistClean.includes(hintClean) || hintClean.includes(artistClean))) {
      score += 450;
    }

    // Query contains artist name (e.g. "Shape of You Ed Sheeran")
    const queryTokens = q.split(/\s+/).filter((t) => t.length > 2 && !titleClean.includes(cleanStr(t)));
    let artistMatchTokens = 0;
    for (const token of queryTokens) {
      if (artistClean.includes(cleanStr(token))) artistMatchTokens++;
    }
    if (artistMatchTokens > 0) {
      score += artistMatchTokens * 350;
    }

    // Token overlap in title for query relevance
    const allQueryTokens = q.split(/\s+/).filter((t) => t.length > 2);
    for (const token of allQueryTokens) {
      if (title.includes(token)) score += 60;
    }

    // Penalize non-official, karaoke, covers, tributes, workout, unless user explicitly searched for them
    const isKaraoke = /\b(karaoke|backing track|minus one)\b/i.test(title);
    const isCover = /\b(cover|tribute to|originally performed|tribute)\b/i.test(title) || /\b(tribute|karaoke|cover)\b/i.test(artist);
    const isPiano = /\b(piano version|piano cover|guitar cover|instrumental)\b/i.test(title);
    const isWorkout = /\b(workout|fitness|cardio)\b/i.test(title) || /\b(workout|fitness)\b/i.test(artist);
    const isRemix = /\b(remix|dj|mix|mashup|slowed|reverb)\b/i.test(title);
    const isAcoustic = /\b(acoustic)\b/i.test(title);
    const isLive = /\b(live|tour collection)\b/i.test(title) || /\b(live)\b/i.test(s.album || "");

    if (isKaraoke && !isExplicitCover) score -= 850;
    if (isCover && !isExplicitCover) score -= 650;
    if (isPiano && !isExplicitCover) score -= 550;
    if (isWorkout && !isExplicitCover) score -= 650;
    if (isRemix && !isExplicitRemix) score -= 250;
    if (isAcoustic && !isExplicitAcoustic) score -= 200;
    if (isLive && !isExplicitLive) score -= 150;

    // Prefer original non-remix track when user searches standard song title
    if (!isRemix && !isAcoustic && !isLive && !isCover && !isKaraoke && !isPiano && !isWorkout) {
      score += 300;
    }

    // Audio URL available bonus
    if (s.audioUrl) {
      score += 60;
    }

    // Natural popularity boost from real API play counts
    const plays = parsePlayCount(s.playCount ?? s.play_count ?? s.plays ?? s.ctr ?? 0);
    if (plays > 0) {
      score += Math.min(Math.log10(plays) * 25, 200);
    }

    return { ...s, relevanceScore: score, playCount: plays };
  });

  return scored.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    if ((b.playCount || 0) !== (a.playCount || 0)) {
      return (b.playCount || 0) - (a.playCount || 0);
    }
    const yearA = parseInt(a.year || "0", 10) || 0;
    const yearB = parseInt(b.year || "0", 10) || 0;
    return yearB - yearA;
  });
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
  const page = parseInt(searchParams.get("page") || searchParams.get("p") || "1", 10) || 1;

  // -------------------------------------------------------------
  // Mode 1: Federated Predictive Autocomplete Search & Catalog Search
  // -------------------------------------------------------------
  if (query) {
    const normalizedQuery = query.toLowerCase();
    const cacheKey = `ac:::${normalizedQuery}:::p${page}`;
    if (searchCache.has(cacheKey)) {
      return NextResponse.json(searchCache.get(cacheKey));
    }

    try {
      const isMovieQuery = /\bmovie\b/i.test(query);
      const movieCleanQuery = query.replace(/\bmovie\b/gi, "").trim();

      const autocompleteUrl = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&query=${encodeURIComponent(query)}`;
      const searchResultsUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&q=${encodeURIComponent(query)}&p=${page}&n=40`;
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

      // If movie search, merge movieCleanQuery search data
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

      // If movie query, fetch the full album details of the matching movie album
      let movieFullSongs = [];
      let primaryMovieAlbum = null;
      if (isMovieQuery && movieCleanQuery) {
        const candidateMovieAlbums = [
          ...(movieAlbumResults || []),
          ...(data.albums?.data || []),
        ];
        const matched = candidateMovieAlbums.find((alb) => {
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

      // If external calls produced nothing, trigger graceful fallback
      if (!data.songs?.data?.length && !searchDataResults.length && !data.artists?.data?.length && !data.albums?.data?.length && !movieFullSongs.length) {
        throw new Error("JioSaavn external search endpoints returned no results");
      }

      const formatImage = (img) => (img || "").replace(/50x50|150x150/, "500x500");

      // Build media map from searchDataResults so autocomplete songs immediately get directAudioUrl
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

      // 1. Process Raw Songs from genre, autocomplete, and search results
      const rawCandidateSongs = [];
      const seenRawIds = new Set();

      // Prioritize curated perfect songs if query matches a known genre
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

      // Insert movie full songs if movie query
      if (Array.isArray(movieFullSongs) && movieFullSongs.length > 0) {
        for (const [idx, s] of movieFullSongs.entries()) {
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
            id: s.id,
            title: cleanTitle,
            artist: primaryArtists,
            album: albumTitle,
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
          });
        }
      }

      for (const s of (data.songs?.data || [])) {
        if (!s.id || seenRawIds.has(s.id)) continue;
        seenRawIds.add(s.id);
        const cleanTitle = cleanHtmlText(s.title || s.song);
        const primaryArtists = cleanHtmlText(s.more_info?.primary_artists || s.singers || "");
        const albumTitle = cleanHtmlText(s.album || s.more_info?.album || "");
        const artist = primaryArtists || cleanHtmlText(s.description?.split("·")[1]?.trim() || "Various Artists");
        const rawYear = s.more_info?.year || s.year || (s.description?.match(/\b(19\d\d|20\d\d)\b/)?.[1]) || null;
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
          ctr: playCount,
          ctrFormatted: formatPlayCount(playCount) || (playCount > 0 ? `${playCount}` : null),
          playCount: playCount,
          playCountFormatted: formatPlayCount(playCount),
          bitrate: "320kbps",
          type: "song",
          audioUrl: directAudioUrl,
        });
      }

      for (const s of searchDataResults) {
        const cleanTitle = cleanHtmlText(s.song || s.title);
        const artist = cleanHtmlText(s.primary_artists || s.singers || s.music || "Various Artists");
        const albumTitle = cleanHtmlText(s.album || "");
        const rawYear = s.year || s.more_info?.year || (s.release_date ? s.release_date.split("-")[0] : null);
        const durationSec = parseInt(s.duration || s.more_info?.duration || "210", 10);
        const directAudioUrl = searchMediaMap.get(String(s.id)) || null;
        const rawPlays = s.play_count || s.more_info?.play_count || 0;
        const playCount = parsePlayCount(rawPlays);

        if (seenRawIds.has(s.id)) {
          // If song was added from autocomplete with null audioUrl, enrich it now!
          const existing = rawCandidateSongs.find((item) => item.id === s.id);
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
          }
          continue;
        }

        seenRawIds.add(s.id);
        rawCandidateSongs.push({
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
          ctr: playCount,
          ctrFormatted: formatPlayCount(playCount),
          playCount: playCount,
          playCountFormatted: formatPlayCount(playCount),
          bitrate: "320kbps",
          type: "song",
          audioUrl: directAudioUrl,
        });
      }

      // Extract top artist hint from predictive metadata for relevance boost
      const rawTopArtist =
        data.topquery?.data?.[0]?.more_info?.primary_artists ||
        data.topquery?.data?.[0]?.music ||
        (data.topquery?.data?.[0]?.description || "").replace(/^Song by\s*/i, "").split("·")[0].trim() ||
        data.songs?.data?.[0]?.more_info?.primary_artists ||
        data.artists?.data?.[0]?.title ||
        "";

      // Apply intelligent multi-factor ranking & deduplication
      const songs = rankAndDeduplicateSongs(rawCandidateSongs, query, rawTopArtist);

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

      if (primaryMovieAlbum && primaryMovieAlbum.id) {
        seenAlbumIds.add(String(primaryMovieAlbum.id));
        albums.push({
          id: String(primaryMovieAlbum.id),
          title: primaryMovieAlbum.title,
          artist: primaryMovieAlbum.artist,
          music: primaryMovieAlbum.artist,
          year: primaryMovieAlbum.year ? String(primaryMovieAlbum.year) : null,
          image: formatImage(primaryMovieAlbum.image),
          thumbnail: formatImage(primaryMovieAlbum.image),
          coverUrl: formatImage(primaryMovieAlbum.image),
          isMovie: true,
          ctr: 1000000,
          type: "album",
        });
      }

      for (const alb of (data.albums?.data || [])) {
        const id = String(alb.id || alb.albumid || "");
        if (!id || seenAlbumIds.has(id)) continue;
        seenAlbumIds.add(id);
        const title = cleanHtmlText(alb.title);
        const artist = cleanHtmlText(alb.music || alb.more_info?.primary_artists || alb.description?.split("·")?.pop()?.trim() || "Soundtrack");
        const rawYear = alb.more_info?.year || (alb.description?.match(/\b(19\d\d|20\d\d)\b/)?.[1]) || null;
        const isMovie = alb.more_info?.is_movie === "1" || (alb.description || "").toLowerCase().includes("film") || (isMovieQuery && cleanStr(title).includes(cleanStr(movieCleanQuery)));
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

      // 5. Intelligent Top Match Resolution
      let topMatch = null;
      const rawTop = data.topquery?.data?.[0];
      const topSong = songs[0] || null;

      const cleanQ = cleanStr(query);
      const normQ = normalizeSongTitle(query);

      // Check if topSong is an exact or strong title match
      const topSongClean = topSong ? cleanStr(topSong.title) : "";
      const topSongNorm = topSong ? normalizeSongTitle(topSong.title) : "";
      const isTopSongExactMatch = topSong && (topSongClean === cleanQ || topSongNorm === normQ);
      const isTopSongStrongMatch = topSong && (isTopSongExactMatch || topSongClean.startsWith(cleanQ) || topSong.relevanceScore >= 900);

      // Check if query is an artist search (e.g. user typed "Ed Sheeran", "Alan Walker", "Arijit Singh")
      // Crucial: Only consider artist if the query EXACTLY matches artist name AND it is not just a spam artist named after the song
      const matchedArtist = artists.find((a) => {
        const aClean = cleanStr(a.name);
        return aClean === cleanQ;
      });

      const isArtistSearch = Boolean(
        matchedArtist &&
        (!isTopSongExactMatch || (rawTop?.type === "artist" && rawTop?.id === matchedArtist.id))
      );

      // Check whether rawTop is an acoustic / remix / cover while the user searched standard query
      const isExplicitRemixOrCover = /\b(remix|mix|acoustic|cover|instrumental|karaoke|slowed|live)\b/i.test(query);
      const isRawTopDegraded = rawTop && !isExplicitRemixOrCover && (
        /\b(remix|acoustic|cover|instrumental|karaoke|slowed|rendition)\b/i.test(rawTop.title || "") ||
        rawTop.type === "album"
      );

      if (isMovieQuery && primaryMovieAlbum) {
        topMatch = {
          id: primaryMovieAlbum.id,
          name: primaryMovieAlbum.title,
          title: primaryMovieAlbum.title,
          type: "album",
          image: formatImage(primaryMovieAlbum.image),
          thumbnail: formatImage(primaryMovieAlbum.image),
          coverUrl: formatImage(primaryMovieAlbum.image),
          subtitle: `${primaryMovieAlbum.artist}${primaryMovieAlbum.year ? ` • ${primaryMovieAlbum.year}` : ""}`,
          artist: primaryMovieAlbum.artist,
          year: primaryMovieAlbum.year,
          isMovie: true,
        };
      } else if (isArtistSearch && matchedArtist) {
        topMatch = {
          id: matchedArtist.id,
          name: cleanHtmlText(matchedArtist.name || matchedArtist.title),
          title: cleanHtmlText(matchedArtist.name || matchedArtist.title),
          type: "artist",
          image: formatImage(matchedArtist.image || matchedArtist.avatar),
          thumbnail: formatImage(matchedArtist.image || matchedArtist.avatar),
          coverUrl: formatImage(matchedArtist.image || matchedArtist.avatar),
          avatar: formatImage(matchedArtist.image || matchedArtist.avatar),
          subtitle: "Artist",
          role: "Artist",
        };
      } else if (topSong && (isTopSongStrongMatch || !rawTop || isRawTopDegraded)) {
        // High confidence song match takes priority
        topMatch = {
          ...topSong,
          subtitle: `${topSong.artist} • ${topSong.album || "Single"}`,
          type: "song",
        };
      } else if (rawTop && !isRawTopDegraded) {
        const topType = (rawTop.type || "song").toLowerCase();
        let subtitle = "";
        if (topType === "artist") {
          subtitle = "Artist";
        } else if (topType === "album") {
          const albArtist = cleanHtmlText(rawTop.music || rawTop.more_info?.primary_artists || rawTop.description || "");
          const albYear = rawTop.more_info?.year || "";
          subtitle = albArtist ? (albYear ? `${albArtist} • ${albYear}` : albArtist) : "Album";
        } else {
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
          playCount: parseInt(rawTop.ctr || "0", 10) || 0,
          playCountFormatted: formatPlayCount(parseInt(rawTop.ctr || "0", 10)),
          audioUrl: topSong && topSong.id === rawTop.id ? topSong.audioUrl : null,
        };
      } else if (topSong) {
        topMatch = {
          ...topSong,
          subtitle: `${topSong.artist} • ${topSong.album || "Single"}`,
          type: "song",
        };
      }

      const responsePayload = {
        success: true,
        query,
        page,
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
        page,
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
        headers: JIOSAAVN_HEADERS,
        next: { revalidate: 3600 },
      });

      if (res.ok) {
        const detailsData = await res.json();
        const song = detailsData[trackId] || Object.values(detailsData).find((v) => v && typeof v === "object" && (v.id || v.song || v.more_info || v.encrypted_media_url));
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
      headers: JIOSAAVN_HEADERS,
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
