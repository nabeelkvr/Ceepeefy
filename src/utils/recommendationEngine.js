/**
 * Spotify-Inspired 6-Tier Intelligent Recommendation Engine
 *
 * Implements deterministic priority hierarchy based on candidate song metadata
 * relative to the currently playing reference (seed) song.
 *
 * Exact Priority Hierarchy:
 * Priority 1: Same Movie/Album + Same Artist + Same Song Type (matches all 3)
 * Priority 2: Same Artist + Same Song Type (matches both)
 * Priority 3: Same Movie/Album + Same Song Type (matches both)
 * Priority 4: Same Artist (matches artist only)
 * Priority 5: Same Song Type (matches genre, mood, or musical style only)
 * Priority 6: Same Movie/Album (matches movie or album only)
 * Excluded: Does not match any of the six tiers.
 */

/**
 * Normalizes text for clean string comparisons
 */
export function cleanStr(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Removes noisy qualifiers from movie / album titles
 */
export function normalizeMovieAlbum(rawAlbum) {
  if (!rawAlbum || typeof rawAlbum !== "string") return "";
  let clean = rawAlbum
    .replace(/&quot;/g, "")
    .replace(/&#039;/g, "")
    .replace(/&#39;/g, "")
    .replace(/&amp;/g, "&")
    .replace(
      /\s*[\(\[](?:original\s+motion\s+picture\s+soundtrack|motion\s+picture\s+soundtrack|original\s+soundtrack|soundtrack|ost|from\s+[^)\]]+|audio|album|ep|single|deluxe|remaster(?:ed)?|edition|vol\.?\s*\d*)[^\)\]]*[\)\]]/gi,
      ""
    )
    .replace(/\s*-\s*(?:original\s+motion\s+picture\s+soundtrack|soundtrack|ost|single|ep|deluxe).*/gi, "")
    .trim();

  return cleanStr(clean);
}

/**
 * Extracts and tokenizes all artist names associated with a song.
 * Supports primary_artist, artist, singers, music director, featured artists, and artistMap.
 */
export function extractArtists(track) {
  if (!track) return [];
  const artistsSet = new Set();

  const addName = (name) => {
    if (!name || typeof name !== "string") return;
    const parts = name.split(/[,&/|;]|\s+feat\.?\s+|\s+ft\.?\s+|\s+with\s+|\s+and\s+|\s+x\s+|\s+vs\.?\s+/i);
    for (const p of parts) {
      const cleaned = cleanStr(p);
      if (cleaned.length >= 2 && cleaned !== "various artists" && cleaned !== "various" && cleaned !== "unknown") {
        artistsSet.add(cleaned);
      }
    }
  };

  // 1. Direct string fields
  addName(track.primary_artist || track.primaryArtist);
  addName(track.artist);
  addName(track.singers);
  addName(track.music || track.composer || track.musicDirector || track.more_info?.music);

  // 2. Featured artists
  if (typeof track.featured_artists === "string") {
    addName(track.featured_artists);
  } else if (Array.isArray(track.featured_artists)) {
    track.featured_artists.forEach((a) => addName(typeof a === "object" ? a.name : a));
  }

  // 3. Structured artistMap (JioSaavn format)
  const artistMap = track.artistMap || track.more_info?.artistMap;
  if (artistMap && typeof artistMap === "object") {
    if (Array.isArray(artistMap.primary_artists)) {
      artistMap.primary_artists.forEach((a) => addName(a.name));
    }
    if (Array.isArray(artistMap.artists)) {
      artistMap.artists.forEach((a) => addName(a.name));
    }
    if (Array.isArray(artistMap.featured_artists)) {
      artistMap.featured_artists.forEach((a) => addName(a.name));
    }
    // Object map format: { "Artist Name": "artistId" }
    for (const [key, val] of Object.entries(artistMap)) {
      if (typeof key === "string" && isNaN(Number(key))) {
        addName(key);
      } else if (typeof val === "string" && isNaN(Number(val))) {
        addName(val);
      }
    }
  }

  return Array.from(artistsSet);
}

/**
 * Checks whether track A and track B share at least one matching artist.
 */
