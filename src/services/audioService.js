/**
 * Audio Service for Ceepeefy
 * Resolves song title and artist to a direct, raw audio streaming URL via open-source music search.
 */

// Cache resolved audio streams in client memory to avoid repeated network calls
const clientAudioCache = new Map();
const clientAlbumCache = new Map();
const clientAutocompleteCache = new Map();

/**
 * Federated predictive search querying JioSaavn autocomplete.get endpoint.
 * Returns segregated { topMatch, songs, artists, albums, playlists }.
 *
 * @param {string} query
 * @returns {Promise<{ topMatch: any, songs: Array<any>, artists: Array<any>, albums: Array<any>, playlists: Array<any> }>}
 */
export async function searchMusicAutocomplete(query) {
  const cleanQ = (query || "").trim().toLowerCase();
  if (!cleanQ) {
    return { topMatch: null, songs: [], artists: [], albums: [], playlists: [] };
  }

  if (clientAutocompleteCache.has(cleanQ)) {
    return clientAutocompleteCache.get(cleanQ);
  }

  try {
    const res = await fetch(`/api/audio/search?q=${encodeURIComponent(cleanQ)}`);
    if (!res.ok) {
      throw new Error(`Autocomplete search failed with status ${res.status}`);
    }

    const data = await res.json();
    const result = {
      topMatch: data.topMatch || null,
      songs: Array.isArray(data.songs) ? data.songs : (Array.isArray(data.tracks) ? data.tracks : []),
      artists: Array.isArray(data.artists) ? data.artists : [],
      albums: Array.isArray(data.albums) ? data.albums : [],
      playlists: Array.isArray(data.playlists) ? data.playlists : [],
    };

    clientAutocompleteCache.set(cleanQ, result);
    return result;
  } catch (err) {
    console.error("searchMusicAutocomplete client error:", err);
    return { topMatch: null, songs: [], artists: [], albums: [], playlists: [] };
  }
}

/**
 * Retrieves the raw direct audio streaming URL for a given song title and artist.
 *
 * @param {string} title - The track title (e.g. "Blinding Lights")
 * @param {string} artist - The track artist (e.g. "The Weeknd")
 * @param {string} [trackId] - Optional track identifier for curated fallbacks
 * @returns {Promise<{ audioUrl: string, title?: string, artist?: string, bitrate?: string, duration?: number }>}
 */
export async function getDirectAudioStreamUrl(title, artist, trackId = "") {
  const cacheKey = trackId ? `track-id:::${trackId}` : `${(title || "").toLowerCase()}---${(artist || "").toLowerCase()}`;
  if (clientAudioCache.has(cacheKey)) {
    return clientAudioCache.get(cacheKey);
  }

  const queryParams = new URLSearchParams();
  if (title) queryParams.set("title", title);
  if (artist) queryParams.set("artist", artist);
  if (trackId) queryParams.set("trackId", trackId);

  try {
    const res = await fetch(`/api/audio/search?${queryParams.toString()}`);
    if (!res.ok) {
      throw new Error(`Audio search failed with status ${res.status}`);
    }

    const data = await res.json();
    if (data && data.audioUrl) {
      clientAudioCache.set(cacheKey, data);
      return data;
    }

    throw new Error("No audioUrl returned from search service");
  } catch (err) {
    console.warn("getDirectAudioStreamUrl failed, using ambient fallback stream:", err);
    // Reliable fallback stream
    const fallbackResult = {
      audioUrl: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3",
      title: title || "Ambient Track",
      artist: artist || "Nocturne Audio",
      bitrate: "192kbps",
      duration: 210,
    };
    clientAudioCache.set(cacheKey, fallbackResult);
    return fallbackResult;
  }
}

/**
 * Searches the live music catalog for tracks and matched movie/film albums.
 *
 * @param {string} query
 * @param {object} [options]
 * @returns {Promise<{ tracks: Array<any>, songs: Array<any>, albums: Array<any>, artists: Array<any>, movieAlbum: any | null }>}
 */
/**
 * Normalizes a song title to detect duplicates
 */
