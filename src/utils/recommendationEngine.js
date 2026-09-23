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
 * Checks whether track A and track B originate from the same movie or album.
 */
export function isMovieAlbumMatch(trackA, trackB) {
  if (!trackA || !trackB) return false;

  // 1. Direct album_id check
  const idA = String(trackA.album_id || trackA.albumId || trackA.more_info?.album_id || "").trim();
  const idB = String(trackB.album_id || trackB.albumId || trackB.more_info?.album_id || "").trim();
  if (idA && idB && idA === idB) return true;

  // 2. Normalized album or movie title check
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
 * when compared against the seed track.
 *
 * Returns an object with:
 * - tier: 1 | 2 | 3 | 4 | 5 | 6 | null (null indicates candidate does not match any tier)
 * - tierReason: String explanation of the tier
 * - sameMovie: Boolean
 * - sameArtist: Boolean
 * - sameType: Boolean
 */
export function assignCandidateTier(candidate, seedTrack) {
  if (!candidate || !seedTrack) {
    return { tier: null, tierReason: "Invalid candidate or seed", sameMovie: false, sameArtist: false, sameType: false };
  }

  const sameMovie = isMovieAlbumMatch(candidate, seedTrack);
  const sameArtist = isArtistMatch(candidate, seedTrack);
  const sameType = isSongTypeMatch(candidate, seedTrack);

  // PRIORITY 1 — HIGHEST PRIORITY
  // Same Movie/Album + Same Artist + Same Song Type (matches all three)
  if (sameMovie && sameArtist && sameType) {
    return {
      tier: 1,
      tierReason: "Priority 1: Same Movie/Album + Same Artist + Same Song Type",
      sameMovie,
      sameArtist,
      sameType,
    };
  }

  // PRIORITY 2
  // Same Artist + Same Song Type (movie/album does not need to match)
  if (sameArtist && sameType) {
    return {
      tier: 2,
      tierReason: "Priority 2: Same Artist + Same Song Type",
      sameMovie,
      sameArtist,
      sameType,
    };
  }

  // PRIORITY 3
  // Same Movie/Album + Same Song Type (artist does not need to match)
  if (sameMovie && sameType) {
    return {
      tier: 3,
      tierReason: "Priority 3: Same Movie/Album + Same Song Type",
      sameMovie,
      sameArtist,
      sameType,
    };
  }

  // PRIORITY 4
  // Same Artist (movie/album and song type do not need to match)
  if (sameArtist) {
    return {
      tier: 4,
      tierReason: "Priority 4: Same Artist",
      sameMovie,
      sameArtist,
      sameType,
    };
  }

  // PRIORITY 5
  // Same Song Type (artist and movie/album do not need to match)
  if (sameType) {
    return {
      tier: 5,
      tierReason: "Priority 5: Same Song Type",
      sameMovie,
      sameArtist,
      sameType,
    };
  }

  // PRIORITY 6 — LOWEST MATCHING PRIORITY
  // Same Movie/Album (artist and song type do not need to match)
  if (sameMovie) {
    return {
      tier: 6,
      tierReason: "Priority 6: Same Movie/Album",
      sameMovie,
      sameArtist,
      sameType,
    };
  }

  // Candidate does not match any tier -> Excluded from matching recommendation queue
  return {
    tier: null,
    tierReason: "Excluded: Does not match any of the six recommendation tiers",
    sameMovie,
    sameArtist,
    sameType,
  };
}

/**
 * Calculates secondary relevance score within the same priority tier.
 * Factors: Language match, play count / popularity, era proximity, and slight deterministic variance.
 */
export function calculateSecondaryScore(candidate, seedTrack) {
  let score = 0;

  // Language match (+300 pts)
  const langSeed = cleanStr(seedTrack?.language || seedTrack?.more_info?.language || "");
  const langCand = cleanStr(candidate?.language || candidate?.more_info?.language || "");
  if (langSeed && langCand && langSeed === langCand) {
    score += 300;
  }

  // Popularity / Play Count (+0 to 150 pts)
  const plays = Number(candidate?.play_count || candidate?.playCount || candidate?.plays || 0);
  if (!isNaN(plays) && plays > 0) {
    score += Math.min(150, Math.floor(plays / 100000));
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

  // Deterministic variance hash based on ID to break ties dynamically without random chaos
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
    sameArtist: tierInfo.sameArtist,
    sameType: tierInfo.sameType,
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