export function isArtistMatch(trackA, trackB) {
  const artistsA = extractArtists(trackA);
  const artistsB = extractArtists(trackB);
  if (artistsA.length === 0 || artistsB.length === 0) return false;

  for (const a of artistsA) {
    for (const b of artistsB) {
      if (a === b) return true;
      // Allow prefix/substring matching for multi-word full names (e.g. "shreya ghoshal" & "shreya")
      if (a.length > 5 && b.length > 5) {
        if (a.includes(b) || b.includes(a)) return true;
      }
    }
  }
  return false;
}

/**
 * Generic album words that do not constitute a specific movie or album match
 */
const GENERIC_ALBUM_NAMES = new Set([
  "",
  "single",
  "singles",
  "unknown",
  "untitled",
  "track",
  "audio",
  "music",
  "songs",
  "album",
  "remix",
  "ep",
  "soundtrack",
]);

/**
 * Extracts normalized movie name if present in track metadata or song title.
 */
export function extractMovieName(track) {
  if (!track) return "";
  if (track.movieName && typeof track.movieName === "string") {
    return cleanStr(track.movieName);
  }
  if (track.movie && typeof track.movie === "string") {
    return cleanStr(track.movie);
  }
  if (track.more_info?.movie_name && typeof track.more_info.movie_name === "string") {
    return cleanStr(track.more_info.movie_name);
  }

  // Extract from title with patterns like: (From "Movie"), [From "Movie"], - From Movie
  const title = track.title || track.song || "";
  const match =
    title.match(/\(\s*from\s+["']?([^"')\]]+)["']?\s*\)/i) ||
    title.match(/\[\s*from\s+["']?([^"'\]]+)["']?\s*\]/i) ||
    title.match(/-\s*from\s+["']?([^"'-]+)["']?/i);
  if (match && match[1]) {
    const extracted = cleanStr(match[1]);
    if (extracted && !GENERIC_ALBUM_NAMES.has(extracted)) {
      return extracted;
    }
  }

  // If explicitly flagged as a film/movie track
  const isMovie = Boolean(
    track.isMovie ||
    track.isMovieTrack ||
    track.more_info?.is_movie === "1" ||
    track.more_info?.is_movie === true ||
    track.more_info?.album_type === "movie" ||
    track.album_type === "movie"
  );
  if (isMovie) {
    const alb = normalizeMovieAlbum(track.album || track.albumName || track.more_info?.album || "");
    if (alb && !GENERIC_ALBUM_NAMES.has(alb)) {
      return alb;
    }
  }

  return "";
}

/**
 * Checks whether candidate originates from the EXACT SAME MOVIE as seedTrack.
 * Priority 1: Same Movie
 */
export function isMovieMatch(trackA, trackB) {
  if (!trackA || !trackB) return false;
  const movieA = extractMovieName(trackA);
  const movieB = extractMovieName(trackB);

  if (movieA && movieB && !GENERIC_ALBUM_NAMES.has(movieA) && !GENERIC_ALBUM_NAMES.has(movieB)) {
    if (movieA === movieB) return true;
    if (movieA.length > 3 && movieB.length > 3 && (movieA.includes(movieB) || movieB.includes(movieA))) {
      return true;
    }
  }

  // If one or both are marked as movie tracks and their album/soundtrack is identical
  const isMovieA = Boolean(
    trackA.isMovie ||
    trackA.isMovieTrack ||
    trackA.more_info?.is_movie === "1" ||
    trackA.more_info?.is_movie === true ||
    trackA.more_info?.album_type === "movie" ||
    trackA.album_type === "movie" ||
    extractMovieName(trackA)
  );
  const isMovieB = Boolean(
    trackB.isMovie ||
    trackB.isMovieTrack ||
    trackB.more_info?.is_movie === "1" ||
    trackB.more_info?.is_movie === true ||
    trackB.more_info?.album_type === "movie" ||
    trackB.album_type === "movie" ||
    extractMovieName(trackB)
  );

  if ((isMovieA || isMovieB) && isAlbumMatch(trackA, trackB)) {
    return true;
  }

  return false;
}

/**
 * Checks whether track A and track B originate from the same album.
 * Priority 2: Same Album
 */