export function normalizeSongTitle(title) {
  if (!title) return "";
  return title
    .replace(/&quot;/g, "")
    .replace(/&#039;/g, "")
    .replace(/&#39;/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s*[\(\[](?:from|feat\.?|ft\.?|with|original|soundtrack|telugu|tamil|hindi|kannada|malayalam|version|remix|lyrical|video|audio|extended|slowed|reverb|ost|bgm)[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*-\s*(?:from|telugu|tamil|hindi|kannada|malayalam|remix|lyrical|version|soundtrack)[^\-]*/gi, "")
    .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Parses raw play count into standard numeric integer.
 * Handles string numbers ('34221170'), abbreviated metrics ('213.7M', '1.4M', '104K', '2.1B'), and raw numbers.
 */
export function parsePlayCount(raw) {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number") {
    return isNaN(raw) ? 0 : Math.round(raw);
  }
  const str = String(raw).trim().toUpperCase();
  if (!str) return 0;

  // Abbreviated numbers e.g. '213.7M', '1.4M', '104K', '2.5B', '213,700,000'
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

function cleanStr(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function formatPlayCount(count) {
  if (!count || isNaN(count) || count <= 0) return null;
  if (count >= 1000000000) return `${(count / 1000000000).toFixed(1)}B`;
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return `${count}`;
}

export function isSpamOrRip(trackOrTitle, query) {
  const title = typeof trackOrTitle === "string" ? trackOrTitle : (trackOrTitle?.title || "");
  if (!title) return true;
  const qLower = (query || "").toLowerCase();
  const tLower = title.toLowerCase();

  // If user explicitly searched for karaoke, do not filter out; otherwise hard filter karaoke
  const isExplicitKaraokeSearch = qLower.includes("karaoke");
  if (!isExplicitKaraokeSearch) {
    const spamKaraokePattern = /\b(karaoke|backing\s+track|minus\s+one|tribute\s+version)\b/i;
    if (spamKaraokePattern.test(tLower)) return true;
  }

  // Filter instrumental covers unless explicitly requested
  const isExplicitInstrumentalSearch = qLower.includes("instrumental");
  if (!isExplicitInstrumentalSearch) {
    const coverPattern = /\b(instrumental\s+cover|piano\s+cover|guitar\s+cover|violin\s+cover|flute\s+cover)\b/i;
    if (coverPattern.test(tLower)) return true;
  }

  // Filter spam, ringtones, and low-quality rips
  const isExplicitRingtoneOrRemix = qLower.includes("ringtone") || qLower.includes("remix") || qLower.includes("slowed");
  if (!isExplicitRingtoneOrRemix) {
    const ripPattern = /\b(ringtone|caller\s+tune|dialogue\s+promo|teaser\s+audio|slowed|reverb|nightcore|8d\s+audio|bass\s+boosted|sped\s+up|chipmunk|whatsapp\s+status|tik\s*tok|rip|radio\s+rip|cam\s+rip|screen\s+rip|low\s+quality|preview\s+rip)\b/i;
    if (ripPattern.test(tLower)) return true;
  }

  // Bitrate check if track object provided
  if (typeof trackOrTitle === "object" && trackOrTitle !== null) {
    const bitrate = getTrackBitrate(trackOrTitle);
    if (bitrate > 0 && bitrate < 64) return true;
  }

  return false;
}

/**
 * Extracts bitrate integer for deduplication quality comparison
 */
export function getTrackBitrate(track) {
  if (!track) return 128;
  if (track.badge === "320kbps" || track["320kbps"] === "true" || track["320kbps"] === true) return 320;
  if (track.badge === "Lossless") return 320;
  if (typeof track.bitrate === "number") return track.bitrate;
  if (typeof track.bitrate === "string") {
    const num = parseInt(track.bitrate.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(num)) return num;
  }
  return 128;
}

/**
 * Deduplication: Remove duplicate track entries with identical titles and artists,
 * retaining only the version with the highest play count.
 */
export function deduplicateTracks(songs) {
  if (!Array.isArray(songs)) return [];
  const clean = (str) => (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const dedupMap = new Map();

  for (const track of songs) {
    if (!track || !track.title) continue;
    const cleanTitle = clean(normalizeSongTitle(track.title) || track.title);
    const rawArtist = track.artist || track.singers || track.primary_artists || "";
    // Tokenize, clean, and sort artist names alphabetically to handle permuted credits
    const sortedArtistTokens = rawArtist
      .toLowerCase()
      .split(/[,&/]|feat\.?|ft\.?/i)
      .map((a) => clean(a))
      .filter(Boolean)
      .sort()
      .join("_");

    const key = `${cleanTitle}:::${sortedArtistTokens || clean(rawArtist)}`;

    const trackPlays = parsePlayCount(track.playCount ?? track.play_count ?? track.plays ?? 0);
    const trackBitrate = getTrackBitrate(track);

    const existing = dedupMap.get(key);
    if (!existing) {
      dedupMap.set(key, { ...track, playCount: trackPlays });
    } else {
      const existingPlays = parsePlayCount(existing.playCount ?? existing.play_count ?? existing.plays ?? 0);
      const existingBitrate = getTrackBitrate(existing);

      const isMovie = Boolean(track.isMovieTrack || existing.isMovieTrack);
      const movieName = track.movieName || existing.movieName;
      const higherPlays = Math.max(trackPlays, existingPlays);
      const higherBitrate = Math.max(trackBitrate, existingBitrate);

      // Select track base, ensuring play counts and movie track flags are retained
      const winner = (trackPlays >= existingPlays) ? track : existing;

      dedupMap.set(key, {
        ...winner,
        playCount: higherPlays,
        playCountFormatted: formatPlayCount(higherPlays),
        bitrate: higherBitrate,
        isMovieTrack: isMovie,
        movieName: movieName || winner.movieName,
      });
    }
  }

  return Array.from(dedupMap.values());
}

/**
 * Assigns one of 4 strict priority tiers to a cleaned track candidate:
 * Tier 1: Exact song title match. (Crucial: If the left Highlight Card displays a Movie Album,
 *         automatically assign all tracks from that specific movie to Tier 1).
 * Tier 2: Song title starts with the exact search query.
 * Tier 3: Song title contains the search query.
 * Tier 4: Search query matches the primary artist or movie/album name.
 */
export function assignTrackTier(track, cleanQuery, activeEntity, specificMovieTitles) {
  if (!track) return 5;
  const rawTitle = track.title || "";
  const titleClean = cleanStr(rawTitle);
  const normTitleClean = cleanStr(normalizeSongTitle(rawTitle));
  const artistClean = cleanStr(track.artist || track.singers || track.primary_artists || "");
  const albumClean = cleanStr(track.album || "");

  // Check if active highlight card is a Movie Album
  const isMovieHighlight =
    activeEntity?.type === "movie" ||
    activeEntity?.isMovie ||
    Boolean(activeEntity?.data?.isMovie);

  const highlightMovieTitle = isMovieHighlight
    ? cleanStr(activeEntity?.data?.title || activeEntity?.title || "")
    : "";

  // Verify track is from THAT SPECIFIC MOVIE:
  const isTrackFromSpecificMovie = Boolean(
    isMovieHighlight && (
      track.isMovieTrack === true ||
      (specificMovieTitles && (specificMovieTitles.has(normTitleClean) || specificMovieTitles.has(titleClean))) ||
      (highlightMovieTitle && titleClean.includes(`from${highlightMovieTitle}`) && track.isMovieTrack)
    )
  );

  // Tier 1: Exact song title match OR track from that specific movie
  const isExactTitle = Boolean(cleanQuery && (titleClean === cleanQuery || normTitleClean === cleanQuery));
  if (isExactTitle || isTrackFromSpecificMovie) {
    return 1;
  }

  // Tier 2: Song title starts with the exact search query
  if (cleanQuery && (titleClean.startsWith(cleanQuery) || normTitleClean.startsWith(cleanQuery))) {
    return 2;
  }

  // Tier 3: Song title contains the search query
  if (cleanQuery && (titleClean.includes(cleanQuery) || normTitleClean.includes(cleanQuery))) {
    return 3;
  }

  // Tier 4: Search query matches the primary artist or movie/album name
  if (cleanQuery && (
    artistClean.includes(cleanQuery) ||
    albumClean.includes(cleanQuery) ||
    (track.movieName && cleanStr(track.movieName).includes(cleanQuery))
  )) {
    return 4;
  }

  return 5;
}

/**
 * Spotify-style Two-Stage Tiered Scoring and Secondary Sorting:
 * 1. Immediate Clean-up: Filter out spam uploads, 'karaoke' tracks, 'instrumental covers', and low-bitrate rips.
 * 2. Deduplication: Retain only highest play count version for identical title & artist.
 * 3. Tiered Ranking: 4 strict priority tiers (Tier 1 exact / movie album tracks, Tier 2 startsWith, Tier 3 contains, Tier 4 artist/album match).
 * 4. Secondary Sorting: Primary by Tier (Tier 1 at top). Within identical Tier, sort mathematically by Play Count (highest first),
 *    using Recency (newest release year first) as a tie-breaker.
 */
export function rankSearchResults(songs, rawQuery, activeEntity) {
  if (!Array.isArray(songs) || songs.length === 0) return [];
  const cleanQ = cleanStr(rawQuery);

  // 1. Clean-up: immediately filter out spam uploads, karaoke tracks, instrumental covers, low-bitrate rips
  const cleaned = songs.filter((track) => !isSpamOrRip(track, rawQuery));

  // Build lookup of specific movie tracks from active highlight entity
  const specificMovieTitles = new Set();
  const movieTracks = activeEntity?.data?.tracks || (activeEntity?.type === "movie" ? activeEntity?.tracks : null) || [];
  if (Array.isArray(movieTracks)) {
    for (const mt of movieTracks) {
      if (mt && mt.title) {
        specificMovieTitles.add(cleanStr(mt.title));
        specificMovieTitles.add(cleanStr(normalizeSongTitle(mt.title)));
      }
    }
  }

  // 2. Deduplication: Remove duplicate track entries with identical titles and artists,
  // retaining only the version with the highest play count
  const deduped = deduplicateTracks(cleaned);

  // 3. Assign Tier and parse raw integer play counts for mathematical sorting
  const scored = deduped.map((track) => {
    const tier = assignTrackTier(track, cleanQ, activeEntity, specificMovieTitles);
    const rawPlays = track.playCount ?? track.play_count ?? track.plays ?? 0;
    const plays = parsePlayCount(rawPlays);
    const rawYear = track.year || (track.releaseDate ? track.releaseDate.slice(0, 4) : 0);
    const year = parseInt(rawYear, 10) || 0;

    return {
      ...track,
      tier,
      playCount: plays,
      playCountFormatted: formatPlayCount(plays),
      year: year > 0 ? year : track.year || null,
    };
  });

  // 4. Secondary Sorting:
  // Sort tracks primarily by their Tier (Tier 1 at the top).
  // Within each identical Tier, sort tracks mathematically by Play Count (highest first),
  // using Recency (newest year first) as a tie-breaker.
  scored.sort((a, b) => {
    // Primary: Tier (ascending: Tier 1 at the top)
    if (a.tier !== b.tier) {
      return a.tier - b.tier;
    }

    // Secondary: Mathematical Play Count (highest first)
    if (b.playCount !== a.playCount) {
      return b.playCount - a.playCount;
    }

    // Tie-breaker: Recency (newest year first)
    const yearA = typeof a.year === "number" ? a.year : 0;
    const yearB = typeof b.year === "number" ? b.year : 0;
    if (yearB !== yearA) {
      return yearB - yearA;
    }

    return 0;
  });

  return scored;
}

export async function searchMusicCatalog(query, options = {}) {
  if (!query || !query.trim()) return { tracks: [], songs: [], albums: [], artists: [], movieAlbum: null };
  const sort = options.sort || "popular";

  try {
    const res = await fetch(`/api/audio/search?query=${encodeURIComponent(query.trim())}&sort=${encodeURIComponent(sort)}`);
    if (!res.ok) {
      throw new Error(`Music search failed with status ${res.status}`);
    }

    const data = await res.json();
    if (Array.isArray(data)) {
      return { tracks: data, songs: data, albums: [], artists: [], movieAlbum: null };
    }
    const songList = data.songs || data.tracks || data.results || [];
    return {
      tracks: songList,
      songs: songList,
      albums: data.albums || [],
      artists: data.artists || [],
      topResult: data.topResult || null,
      movieAlbum: data.movieAlbum || null,
      primaryEntity: data.primaryEntity || null,
    };
  } catch (err) {
    console.warn("searchMusicCatalog failed:", err);
    return { tracks: [], songs: [], albums: [], artists: [], movieAlbum: null, primaryEntity: null };
  }
}

export async function searchMusicTracks(query, options = {}) {
  const result = await searchMusicCatalog(query, options);
  return result.tracks || result.songs || [];
}

/**
 * Fetches official album details by album ID, returning structured metadata and exact official tracklist order.
 *
 * @param {string} albumId
 * @returns {Promise<{ id: string, title: string, artist: string, image: string, year: string, language: string, trackCount: number, duration: string, tracks: Array<any> } | null>}
 */
export async function fetchAlbumDetails(albumId) {
  if (!albumId) return null;
  const cleanId = `${albumId}`.trim();
  if (clientAlbumCache.has(cleanId)) {
    return clientAlbumCache.get(cleanId);
  }

  try {
    const res = await fetch(`/api/album/${encodeURIComponent(cleanId)}`);
    if (!res.ok) {
      throw new Error(`Album details fetch failed with status ${res.status}`);
    }

    const albumData = await res.json();
    if (albumData && (albumData.title || albumData.name)) {
      clientAlbumCache.set(cleanId, albumData);
      return albumData;
    }
    return null;
  } catch (err) {
    console.warn("fetchAlbumDetails error:", err);
    return null;
  }
}

// Client-side cache for artist profile images
const clientArtistImageCache = new Map();

/**
 * Public API Fallback: Hits the free iTunes Search API to dynamically grab a profile
 * image URL based on the artist's name.
 *
 * @param {string} artistName
 * @returns {Promise<string | null>}
 */
export async function fetchItunesArtistImage(artistName) {
  if (!artistName || !artistName.trim()) return null;
  const cleanName = artistName.trim();
  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanName)}&entity=musicArtist&limit=1`;
    const res = await fetch(itunesUrl);
    if (!res.ok) return null;
    const data = await res.json();
    const artistObj = data?.results?.[0];
    const rawArtwork = artistObj?.artworkUrl100 || artistObj?.artworkUrl60;
    if (rawArtwork) {
      return rawArtwork.replace("100x100bb", "600x600bb");
    }
  } catch (err) {
    console.warn("iTunes artist fallback error:", err.message);
  }
  return null;
}

/**
 * Fetches the highest-resolution profile picture for an artist.
 * 1. Checks memory cache
 * 2. Queries JioSaavn via /api/artist/image (500x500 extraction)
 * 3. Falls back to iTunes Search API if needed
 *
 * @param {string} artistName
 * @returns {Promise<string | null>}
 */
export async function fetchArtistImage(artistName) {
  if (!artistName || !artistName.trim()) return null;
  const cacheKey = artistName.trim().toLowerCase();
  if (clientArtistImageCache.has(cacheKey)) {
    return clientArtistImageCache.get(cacheKey);
  }

  // 1. Primary: /api/artist/image (JioSaavn 500x500)
  try {
    const res = await fetch(`/api/artist/image?name=${encodeURIComponent(artistName.trim())}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.image) {
        clientArtistImageCache.set(cacheKey, data.image);
        return data.image;
      }
    }
  } catch (err) {
    console.warn("Internal artist image API error, trying public fallback:", err);
  }

  // 2. Fallback: Public iTunes Search API
  const itunesImage = await fetchItunesArtistImage(artistName);
  if (itunesImage) {
    clientArtistImageCache.set(cacheKey, itunesImage);
    return itunesImage;
  }

  return null;
}

