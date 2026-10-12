import CryptoJS from "crypto-js";

/**
 * In-memory LRU-like cache for candidate search queries to prevent redundant external API hits.
 * TTL: 15 minutes.
 */
const candidateCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

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
  } catch {
    return null;
  }
}

function cleanHtml(str) {
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

/**
 * Normalizes title for search & comparison:
 * Removes (feat. ...), [with ...], (from "movie"), soundtrack tags, punctuation.
 */
export function normalizeTitle(t) {
  if (!t) return "";
  return t
    .toLowerCase()
    .replace(/&quot;/g, "")
    .replace(/&#039;/g, "")
    .replace(/&#39;/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s*[\(\[](?:from|feat\.?|with|soundtrack|version|remix|acoustic|karaoke|live|original motion picture)[^\)\]]*[\)\]]/gi, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Normalizes artist name: lowercases and removes punctuation.
 */
export function normalizeArtist(a) {
  if (!a) return "";
  return a
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
 * Common Indian language transliteration and spelling mappings.
 */
const TRANSLITERATION_MAP = {
  "kannazhaga": "kannazhagaa",
  "vaathi coming": "vathi coming",
  "jimikki": "entammede jimikki",
  "aaradhike": "aaradhike ambili",
  "rowdy baby": "rowdy baby maari 2",
  "arabic kuthu": "arabic kuthu halamithi habibo",
  "tum hi ho": "tum hi ho aashiqui 2",
};

/**
 * Stage A: Generate progressive queries for JioSaavn candidate retrieval.
 */
export function generateProgressiveQueries(track) {
  const title = (track.name || track.title || "").trim();
  const artists = Array.isArray(track.artists) ? track.artists : [track.primaryArtist || track.artist || ""];
  const primaryArtist = (typeof artists[0] === "string" ? artists[0] : artists[0]?.name || "").trim();
  const secondaryArtist = (typeof artists[1] === "string" ? artists[1] : artists[1]?.name || "").trim();
  const album = (track.album?.name || track.album || "").trim();
  const normTitle = normalizeTitle(title);

  const queries = [];

  // Query 1: Exact original title + primary artist
  if (title && primaryArtist) {
    queries.push(`${title} ${primaryArtist}`.trim());
  }

  // Query 2: Normalized title + primary artist
  if (normTitle && normTitle !== title.toLowerCase() && primaryArtist) {
    queries.push(`${normTitle} ${primaryArtist}`.trim());
  }

  // Query 3: Title + secondary credited artist
  if (title && secondaryArtist) {
    queries.push(`${title} ${secondaryArtist}`.trim());
  }

  // Query 4: Original title + album/movie name
  if (title && album && album.toLowerCase() !== title.toLowerCase()) {
    queries.push(`${title} ${album}`.trim());
  }

  // Query 5: Alternate spelling / transliteration
  const lowerTitle = title.toLowerCase();
  for (const [key, alt] of Object.entries(TRANSLITERATION_MAP)) {
    if (lowerTitle.includes(key)) {
      queries.push(`${alt} ${primaryArtist}`.trim());
      break;
    }
  }

  // Query 6: Normalized title alone
  if (normTitle) {
    queries.push(normTitle);
  }

  // Query 7: Broad title alone
  queries.push(title);

  // Return unique queries
  return [...new Set(queries.filter(Boolean))];
}

/**
 * Searches JioSaavn for candidate tracks with in-memory caching.
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
    const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&q=${encodeURIComponent(cleanQ)}&p=1&n=12`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) return [];
    const data = await res.json();
    const results = data.results || [];

    const candidates = results.map((s) => {
      let directAudioUrl = null;
      const encUrl = s.more_info?.encrypted_media_url || s.encrypted_media_url;
      if (encUrl) {
        const rawDecrypted = decryptMediaUrl(encUrl);
        if (rawDecrypted && rawDecrypted.startsWith("http")) {
          directAudioUrl = rawDecrypted.replace(/_96\.mp4/, "_320.mp4");
        }
      }

      const durSec = parseInt(s.duration || s.more_info?.duration || "0", 10);
      const cleanTitle = cleanHtml(s.song || s.title);
      const cleanArtist = cleanHtml(s.primary_artists || s.singers || s.music || "Various Artists");
      const cleanAlbum = cleanHtml(s.album || s.more_info?.album || "");

      return {
        id: String(s.id),
        title: cleanTitle,
        artist: cleanArtist,
        primary_artists: cleanArtist,
        singers: cleanArtist,
        album: cleanAlbum,
        album_id: s.albumid || s.more_info?.album_id || "",
        duration: durSec,
        durationFormatted: formatDuration(durSec),
        audioUrl: directAudioUrl,
        coverUrl: (s.image || "").replace(/50x50|150x150/, "500x500"),
        year: s.year || s.more_info?.year || null,
        language: (s.language || s.more_info?.language || "").toLowerCase(),
      };
    });

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
 * Stage C: 5-signal scoring engine.
 * - Title similarity: 40%
 * - Artist similarity: 25%
 * - Duration similarity: 15%
 * - Album/movie similarity: 10%
 * - Version & Language consistency: 10%
 */
export function scoreCandidate(spotifyTrack, candidate) {
  const sourceTitle = spotifyTrack.name || spotifyTrack.title || "";
  const normSourceTitle = normalizeTitle(sourceTitle);
  const normCandTitle = normalizeTitle(candidate.title || "");

  const artists = Array.isArray(spotifyTrack.artists) ? spotifyTrack.artists : [spotifyTrack.primaryArtist || spotifyTrack.artist || ""];
  const primaryArtist = typeof artists[0] === "string" ? artists[0] : artists[0]?.name || "";
  const normSourceArtist = normalizeArtist(primaryArtist);
  const normCandArtist = normalizeArtist(candidate.artist || candidate.primary_artists || candidate.singers || "");

  // 1. Title Similarity (40%)
  const titleSim = stringSimilarity(normSourceTitle, normCandTitle);
  let titleScore = titleSim * 40;

  // Exact title bonus
  if (normSourceTitle === normCandTitle && normSourceTitle.length > 2) {
    titleScore = 40;
  }

  // 2. Artist Similarity (25%)
  let artistSim = stringSimilarity(normSourceArtist, normCandArtist);

  // Containment check (e.g. "Anirudh Ravichander" within "Anirudh Ravichander, Super Subu")
  if (
    normSourceArtist.length > 3 &&
    normCandArtist.length > 3 &&
    (normCandArtist.includes(normSourceArtist) || normSourceArtist.includes(normCandArtist))
  ) {
    artistSim = Math.max(artistSim, 0.95);
  }

  // Check additional credited artists
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
    if (diff <= 3) durationScore = 15;
    else if (diff <= 8) durationScore = 13;
    else if (diff <= 15) durationScore = 10;
    else if (diff <= 30) durationScore = 6;
    else if (diff <= 60) durationScore = 2;
    else durationScore = 0;
  } else {
    // Missing duration gives neutral default so it doesn't arbitrarily disqualify
    durationScore = 8;
  }

  // 4. Album / Movie Similarity (10%)
  let albumScore = 5; // neutral baseline
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

  // Critical Safeguard: If title similarity is below 0.3 or artist has complete mismatch, cap score below 60
  if (titleSim < 0.35 || (normSourceArtist.length > 2 && artistSim === 0)) {
    totalScore = Math.min(totalScore, 55);
  }

  return {
    score: totalScore,
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
    // If we already have strong candidates, we don't need to exhaust all query tiers
    if (allCandidates.length >= 8) break;
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
        matchScore: scoring.score,
        matchDetails: scoring.details,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);

  const bestCandidate = scoredCandidates[0];
  const alternatives = scoredCandidates.slice(1, 5);

  let status = "unmatched";
  if (bestCandidate && bestCandidate.matchScore >= 90) {
    status = "matched";
  } else if (bestCandidate && bestCandidate.matchScore >= 75) {
    status = "review";
  }

  return {
    status,
    score: bestCandidate ? bestCandidate.matchScore : 0,
    matchedTrack: bestCandidate || null,
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

function formatDuration(secs) {
  if (isNaN(secs) || secs <= 0) return "3:30";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}
