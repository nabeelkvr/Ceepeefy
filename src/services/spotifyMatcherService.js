import {
  searchJioSaavnSongs,
  cleanHtmlText,
  cleanStr,
  normalizeSongTitle,
  formatDuration,
  decryptMediaUrl,
  JIOSAAVN_HEADERS,
} from "./jiosaavnSearchService.js";

/**
 * In-memory LRU-like cache for candidate search queries to prevent redundant external API hits.
 * TTL: 15 minutes.
 */
const candidateCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

export function cleanHtml(str) {
  return cleanHtmlText(str);
}

export function cleanAlphaNum(str) {
  return cleanStr(str);
}

/**
 * Normalizes title for search & comparison:
 * Removes (feat. ...), [with ...], (from "movie"), soundtrack tags,
 * trailing hyphen tags (- From movie, - Single, - Remastered), and punctuation.
 */
export function normalizeTitle(t) {
  if (!t) return "";
  return cleanHtmlText(t)
    .toLowerCase()
    .replace(/&quot;/g, "")
    .replace(/&#039;/g, "")
    .replace(/&#39;/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s*[\(\[](?:from|feat\.?|ft\.?|with|soundtrack|version|remix|acoustic|karaoke|live|original motion picture|single|remastered|ost)[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*-\s*(?:from|feat\.?|ft\.?|with|soundtrack|version|remix|acoustic|karaoke|live|original motion picture|single|remastered|ost).*$/gi, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Extracts core song title before subtitles or delimiters (e.g. "Arabic Kuthu - Halamithi Habibo" -> "Arabic Kuthu")
 */
export function getCoreTitle(t) {
  if (!t) return "";
  const cleaned = cleanHtmlText(t)
    .replace(/\s*[\(\[](?:from|feat\.?|ft\.?|with|soundtrack|version|remix|acoustic|karaoke|live|original motion picture|single|remastered|ost)[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*-\s*(?:from|feat\.?|ft\.?|with|soundtrack|version|remix|acoustic|karaoke|live|original motion picture|single|remastered|ost).*$/gi, "")
    .trim();

  // If there is a delimiter separating sub-titles, take the primary prefix if length >= 2
  const parts = cleaned.split(/\s*[-–—:]\s*/);
  if (parts.length > 1 && parts[0].trim().length >= 2) {
    return parts[0].trim();
  }
  return cleaned;
}

/**
 * Normalizes artist name: lowercases and removes punctuation.
 */
export function normalizeArtist(a) {
  if (!a) return "";
  return cleanHtmlText(a)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * String similarity using token overlap and character length comparison.
 */
export function stringSimilarity(s1, s2) {
  const str1 = (s1 || "").toLowerCase().trim();
  const str2 = (s2 || "").toLowerCase().trim();
  if (!str1 || !str2) return 0.0;
  if (str1 === str2) return 1.0;

  if (str1.includes(str2) || str2.includes(str1)) {
    const longer = Math.max(str1.length, str2.length);
    const shorter = Math.min(str1.length, str2.length);
    return Math.max(0.85, shorter / longer);
  }

  const tokens1 = new Set(str1.split(/\s+/).filter((t) => t.length > 1));
  const tokens2 = new Set(str2.split(/\s+/).filter((t) => t.length > 1));
  if (tokens1.size === 0 || tokens2.size === 0) return 0.0;

  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }
  const union = new Set([...tokens1, ...tokens2]).size;
  return intersection / union;
}

/**
 * Common Indian language transliteration and spelling mappings across Malayalam, Tamil, Telugu, Hindi, Kannada.
 */
const TRANSLITERATION_MAP = {
  chembarathi: "chembaruthi",
  chimikkathi: "chembarathi",
  kannazhaga: "kannazhagaa",
  "vaathi coming": "vathi coming",
  jimikki: "entammede jimikki",
  aaradhike: "aaradhike ambili",
  "rowdy baby": "rowdy baby maari 2",
  "arabic kuthu": "arabic kuthu halamithi habibo",
  "tum hi ho": "tum hi ho aashiqui 2",
  chaleya: "chaleya jawan",
};

/**
 * Stage A: Generate progressive queries for JioSaavn candidate retrieval.
 * Sequence:
 * 1. Clean core title + primary artist
 * 2. Exact Spotify song title + primary artist
 * 3. Normalized song title + primary artist
 * 4. Core song title without featuring credits, punctuation, or unnecessary suffixes
 * 5. Core title + secondary/featured artist
 * 6. Core title + album or movie name (when not a generic playlist title)
 * 7. Alternate spellings and transliterations
 * 8. Broader title-only search
 */
export function generateProgressiveQueries(track) {
  const rawTitle = (track.name || track.title || "").trim();
  const artists = Array.isArray(track.artists) ? track.artists : [track.primaryArtist || track.artist || ""];
  const primaryArtist = (typeof artists[0] === "string" ? artists[0] : artists[0]?.name || "").trim();
  const secondaryArtist = (typeof artists[1] === "string" ? artists[1] : artists[1]?.name || "").trim();
  const rawAlbum = (track.album?.name || track.album || "").trim();
  const normTitle = normalizeTitle(rawTitle);
  const coreTitle = getCoreTitle(rawTitle);

  // Check if album is a genuine album name vs generic playlist name
  const isGenericPlaylist = /\b(trending now|top hits|top 50|today|playlist|hits 20|chart|viral)\b/i.test(rawAlbum);
  const album = isGenericPlaylist ? "" : rawAlbum;

  const queries = [];

  // Query 1: Clean core title + primary artist (e.g. "Arabic Kuthu Anirudh Ravichander", "Chaleya Arijit Singh")
  if (coreTitle && primaryArtist) {
    queries.push(`${coreTitle} ${primaryArtist}`.trim());
  }

  // Query 2: Exact raw title + primary artist
  if (rawTitle && primaryArtist && rawTitle.toLowerCase() !== coreTitle.toLowerCase()) {
    queries.push(`${rawTitle} ${primaryArtist}`.trim());
  }

  // Query 3: Normalized title + primary artist
  if (normTitle && normTitle !== coreTitle.toLowerCase() && primaryArtist) {
    queries.push(`${normTitle} ${primaryArtist}`.trim());
  }

  // Query 4: Core title alone (crucial for finding songs on JioSaavn where title query ranks top)
  if (coreTitle) {
    queries.push(coreTitle);
  }

  // Query 5: Core title + secondary credited/featured artist
  if (coreTitle && secondaryArtist) {
    queries.push(`${coreTitle} ${secondaryArtist}`.trim());
  }

  // Query 6: Core title + album or movie name
  if (coreTitle && album && album.toLowerCase() !== coreTitle.toLowerCase()) {
    queries.push(`${coreTitle} ${album}`.trim());
  }

  // Query 7: Alternate spelling / transliteration
  const lowerTitle = rawTitle.toLowerCase();
  for (const [key, alt] of Object.entries(TRANSLITERATION_MAP)) {
    if (lowerTitle.includes(key)) {
      queries.push(`${alt} ${primaryArtist}`.trim());
      queries.push(alt);
      break;
    }
  }

  // Query 8: Normalized title alone
  if (normTitle && normTitle !== coreTitle.toLowerCase()) {
    queries.push(normTitle);
  }

  // Query 9: Full raw title
  if (rawTitle && rawTitle !== coreTitle) {
    queries.push(rawTitle);
  }

  // Return unique, non-empty queries
  return [...new Set(queries.filter(Boolean))];
}

/**
 * Searches JioSaavn for candidate tracks using the unified reference search catalog.
 * Guarantees that EVERY song discoverable on Ceepeefy's main Search page is also returned here.
 *
 * @param {string} query
 * @returns {Promise<Array<any>>}
 */
export async function searchJioSaavnCandidates(query) {
  const cleanQ = (query || "").trim();
  if (!cleanQ) return [];

  const cacheKey = cleanQ.toLowerCase();
  const cached = candidateCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const songs = await searchJioSaavnSongs(cleanQ);

    const candidates = songs.map((s) => ({
      id: String(s.id),
      title: s.title,
      artist: s.artist,
      primary_artists: s.artist,
      singers: s.artist,
      music: "",
      all_artists: s.artist,
      album: s.album || "",
      album_id: s.album_id || "",
      duration: s.duration || 0,
      durationFormatted: s.durationFormatted || formatDuration(s.duration || 0),
      audioUrl: s.audioUrl || null,
      coverUrl: s.coverUrl || s.image || "",
      year: s.year || null,
      playCount: s.playCount || 0,
      language: (s.language || "").toLowerCase(),
    }));

    candidateCache.set(cacheKey, { timestamp: Date.now(), data: candidates });
    if (candidateCache.size > 500) {
      const oldestKey = candidateCache.keys().next().value;
      candidateCache.delete(oldestKey);
    }

    return candidates;
  } catch (err) {
    console.warn("[Matcher Service] JioSaavn search error:", err?.message || err);
    return [];
  }
}

/**
 * Checks whether the Spotify track and the API candidate have the same song title and artist.
 * When this returns true, the candidate is recognized as an exact match.
 */
export function isSameSongAndArtist(spotifyTrack, candidate) {
  const sourceRaw = (spotifyTrack.name || spotifyTrack.title || "").trim();
  const candRaw = (candidate.title || candidate.song || "").trim();
  if (!sourceRaw || !candRaw) return false;

  const normSource = normalizeTitle(sourceRaw);
  const normCand = normalizeTitle(candRaw);
  const alphaSource = cleanAlphaNum(normSource);
  const alphaCand = cleanAlphaNum(normCand);

  const coreSource = cleanAlphaNum(getCoreTitle(sourceRaw));
  const coreCand = cleanAlphaNum(getCoreTitle(candRaw));

  // 1. Title match condition
  let titleMatches = false;

  if (alphaSource && alphaCand && alphaSource === alphaCand) {
    titleMatches = true;
  } else if (coreSource && coreCand && coreSource === coreCand && coreSource.length >= 2) {
    titleMatches = true;
  } else if (coreSource && alphaCand && (alphaCand === coreSource || (coreSource.length >= 4 && alphaCand.startsWith(coreSource)))) {
    titleMatches = true;
  } else if (coreCand && alphaSource && (alphaSource === coreCand || (coreCand.length >= 4 && alphaSource.startsWith(coreCand)))) {
    titleMatches = true;
  } else {
    const titleSim = stringSimilarity(normSource, normCand);
    if (titleSim >= 0.80) {
      titleMatches = true;
    }
  }

  if (!titleMatches) return false;

  // 2. Artist match condition
  const spotifyArtistsList = [];
  if (spotifyTrack.primaryArtist) spotifyArtistsList.push(spotifyTrack.primaryArtist);
  if (Array.isArray(spotifyTrack.artists)) {
    for (const a of spotifyTrack.artists) {
      const name = typeof a === "string" ? a : a?.name;
      if (name) spotifyArtistsList.push(name);
    }
  }
  if (spotifyTrack.artist) spotifyArtistsList.push(spotifyTrack.artist);

  const candArtistsList = [];
  if (candidate.primary_artists) candArtistsList.push(candidate.primary_artists);
  if (candidate.singers) candArtistsList.push(candidate.singers);
  if (candidate.artist) candArtistsList.push(candidate.artist);
  if (candidate.music) candArtistsList.push(candidate.music);
  if (candidate.all_artists) candArtistsList.push(candidate.all_artists);

  const normSourceArtists = spotifyArtistsList
    .map(normalizeArtist)
    .filter(Boolean);
  const normCandArtists = candArtistsList
    .map(normalizeArtist)
    .filter(Boolean);

  let artistMatches = false;

  for (const sArt of normSourceArtists) {
    if (!sArt || sArt.length < 2) continue;
    const sAlpha = cleanAlphaNum(sArt);
    for (const cArt of normCandArtists) {
      if (!cArt || cArt.length < 2) continue;
      const cAlpha = cleanAlphaNum(cArt);

      if (sAlpha === cAlpha) {
        artistMatches = true;
        break;
      }
      if (sAlpha.length >= 3 && cAlpha.includes(sAlpha)) {
        artistMatches = true;
        break;
      }
      if (cAlpha.length >= 3 && sAlpha.includes(cAlpha)) {
        artistMatches = true;
        break;
      }
      if (stringSimilarity(sArt, cArt) >= 0.70) {
        artistMatches = true;
        break;
      }
    }
    if (artistMatches) break;
  }

  // Token-level check (e.g. "Anirudh", "Arijit", "Rahman", "Shilpa", "Super Subu", "Lil", "Payyan")
  if (!artistMatches) {
    const sTokens = new Set(
      normSourceArtists
        .flatMap((a) => a.split(/\s+/))
        .filter((t) => t.length > 2)
    );
    const cTokens = new Set(
      normCandArtists
        .flatMap((a) => a.split(/\s+/))
        .filter((t) => t.length > 2)
    );
    for (const t of sTokens) {
      if (cTokens.has(t)) {
        artistMatches = true;
        break;
      }
    }
  }

  return titleMatches && artistMatches;
}

/**
 * Stage C: Intelligent candidate scoring engine.
 * - When candidate has the same title and same artist, guarantees 98-100 match score and exact match status.
 * - Otherwise scores via 5-signal relevance engine.
 */
export function scoreCandidate(spotifyTrack, candidate) {
  const isExact = isSameSongAndArtist(spotifyTrack, candidate);

  const sourceTitle = spotifyTrack.name || spotifyTrack.title || "";
  const normSourceTitle = normalizeTitle(sourceTitle);
  const normCandTitle = normalizeTitle(candidate.title || "");

  const artists = Array.isArray(spotifyTrack.artists) ? spotifyTrack.artists : [spotifyTrack.primaryArtist || spotifyTrack.artist || ""];
  const primaryArtist = typeof artists[0] === "string" ? artists[0] : artists[0]?.name || "";
  const normSourceArtist = normalizeArtist(primaryArtist);
  const normCandArtist = normalizeArtist(candidate.artist || candidate.primary_artists || candidate.singers || "");

  // If same song and artist match is confirmed:
  if (isExact) {
    const finalScore = candidate.audioUrl ? 100 : 98;
    return {
      score: finalScore,
      isExactMatch: true,
      details: {
        titleScore: 45,
        artistScore: 40,
        durationScore: 10,
        albumScore: 5,
        versionPenalty: 0,
      },
    };
  }

  // 1. Title Similarity (40%)
  const titleSim = stringSimilarity(normSourceTitle, normCandTitle);
  let titleScore = titleSim * 40;

  if (normSourceTitle === normCandTitle && normSourceTitle.length > 2) {
    titleScore = 40;
  }

  // 2. Artist Similarity (25%)
  let artistSim = stringSimilarity(normSourceArtist, normCandArtist);

  if (
    normSourceArtist.length > 3 &&
    normCandArtist.length > 3 &&
    (normCandArtist.includes(normSourceArtist) || normSourceArtist.includes(normCandArtist))
  ) {
    artistSim = Math.max(artistSim, 0.95);
  }

  if (artistSim < 0.85 && Array.isArray(spotifyTrack.artists)) {
    for (const art of spotifyTrack.artists) {
      const artName = typeof art === "string" ? art : art?.name || "";
      const normArt = normalizeArtist(artName);
      if (normArt && normCandArtist.includes(normArt)) {
        artistSim = Math.max(artistSim, 0.9);
      }
    }
  }
  const artistScore = artistSim * 25;

  // 3. Duration Similarity (15%)
  let durationScore = 0;
  const sourceDurationSec = Math.round((spotifyTrack.duration_ms || spotifyTrack.duration || 0) / 1000);
  const candDurationSec = parseInt(candidate.duration || 0, 10);

  if (sourceDurationSec > 0 && candDurationSec > 0) {
    const diff = Math.abs(sourceDurationSec - candDurationSec);
    if (diff <= 5) durationScore = 15;
    else if (diff <= 12) durationScore = 13;
    else if (diff <= 25) durationScore = 10;
    else if (diff <= 45) durationScore = 6;
    else if (diff <= 75) durationScore = 3;
    else durationScore = 0;
  } else {
    durationScore = 8;
  }

  // 4. Album / Movie Similarity (10%)
  let albumScore = 5;
  const sourceAlbum = spotifyTrack.album?.name || spotifyTrack.album || "";
  const candAlbum = candidate.album || "";
  if (sourceAlbum && candAlbum) {
    const albSim = stringSimilarity(normalizeTitle(sourceAlbum), normalizeTitle(candAlbum));
    albumScore = albSim * 10;
  }

  // 5. Version and Consistency (10%)
  const sourceRaw = ((spotifyTrack.name || "") + " " + sourceAlbum).toLowerCase();
  const candRaw = ((candidate.title || "") + " " + (candidate.album || "")).toLowerCase();

  const isSourceRemix = /\b(remix|mix|mashup|dj|slowed|reverb)\b/.test(sourceRaw);
  const isCandRemix = /\b(remix|mix|mashup|dj|slowed|reverb)\b/.test(candRaw);
  const isSourceLive = /\b(live|concert|tour)\b/.test(sourceRaw);
  const isCandLive = /\b(live|concert|tour)\b/.test(candRaw);
  const isSourceAcoustic = /\b(acoustic|unplugged)\b/.test(sourceRaw);
  const isCandAcoustic = /\b(acoustic|unplugged)\b/.test(candRaw);
  const isCandKaraoke = /\b(karaoke|backing track|instrumental)\b/.test(candRaw);
  const isCandCover = /\b(cover|tribute)\b/.test(candRaw);

  let versionPenalty = 0;
  let versionScore = 10;

  if (isCandKaraoke && !sourceRaw.includes("karaoke")) versionPenalty += 35;
  if (isCandCover && !sourceRaw.includes("cover")) versionPenalty += 30;
  if (!isSourceRemix && isCandRemix) versionPenalty += 25;
  if (isSourceRemix && !isCandRemix) versionPenalty += 15;
  if (!isSourceLive && isCandLive) versionPenalty += 20;
  if (isSourceAcoustic !== isCandAcoustic) versionPenalty += 10;

  let totalScore = Math.max(
    0,
    Math.min(100, Math.round(titleScore + artistScore + durationScore + albumScore + versionScore - versionPenalty))
  );

  if (titleSim < 0.35 || (normSourceArtist.length > 2 && artistSim === 0)) {
    totalScore = Math.min(totalScore, 45);
  }

  return {
    score: totalScore,
    isExactMatch: false,
    details: {
      titleScore: Math.round(titleScore),
      artistScore: Math.round(artistScore),
      durationScore: Math.round(durationScore),
      albumScore: Math.round(albumScore),
      versionPenalty,
    },
  };
}

/**
 * Matches a single Spotify track to JioSaavn candidates.
 * Accumulates candidates across progressive query tiers without dropping valid candidates.
 */
export async function matchSingleTrack(spotifyTrack) {
  const queries = generateProgressiveQueries(spotifyTrack);
  const seenCandidateIds = new Set();
  const allCandidates = [];

  for (const q of queries) {
    const list = await searchJioSaavnCandidates(q);
    for (const c of list) {
      if (!seenCandidateIds.has(c.id)) {
        seenCandidateIds.add(c.id);
        allCandidates.push(c);
      }
    }

    // Check if a definitive or high-confidence match is discovered
    const hasDefinitiveMatch = allCandidates.some((c) => {
      if (isSameSongAndArtist(spotifyTrack, c)) return true;
      const sc = scoreCandidate(spotifyTrack, c);
      return sc.score >= 85;
    });

    if (hasDefinitiveMatch) {
      break;
    }

    // Prevent excessive candidate pools while ensuring sufficient depth
    if (allCandidates.length >= 60) {
      break;
    }
  }

  if (allCandidates.length === 0) {
    return {
      status: "unmatched",
      score: 0,
      matchedTrack: null,
      alternatives: [],
    };
  }

  const scoredCandidates = allCandidates
    .map((cand) => {
      const scoring = scoreCandidate(spotifyTrack, cand);
      return {
        ...cand,
        isExactMatch: scoring.isExactMatch,
        matchScore: scoring.score,
        matchDetails: scoring.details,
      };
    })
    .sort((a, b) => {
      // 1. Exact match takes highest priority
      if (a.isExactMatch && !b.isExactMatch) return -1;
      if (!a.isExactMatch && b.isExactMatch) return 1;
      // 2. Higher match score
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      // 3. Audio URL available
      if (a.audioUrl && !b.audioUrl) return -1;
      if (!a.audioUrl && b.audioUrl) return 1;
      // 4. Higher popularity / play count
      return (b.playCount || 0) - (a.playCount || 0);
    });

  const bestCandidate = scoredCandidates[0];
  const alternatives = scoredCandidates.slice(1, 10);

  let status = "unmatched";
  let matchedTrack = null;

  if (bestCandidate) {
    if (bestCandidate.isExactMatch || bestCandidate.matchScore >= 80) {
      status = "matched";
      matchedTrack = bestCandidate;
    } else if (bestCandidate.matchScore >= 50) {
      status = "review";
      matchedTrack = bestCandidate;
    } else {
      // Low confidence (< 50%): keep status as unmatched.
      // Do NOT substitute an unrelated song as matchedTrack.
      // Candidate remains available in alternatives for manual selection.
      status = "unmatched";
      matchedTrack = null;
    }
  }

  return {
    status,
    score: bestCandidate ? bestCandidate.matchScore : 0,
    matchedTrack,
    alternatives,
  };
}

/**
 * Concurrently matches a list of Spotify tracks with bounded concurrency to prevent API flooding.
 * Concurrency limit: 3 parallel tasks.
 */
export async function matchPlaylistTracks(tracks, onProgress) {
  if (!Array.isArray(tracks) || tracks.length === 0) return [];

  const results = new Array(tracks.length);
  const concurrency = 3;
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (cursor < tracks.length) {
      const currentIndex = cursor++;
      const track = tracks[currentIndex];
      try {
        const matchResult = await matchSingleTrack(track);
        results[currentIndex] = {
          spotifyTrack: track,
          status: matchResult.status,
          score: matchResult.score,
          matchedTrack: matchResult.matchedTrack,
          alternatives: matchResult.alternatives,
          userSelectedTrack: null,
          skipped: false,
        };
      } catch (err) {
        console.warn(`[Matcher Service] Error matching track index ${currentIndex}:`, err);
        results[currentIndex] = {
          spotifyTrack: track,
          status: "unmatched",
          score: 0,
          matchedTrack: null,
          alternatives: [],
          userSelectedTrack: null,
          skipped: false,
        };
      }
      completed++;
      if (typeof onProgress === "function") {
        onProgress(completed, tracks.length);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, tracks.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}