/**
 * Searches for an artist by name.
 * Resolves artist profile with high-resolution image if matched.
 *
 * @param {string} artistName
 * @returns {Promise<{ id: string, name: string, image: string, source: string } | null>}
 */
export async function searchArtist(artistName) {
  if (!artistName || !artistName.trim()) return null;
  const cleanName = artistName.trim();

  try {
    const res = await fetch(`/api/artist/image?name=${encodeURIComponent(cleanName)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.image) {
        return {
          id: `artist-${(data.name || cleanName).toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
          name: data.name || cleanName,
          image: data.image,
          source: data.source || "jiosaavn",
        };
      }
    }
  } catch (err) {
    console.warn("searchArtist failed:", err);
  }
  return null;
}

/**
 * Searches for all artists matching a query.
 * Returns array of artist profiles with high-resolution images.
 *
 * @param {string} query
 * @returns {Promise<Array<{ id: string, name: string, image: string, source: string }>>}
 */
export async function searchArtists(query) {
  if (!query || !query.trim()) return [];
  const cleanName = query.trim();

  try {
    const res = await fetch(`/api/artist/image?name=${encodeURIComponent(cleanName)}&all=true`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.results)) {
        return data.results;
      }
    }
  } catch (err) {
    console.warn("searchArtists failed:", err);
  }
  return [];
}

export default {
  getDirectAudioStreamUrl,
  searchMusicCatalog,
  searchMusicTracks,
  fetchAlbumDetails,
  fetchArtistImage,
  fetchItunesArtistImage,
  searchArtist,
  searchArtists,
  rankSearchResults,
  deduplicateTracks,
  parsePlayCount,
};