export function isAlbumMatch(trackA, trackB) {
  if (!trackA || !trackB) return false;

  // 1. Direct album_id check
  const idA = String(trackA.album_id || trackA.albumId || trackA.more_info?.album_id || "").trim();
  const idB = String(trackB.album_id || trackB.albumId || trackB.more_info?.album_id || "").trim();
  if (idA && idB && idA === idB) return true;

  // 2. Normalized album title check
  const albumA = normalizeMovieAlbum(trackA.movieName || trackA.album || trackA.albumName || trackA.more_info?.album || "");
  const albumB = normalizeMovieAlbum(trackB.movieName || trackB.album || trackB.albumName || trackB.more_info?.album || "");

  if (albumA && albumB && !GENERIC_ALBUM_NAMES.has(albumA) && !GENERIC_ALBUM_NAMES.has(albumB)) {
    if (albumA === albumB) return true;
    if (albumA.length > 4 && albumB.length > 4) {
      if (albumA.includes(albumB) || albumB.includes(albumA)) return true;
    }
  }

  // Explicit isSameAlbum flag
  if (trackA.isSameAlbum || trackB.isSameAlbum) return true;

  return false;
}

/**
 * Legacy alias for backwards compatibility
 */
export function isMovieAlbumMatch(trackA, trackB) {
  return isMovieMatch(trackA, trackB) || isAlbumMatch(trackA, trackB);
}

/**
 * Checks whether track A and track B share the same audio language.
 * Priority 4: Same Language
 */
export function isLanguageMatch(trackA, trackB) {
  if (!trackA || !trackB) return false;
  const langA = cleanStr(trackA.language || trackA.more_info?.language || "");
  const langB = cleanStr(trackB.language || trackB.more_info?.language || "");
  if (langA && langB && langA === langB) return true;
  return false;
}

/**
 * Checks whether track candidate is related to seed track (genre, mood, or recommendation link).
 * Priority 5: Related Songs
 */
export function isRelatedMatch(candidate, seedTrack) {
  if (!candidate || !seedTrack) return false;
  if (candidate.isRelated || candidate.fromRadio) return true;
  return isSongTypeMatch(candidate, seedTrack);
}

/**
 * Canonical song-type, genre, and mood detection.
 * Returns a Set of canonical category identifiers.
 */
