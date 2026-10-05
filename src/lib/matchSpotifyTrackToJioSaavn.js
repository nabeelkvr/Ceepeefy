/**
 * Spotify Track -> JioSaavn Catalog Matching Engine
 *
 * Implements high-confidence acoustic metadata matching:
 * 1. Normalized Title Similarity
 * 2. Artist Similarity (token & substring alignment)
 * 3. Duration Proximity Matching (when available)
 * 4. Album & Version Verification (filtering karaokes, unauthorized covers & rips)
 *
 * Guaranteed States:
 * - MATCHED: Verified high-confidence match available for Ceepeefy playback
 * - UNAVAILABLE: Track does not exist or does not meet confidence threshold
 * - MATCHING: In-progress resolution state
 * - ERROR: Network or resolution error
 */

export const MATCH_STATUS = {
  MATCHED: "MATCHED",
  UNAVAILABLE: "UNAVAILABLE",
  MATCHING: "MATCHING",
  ERROR: "ERROR",
};

// In-memory cache for matched tracks to prevent duplicate network calls
const matchCache = new Map();

function cleanStr(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeTitle(title) {
  if (!title) return "";
  return title
    .replace(/&quot;/g, "")
    .replace(/&#039;/g, "")
    .replace(/&#39;/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s*[\(\[](?:from|feat\.?|ft\.?|with|soundtrack|version|remix|acoustic|karaoke|live|official|lyric|video|audio)[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*-\s*(?:from|remix|acoustic|live|version|soundtrack)[^\-]*/gi, "")
    .replace(/[^a-z0-9]/gi, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Calculates token overlap similarity between two strings (0.0 to 1.0)
 */
function tokenSimilarity(strA, strB) {
  if (!strA || !strB) return 0;
  const tokensA = new Set(strA.toLowerCase().split(/\s+/).filter((t) => t.length > 1));
  const tokensB = new Set(strB.toLowerCase().split(/\s+/).filter((t) => t.length > 1));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) intersection++;
  });

  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Evaluates match quality between a Spotify track and a candidate JioSaavn track.
 * Returns numeric score (0 to 150+). Threshold for MATCHED is 65.
 */
function calculateMatchScore(spotifyTrack, candidate) {
  if (!spotifyTrack || !candidate) return 0;

  const spTitle = spotifyTrack.title || spotifyTrack.name || "";
  const cdTitle = candidate.title || candidate.song || "";
  if (!spTitle || !cdTitle) return 0;

  const spTitleClean = cleanStr(spTitle);
  const cdTitleClean = cleanStr(cdTitle);
  const spTitleNorm = normalizeTitle(spTitle);
  const cdTitleNorm = normalizeTitle(cdTitle);

  const spArtist = (Array.isArray(spotifyTrack.artists) ? spotifyTrack.artists[0] : spotifyTrack.artist) || "";
  const cdArtist = candidate.artist || candidate.singers || candidate.primary_artists || "";
  const spArtistClean = cleanStr(spArtist);
  const cdArtistClean = cleanStr(cdArtist);

  let score = 0;

  // 1. Title Similarity (up to 65 points)
  if (spTitleClean && cdTitleClean && spTitleClean === cdTitleClean) {
    score += 65;
  } else if (spTitleNorm && cdTitleNorm && spTitleNorm === cdTitleNorm) {
    score += 60;
  } else if (spTitleNorm && cdTitleNorm && (cdTitleNorm.startsWith(spTitleNorm) || spTitleNorm.startsWith(cdTitleNorm))) {
    score += 45;
  } else if (spTitleNorm && cdTitleNorm && (cdTitleNorm.includes(spTitleNorm) || spTitleNorm.includes(cdTitleNorm))) {
    score += 35;
  } else {
    const sim = tokenSimilarity(spTitleNorm, cdTitleNorm);
    if (sim >= 0.6) {
      score += Math.round(sim * 45);
    } else {
      // If title words don't match at all, disqualify
      return 0;
    }
  }

  // 2. Artist Similarity (up to 40 points)
  if (spArtistClean && cdArtistClean) {
    if (spArtistClean === cdArtistClean) {
      score += 40;
    } else if (cdArtistClean.includes(spArtistClean) || spArtistClean.includes(cdArtistClean)) {
      score += 35;
    } else {
      const artSim = tokenSimilarity(spArtist, cdArtist);
      if (artSim > 0.4) {
        score += Math.round(artSim * 30);
      } else {
        // Penalty for mismatched artist
        score -= 25;
      }
    }
  }

  // Artist spam penalty: fake artist naming themselves after the song title
  if (cdArtistClean && (cdArtistClean === cdTitleClean || cdArtistClean === spTitleClean)) {
    score -= 40;
  }

  // 3. Duration Proximity Matching (up to 20 points)
  const spDuration = spotifyTrack.duration || (spotifyTrack.durationMs ? Math.round(spotifyTrack.durationMs / 1000) : 0);
  const cdDuration = typeof candidate.duration === "number" ? candidate.duration : parseInt(candidate.duration || "0", 10);

  if (spDuration > 10 && cdDuration > 10) {
    const delta = Math.abs(spDuration - cdDuration);
    if (delta <= 3) {
      score += 20; // Exact track master length
    } else if (delta <= 8) {
      score += 15;
    } else if (delta <= 18) {
      score += 8;
    } else if (delta > 45) {
      // Likely an extended cut, podcast, or different song entirely
      score -= 25;
    }
  }

  // 4. Album Similarity (up to 15 points)
  const spAlbumClean = cleanStr(spotifyTrack.album || "");
  const cdAlbumClean = cleanStr(candidate.album || "");
  if (spAlbumClean && cdAlbumClean && (spAlbumClean === cdAlbumClean || cdAlbumClean.includes(spAlbumClean))) {
    score += 15;
  }

  // 5. Version / Quality Penalties
  const spIsSpecial = /\b(remix|acoustic|karaoke|cover|live|instrumental)\b/i.test(spTitle);
  const cdIsKaraoke = /\b(karaoke|backing track|minus one|tribute version)\b/i.test(cdTitle);
  const cdIsCover = /\b(cover|tribute to|originally performed)\b/i.test(cdTitle) || /\b(tribute|karaoke)\b/i.test(cdArtist);
  const cdIsInstrumental = /\b(piano version|instrumental cover|violin cover|flute cover)\b/i.test(cdTitle);
  const cdIsRemix = /\b(remix|mix|dj|slowed|reverb)\b/i.test(cdTitle);

  if (cdIsKaraoke && !spIsSpecial) score -= 80;
  if (cdIsCover && !spIsSpecial) score -= 65;
  if (cdIsInstrumental && !spIsSpecial) score -= 55;
  if (cdIsRemix && !spIsSpecial) score -= 30;

  // Bonus if direct playable audio URL exists
  if (candidate.audioUrl) {
    score += 10;
  }

  return score;
}

/**
 * Searches the existing JioSaavn audio search API and finds the best matching track.
 *
 * @param {object} spotifyTrack - Input Spotify track metadata
 * @param {string} spotifyTrack.title
 * @param {string|Array<string>} [spotifyTrack.artists]
 * @param {string} [spotifyTrack.artist]
 * @param {string} [spotifyTrack.album]
 * @param {number} [spotifyTrack.duration]
 * @returns {Promise<{ status: string, score: number, confidence: string, song: object|null, spotifyTrack: object }>}
 */
export async function matchSpotifyTrackToJioSaavn(spotifyTrack) {
  if (!spotifyTrack || (!spotifyTrack.title && !spotifyTrack.name)) {
    return {
      status: MATCH_STATUS.UNAVAILABLE,
      score: 0,
      confidence: "none",
      song: null,
      spotifyTrack,
    };
  }

  const title = (spotifyTrack.title || spotifyTrack.name || "").trim();
  const primaryArtist = (
    Array.isArray(spotifyTrack.artists) && spotifyTrack.artists.length > 0
      ? spotifyTrack.artists[0]
      : (spotifyTrack.artist || "").split(/[,&/]/)[0]
  ).trim();

  const cacheKey = `${cleanStr(title)}:::${cleanStr(primaryArtist)}`;
  if (matchCache.has(cacheKey)) {
    const cached = matchCache.get(cacheKey);
    return {
      ...cached,
      spotifyTrack,
    };
  }

  try {
    // Construct focused query: "SongTitle Artist"
    const searchQuery = primaryArtist ? `${title} ${primaryArtist}` : title;
    const res = await fetch(`/api/audio/search?q=${encodeURIComponent(searchQuery)}&page=1`);

    if (!res.ok) {
      throw new Error(`JioSaavn search failed [${res.status}]`);
    }

    const data = await res.json();
    const candidateSongs = Array.isArray(data.songs)
      ? data.songs
      : Array.isArray(data.tracks)
        ? data.tracks
        : Array.isArray(data.results)
          ? data.results
          : [];

    if (candidateSongs.length === 0) {
      const fallbackResult = {
        status: MATCH_STATUS.UNAVAILABLE,
        score: 0,
        confidence: "none",
        song: null,
        spotifyTrack,
      };
      matchCache.set(cacheKey, fallbackResult);
      return fallbackResult;
    }

    // Score and rank all candidate tracks
    let bestCandidate = null;
    let bestScore = -1;

    for (const cand of candidateSongs) {
      const score = calculateMatchScore(spotifyTrack, cand);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = cand;
      }
    }

    // Strict confidence threshold: require at least 65 points
    const CONFIDENCE_THRESHOLD = 65;

    if (bestCandidate && bestScore >= CONFIDENCE_THRESHOLD) {
      const matchedSong = {
        id: String(bestCandidate.id),
        title: bestCandidate.title,
        artist: bestCandidate.artist || primaryArtist,
        album: bestCandidate.album || spotifyTrack.album || "",
        coverUrl: bestCandidate.coverUrl || bestCandidate.thumbnail || bestCandidate.image || spotifyTrack.coverUrl,
        thumbnail: bestCandidate.thumbnail || bestCandidate.coverUrl || spotifyTrack.coverUrl,
        image: bestCandidate.image || bestCandidate.coverUrl || spotifyTrack.coverUrl,
        duration: typeof bestCandidate.duration === "number" ? bestCandidate.duration : (spotifyTrack.duration || 210),
        durationFormatted: bestCandidate.durationFormatted || spotifyTrack.durationFormatted || "3:30",
        audioUrl: bestCandidate.audioUrl || null,
        bitrate: bestCandidate.bitrate || "320kbps",
        badge: bestCandidate.badge || "Lossless",
        type: "song",
        source: "jiosaavn-matched",
        matchedSpotifyId: spotifyTrack.id,
      };

      const result = {
        status: MATCH_STATUS.MATCHED,
        score: bestScore,
        confidence: bestScore >= 95 ? "high" : bestScore >= 80 ? "medium" : "moderate",
        song: matchedSong,
        spotifyTrack,
      };

      matchCache.set(cacheKey, result);
      return result;
    }

    const unavailResult = {
      status: MATCH_STATUS.UNAVAILABLE,
      score: Math.max(0, bestScore),
      confidence: "none",
      song: null,
      spotifyTrack,
    };
    matchCache.set(cacheKey, unavailResult);
    return unavailResult;
  } catch (err) {
    console.warn(`[Matching] Error matching "${title}":`, err?.message || err);
    return {
      status: MATCH_STATUS.ERROR,
      score: 0,
      confidence: "none",
      song: null,
      error: err?.message || "Matching error",
      spotifyTrack,
    };
  }
}

/**
 * Batches matching of multiple Spotify tracks with concurrency control
 *
 * @param {Array<object>} tracks - Array of Spotify track objects
 * @param {Function} [onTrackMatched] - Callback invoked when a track resolves: (trackId, matchResult) => void
 * @param {number} [concurrency=4] - Max concurrent matching requests
 * @returns {Promise<Array<object>>} Ordered list of match results
 */
export async function matchSpotifyTracksBatch(tracks, onTrackMatched = null, concurrency = 4) {
  if (!Array.isArray(tracks) || tracks.length === 0) return [];

  const results = new Array(tracks.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < tracks.length) {
      const idx = currentIndex++;
      const track = tracks[idx];
      try {
        const matchResult = await matchSpotifyTrackToJioSaavn(track);
        results[idx] = matchResult;
        if (onTrackMatched) {
          onTrackMatched(track.id || idx, matchResult);
        }
      } catch (err) {
        const errorResult = {
          status: MATCH_STATUS.ERROR,
          score: 0,
          confidence: "none",
          song: null,
          spotifyTrack: track,
          error: err?.message,
        };
        results[idx] = errorResult;
        if (onTrackMatched) {
          onTrackMatched(track.id || idx, errorResult);
        }
      }
    }
  }

  const workers = [];
  const workerCount = Math.min(concurrency, tracks.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}