export function detectSongTypes(track) {
  if (!track) return new Set();
  const types = new Set();

  const textToScan = [
    track.genre,
    track.mood,
    track.songType,
    track.category,
    Array.isArray(track.categories) ? track.categories.join(" ") : "",
    track.badge,
    track.more_info?.genre,
    track.more_info?.mood,
    track.title,
    track.song,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // 1. Feel-good / Upbeat / Vibe / Happy / Fun
  if (
    /(feel[\s-]?good|happy|upbeat|vibe|groove|chill|fun|dance|party|celebrat|cheerful|joy|summer\s*vibe|enjoy)/i.test(
      textToScan
    )
  ) {
    types.add("feel_good");
  }

  // 2. Rap / Hip-Hop / Trap / Drill
  if (
    /(rap|hip[\s-]?hop|hiphop|trap|flow|cypher|mc|beat|drill|street|bars|rhyme|freestyle|boom\s*bap)/i.test(
      textToScan
    )
  ) {
    types.add("rap_hiphop");
  }

  // 3. Romantic / Love / Romance / Soulful Duet
  if (
    /(romantic|romance|love|kadhal|premam|dil|pyar|ishq|heart|duet|soulful|affection|couple)/i.test(
      textToScan
    )
  ) {
    types.add("romantic");
  }

  // 4. Sad / Emotional / Heartbreak / Melancholy
  if (
    /(sad|pain|broken|tears|lonely|alone|dardi|emotional|crying|separation|judaai|maranam|viraham|heartbreak|sorrow|depress|melanchol)/i.test(
      textToScan
    )
  ) {
    types.add("sad");
  }

  // 5. Melody / Melodious / Acoustic / Soft / Serene
  if (
    /(melody|melodious|acoustic|unplugged|soft|serene|classical\s*melody|raga|ragam|breeze|lullaby|nostalgia|soothing|slow|gentle)/i.test(
      textToScan
    )
  ) {
    types.add("melody");
  }

  // 6. Dance / Mass / High Energy / Club
  if (/(mass|energy|edm|club|bass|drop|anthem|dappan|kuthu|dhol|folk\s*beat|festival|fast)/i.test(textToScan)) {
    types.add("dance");
  }

  // 7. Pop / Global Chart
  if (/(pop|synth[\s-]?pop|dance[\s-]?pop|alt[\s-]?pop|billboard|radio[\s-]?hit)/i.test(textToScan)) {
    types.add("pop");
  }

  // 8. Rock / Indie Rock / Metal
  if (/(rock|indie|alt[\s-]?rock|guitar|grunge|metal|punk)/i.test(textToScan)) {
    types.add("rock");
  }

  // 9. Ambient / Lo-Fi / Study
  if (/(ambient|lo[\s-]?fi|chillhop|relax|sleep|drone|atmospheric|meditat)/i.test(textToScan)) {
    types.add("ambient");
  }

  // 10. R&B / Soul
  if (/(r&b|rnb|soul|neo[\s-]?soul|blues)/i.test(textToScan)) {
    types.add("rnb");
  }

  // 11. Jazz
  if (/(jazz|swing|saxophone|trumpet|bebop)/i.test(textToScan)) {
    types.add("jazz");
  }

  // 12. Classical / Orchestral
  if (/(classical|orchestra|symphony|piano|violin|instrumental\s*soundtrack)/i.test(textToScan)) {
    types.add("classical");
  }

  return types;
}

/**
 * Checks whether candidate track matches the seed track's song type, genre, or mood.
 */
export function isSongTypeMatch(candidate, seedTrack) {
  const seedTypes = detectSongTypes(seedTrack);
  const candTypes = detectSongTypes(candidate);

  if (seedTypes.size === 0 || candTypes.size === 0) {
    // If no specific mood/genre detected, check raw genre string equality
    const rawGenreSeed = cleanStr(seedTrack?.genre || "");
    const rawGenreCand = cleanStr(candidate?.genre || "");
    if (rawGenreSeed && rawGenreCand && rawGenreSeed === rawGenreCand) {
      return true;
    }
    return false;
  }

  for (const type of seedTypes) {
    if (candTypes.has(type)) return true;
  }

  return false;
}

/**
 * Determines which exact Priority Tier (1 through 6) a candidate belongs to
 * when compared against the seed track according to the strict priority algorithm:
 *
 * Tier 1: Same Movie (other available songs from the same movie)
 * Tier 2: Same Album (songs from the same album if not already same movie)
 * Tier 3: Same Artist (songs by the same artist)
 * Tier 4: Same Language (songs in the same language)
 * Tier 5: Related Songs (songs related based on genre/mood/webradio recommendations)
 * Tier 6: Autoplay (general recommended/autoplay songs)
 */
export function assignCandidateTier(candidate, seedTrack) {
  if (!candidate || !seedTrack) {
    return {
      tier: 6,
      tierReason: "Autoplay",
      sameMovie: false,
      sameAlbum: false,
      sameArtist: false,
      sameLanguage: false,
      isRelated: false,
    };
  }

  // 1. Same Movie
  const sameMovie = isMovieMatch(candidate, seedTrack);
  if (sameMovie) {
    return {
      tier: 1,
      tierReason: "Same Movie",
      sameMovie: true,
      sameAlbum: true,
      sameArtist: isArtistMatch(candidate, seedTrack),
      sameLanguage: isLanguageMatch(candidate, seedTrack),
      isRelated: true,
    };
  }

  // 2. Same Album
  const sameAlbum = isAlbumMatch(candidate, seedTrack);
  if (sameAlbum) {
    return {
      tier: 2,
      tierReason: "Same Album",
      sameMovie: false,
      sameAlbum: true,
      sameArtist: isArtistMatch(candidate, seedTrack),
      sameLanguage: isLanguageMatch(candidate, seedTrack),
      isRelated: true,
    };
  }

  // 3. Same Artist
  const sameArtist = isArtistMatch(candidate, seedTrack);
  if (sameArtist) {
    return {
      tier: 3,
      tierReason: "Same Artist",
      sameMovie: false,
      sameAlbum: false,
      sameArtist: true,
      sameLanguage: isLanguageMatch(candidate, seedTrack),
      isRelated: true,
    };
  }

  // 4. Same Language
  const sameLanguage = isLanguageMatch(candidate, seedTrack);
  if (sameLanguage) {
    return {
      tier: 4,
      tierReason: "Same Language",
      sameMovie: false,
      sameAlbum: false,
      sameArtist: false,
      sameLanguage: true,
      isRelated: isRelatedMatch(candidate, seedTrack),
    };
  }

  // 5. Related Songs
  const isRelated = isRelatedMatch(candidate, seedTrack);
  if (isRelated) {
    return {
      tier: 5,
      tierReason: "Related Songs",
      sameMovie: false,
      sameAlbum: false,
      sameArtist: false,
      sameLanguage: false,
      isRelated: true,
    };
  }

  // 6. Autoplay
  return {
    tier: 6,
    tierReason: "Autoplay",
    sameMovie: false,
    sameAlbum: false,
    sameArtist: false,
    sameLanguage: false,
    isRelated: false,
  };
}

/**
 * Calculates secondary relevance score within the same priority tier.
 * Factors: Language match, play count / popularity, era proximity, and slight deterministic variance.
 */
export function calculateSecondaryScore(candidate, seedTrack, tierInfo = {}) {
  let score = 0;

  // Language match (+300 pts)
  const langSeed = cleanStr(seedTrack?.language || seedTrack?.more_info?.language || "");
  const langCand = cleanStr(candidate?.language || candidate?.more_info?.language || "");
  if (langSeed && langCand && langSeed === langCand) {
    score += 300;
  }

  // Primary artist lead match (+200 pts)
  const leadSeed = cleanStr(seedTrack?.primary_artist || seedTrack?.primaryArtist || "");
  const leadCand = cleanStr(candidate?.primary_artist || candidate?.primaryArtist || "");
  if (leadSeed && leadCand && leadSeed === leadCand) {
    score += 200;
  }

  // Popularity / Play Count (+0 to 200 pts)
  const plays = Number(candidate?.play_count || candidate?.playCount || candidate?.plays || 0);
  if (!isNaN(plays) && plays > 0) {
    score += Math.min(200, Math.floor(plays / 50000));
  }

  // Era / Year proximity (+0 to 50 pts)
  const yearSeed = parseInt(seedTrack?.year || "0", 10) || 0;
  const yearCand = parseInt(candidate?.year || "0", 10) || 0;
  if (yearSeed > 1900 && yearCand > 1900) {
    const diff = Math.abs(yearSeed - yearCand);
    if (diff <= 2) score += 50;
    else if (diff <= 5) score += 30;
    else if (diff <= 10) score += 10;
  }

  // Deterministic variance hash based on ID to break ties dynamically
  const idStr = String(candidate?.id || candidate?.title || "");
  let hash = 0;
  for (let i = 0; i < idStr.length; i++) {
    hash = (hash * 31 + idStr.charCodeAt(i)) & 0xfff;
  }
  score += hash % 20;

  return score;
}

/**
 * Standard track normalization for clean output
 */
function normalizeOutputTrack(track, tierInfo, score) {
  const durSec = Number(track.duration || 210);
  const m = Math.floor(durSec / 60);
  const s = Math.floor(durSec % 60);
  const durationFormatted = track.durationFormatted || `${m}:${s < 10 ? "0" : ""}${s}`;

  return {
    ...track,
    id: String(track.id),
    title: track.title || track.song || "Unknown Track",
    artist: track.artist || track.primary_artists || "Unknown Artist",
    tier: tierInfo.tier,
    tierReason: tierInfo.tierReason,
    score,
    sameMovie: tierInfo.sameMovie,
    sameAlbum: tierInfo.sameAlbum,
    sameArtist: tierInfo.sameArtist,
    sameLanguage: tierInfo.sameLanguage,
    isRelated: tierInfo.isRelated,
    isManual: false,
    duration: durSec,
    durationFormatted,
  };
}

/**
 * Central recommendation ranking function:
 * generateRecommendedQueue(currentSong, musicCatalog, options)
 *
 * 1. Excludes current song.
 * 2. Compares candidate metadata with current song.
 * 3. Assigns each candidate its highest matching tier (1 to 6).
 * 4. Filters out candidates that do not match any tier.
 * 5. Sorts candidates strictly by priority tier in ascending order (Tier 1 before 2, etc.).
 * 6. Within the same tier, sorts by secondary relevance signals.
 * 7. Removes duplicate song IDs and identical title+artist duplicates.
 * 8. Excludes recently played songs when possible.
 * 9. Returns the ranked recommendation queue.
 *
 * @param {Object} currentSong - The seed track
 * @param {Array<Object>} musicCatalog - Available songs to rank
 * @param {Object} [options] - Configuration options:
 *   - excludeIds: Set or Array of song IDs to exclude
 *   - sessionPlayedIds: Set of recently played song IDs to filter out when possible
 *   - maxResults: Maximum number of tracks to return (default: 25)
 * @returns {Array<Object>} Ranked upcoming queue
 */
export function generateRecommendedQueue(currentSong, musicCatalog, options = {}) {
  if (!currentSong || !Array.isArray(musicCatalog) || musicCatalog.length === 0) {
    return [];
  }

  const currentId = String(currentSong.id || "").trim();
  const maxResults = options.maxResults || 25;

  // Build exclusion sets
  const excludeSet = new Set();
  if (currentId) excludeSet.add(currentId);

  if (options.excludeIds) {
    const rawList = Array.isArray(options.excludeIds)
      ? options.excludeIds
      : options.excludeIds instanceof Set
      ? Array.from(options.excludeIds)
      : String(options.excludeIds).split(",");
    for (const id of rawList) {
      if (id) excludeSet.add(String(id).trim());
    }
  }

  const sessionPlayedSet = new Set();
  if (options.sessionPlayedIds) {
    const playedList = Array.isArray(options.sessionPlayedIds)
      ? options.sessionPlayedIds
      : options.sessionPlayedIds instanceof Set
      ? Array.from(options.sessionPlayedIds)
      : String(options.sessionPlayedIds).split(",");
    for (const id of playedList) {
      if (id) sessionPlayedSet.add(String(id).trim());
    }
  }

  // 1. Evaluate every candidate in catalog
  const scoredCandidates = [];
  const seenIds = new Set();
  const seenTitleArtist = new Set();

  for (const candidate of musicCatalog) {
    if (!candidate || !candidate.id) continue;
    const candId = String(candidate.id).trim();

    // Exclude current seed song and explicit exclusions
    if (excludeSet.has(candId)) continue;
    if (seenIds.has(candId)) continue;

    // Deduplication by title + artist key
    const cleanT = cleanStr(candidate.title || candidate.song || "");
    const cleanA = cleanStr(candidate.artist || candidate.primary_artists || "");
    const key = `${cleanT}:::${cleanA}`;
    if (cleanT && cleanA && seenTitleArtist.has(key)) continue;

    // 2. Assign highest matching priority tier (1 - 6)
    const tierInfo = assignCandidateTier(candidate, currentSong);
    if (!tierInfo.tier) {
      // Excluded: Does not match any of the six tiers
      continue;
    }

    seenIds.add(candId);
    if (cleanT && cleanA) seenTitleArtist.add(key);

    const score = calculateSecondaryScore(candidate, currentSong);
    const normalized = normalizeOutputTrack(candidate, tierInfo, score);
    scoredCandidates.push(normalized);
  }

  // 3. Strict 6-Tier Ordering:
  // Priority 1 songs MUST appear before Priority 2 songs.
  // Priority 2 songs MUST appear before Priority 3 songs...
  // NEVER allow a lower tier to precede a higher tier!
  scoredCandidates.sort((a, b) => {
    // Primary Sort: Tier ascending (1 to 6)
    if (a.tier !== b.tier) {
      return a.tier - b.tier;
    }
    // Secondary Sort: Relevance score descending within identical tier
    return b.score - a.score;
  });

  // 4. Session History Exclusion:
  // If excluding recently played songs still leaves enough candidates, prioritize fresh tracks.
  if (sessionPlayedSet.size > 0) {
    const freshTracks = scoredCandidates.filter((t) => !sessionPlayedSet.has(String(t.id)));
    if (freshTracks.length >= Math.min(8, maxResults)) {
      return freshTracks.slice(0, maxResults);
    }
    // If filtering would starve the queue, place fresh tracks first, followed by played tracks
    const playedTracks = scoredCandidates.filter((t) => sessionPlayedSet.has(String(t.id)));
    return [...freshTracks, ...playedTracks].slice(0, maxResults);
  }

  return scoredCandidates.slice(0, maxResults);
}
