/**
 * Adaptive Recommendation Layer for Ceepeefy
 *
 * Implements a Spotify-inspired candidate generation, normalization,
 * scoring, and deduplication pipeline that feeds the existing queue algorithm.
 * 
 * Preserves the existing queue selection algorithm as the trusted decision-maker,
 * while ensuring diverse, context-aware, non-repetitive inputs.
 */

import {
  normalizeTrackId,
  getTrackCompositeKey,
  areTracksEqual,
  createTrackDeduplicator,
  normalizeTitleForIdentity,
  normalizePrimaryArtist,
} from "./trackIdentity.js";
import { classifySongDetailed } from "./songClassifier.js";
import { generateRecommendedQueue, cleanStr, extractLanguage } from "./recommendationEngine.js";

/**
 * Default configuration for adaptive candidate scoring and filtering
 */
export const ADAPTIVE_CONFIG = {
  targetQueueSize: 10,
  replenishmentThreshold: 4,
  recentHistoryWindowSize: 25,
  maxTracksPerArtistInPool: 3,
  strictLanguageDefault: true,
  weights: {
    directRecommendation: 35, // From reco.getreco or webradio
    sameArtist: 30,
    relatedArtist: 18,
    languageMatch: 25,
    moodMatch: 20,
    genreMatch: 12,
    energyMatch: 10,
    popularity: 15,
    userLikedBonus: 25,
    userCompletedBonus: 8,
    skipPenalty: 40,
    recentPlayPenalty: 45,
    recentQueuePenalty: 30,
  },
};

/**
 * Normalizes a raw candidate track into a clean, standard shape.
 */
export function normalizeCandidateTrack(raw) {
  if (!raw) return null;

  const id = normalizeTrackId(raw.id || raw.songId);
  const title = (raw.title || raw.song || raw.name || "").trim();
  const artist = (raw.artist || raw.primary_artist || raw.primaryArtist || raw.singers || "").trim();

  if (!id && !title) return null;

  const album = (raw.album || raw.albumName || raw.movieName || raw.movie || "").trim();
  const coverUrl =
    raw.coverUrl ||
    raw.thumbnail ||
    raw.image ||
    (Array.isArray(raw.image) && raw.image[raw.image.length - 1]?.url) ||
    null;

  const duration = Number(raw.duration || 210);
  const m = Math.floor(duration / 60);
  const s = Math.floor(duration % 60);
  const durationFormatted = raw.durationFormatted || `${m}:${s < 10 ? "0" : ""}${s}`;

  const lang = (raw.language || raw.more_info?.language || extractLanguage(raw) || "").toLowerCase().trim();

  return {
    ...raw,
    id: id || raw.id,
    canonicalId: id,
    title,
    artist,
    primary_artist: raw.primary_artist || raw.primaryArtist || artist.split(",")[0].trim(),
    primaryArtist: raw.primaryArtist || raw.primary_artist || artist.split(",")[0].trim(),
    album,
    coverUrl,
    audioUrl: raw.audioUrl || null,
    duration,
    durationFormatted,
    language: lang,
    source: raw.source || "adaptive_recommendation",
    play_count: Number(raw.play_count || raw.playCount || raw.plays || 0),
    chartRank: raw.chartRank || null,
    isTrending: Boolean(raw.isTrending || raw.chartRank),
  };
}

/**
 * Filters and validates candidate pool for a given seed track context.
 */
export function filterCandidatePool(candidates, currentTrack, options = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const {
    upcomingTracks = [],
    recentlyPlayedTracks = [],
    manualQueueTracks = [],
    preferredLanguage = null,
    strictLanguage = true,
  } = options;

  const deduplicator = createTrackDeduplicator();

  // 1. Exclude current track
  if (currentTrack) {
    deduplicator.add(currentTrack);
  }

  // 2. Exclude upcoming queue entries (both manual and auto)
  upcomingTracks.forEach((t) => deduplicator.add(t));
  manualQueueTracks.forEach((t) => deduplicator.add(t));

  // 3. Exclude recently played tracks (within window)
  const historyWindow = recentlyPlayedTracks.slice(-ADAPTIVE_CONFIG.recentHistoryWindowSize);
  historyWindow.forEach((t) => deduplicator.add(t));

  // 4. Exclude recently queued tracks only if candidate pool has plenty of fresh alternative tracks
  const recentQueueIds = options.recentQueueTrackIds || options.recentlyRecommendedIds;
  if (recentQueueIds && candidates.length > 20) {
    const recentQueueSet = new Set(
      (Array.isArray(recentQueueIds)
        ? recentQueueIds
        : recentQueueIds instanceof Set
          ? Array.from(recentQueueIds)
          : String(recentQueueIds || "").split(",")
      )
        .map((s) => String(s).trim())
        .filter(Boolean)
    );

    const isRecent = (raw) => {
      if (!raw) return false;
      const id = normalizeTrackId(raw.id || raw.songId);
      const rawId = String(raw.id || "");
      const baseTitle = normalizeTitleForIdentity(raw.title || raw.song || "");
      return (
        recentQueueSet.has(id) ||
        recentQueueSet.has(rawId) ||
        Boolean(baseTitle && (recentQueueSet.has(baseTitle) || recentQueueSet.has(`title:${baseTitle}`)))
      );
    };

    const freshCount = candidates.filter((c) => !isRecent(c) && !deduplicator.has(c)).length;
    // Only exclude from candidate pool if there are at least 12 fresh alternative candidates
    if (freshCount >= 12) {
      candidates.forEach((raw) => {
        if (isRecent(raw)) {
          deduplicator.add(raw);
        }
      });
    }
  }

  // Determine active target language
  const targetLang = (
    preferredLanguage ||
    currentTrack?.language ||
    currentTrack?.more_info?.language ||
    extractLanguage(currentTrack) ||
    ""
  ).toLowerCase().trim();

  const currentProfile = currentTrack ? classifySongDetailed(currentTrack) : null;
  const filtered = [];
  const artistCounts = new Map();

  for (const raw of candidates) {
    const track = normalizeCandidateTrack(raw);
    if (!track) continue;

    // Check deduplication (both canonical ID and composite key)
    if (deduplicator.has(track)) continue;

    // Language filtering
    if (targetLang && strictLanguage) {
      const candLang = (track.language || extractLanguage(track) || "").toLowerCase().trim();
      if (candLang && candLang !== targetLang) {
        continue; // Strictly reject cross-language candidate
      }
    }

    // Song type matching: vocal vs BGM
    if (currentProfile) {
      const candProfile = classifySongDetailed(track);
      if (currentProfile.isBgm !== candProfile.isBgm) {
        continue;
      }
    }

    // Artist diversity cap in candidate pool
    const primaryArt = normalizePrimaryArtist(track.artist || track.primary_artist);
    if (primaryArt) {
      const count = artistCounts.get(primaryArt) || 0;
      if (count >= ADAPTIVE_CONFIG.maxTracksPerArtistInPool) {
        continue;
      }
      artistCounts.set(primaryArt, count + 1);
    }

    deduplicator.add(track);
    filtered.push(track);
  }

  return filtered;
}

/**
 * Computes an adaptive relevance score for a candidate given current listening context.
 */
export function scoreAdaptiveCandidate(candidate, currentTrack, context = {}) {
  const {
    userLikes = new Set(),
    userSkips = new Map(), // trackId/key -> skipCount
    userCompletions = new Set(),
    recentlyRecommendedIds = new Set(),
    recentlyPlayedIds = new Set(),
  } = context;

  const weights = ADAPTIVE_CONFIG.weights;
  let score = 0;
  const explanations = [];

  const seedArtists = currentTrack ? cleanStr(currentTrack.artist || currentTrack.primary_artist || "").split(" ") : [];
  const candArtists = cleanStr(candidate.artist || candidate.primary_artist || "").split(" ");
  const isSameArtist = seedArtists.length > 0 && candArtists.some((a) => a.length >= 3 && seedArtists.includes(a));

  // 1. Direct Recommendation Source
  if (candidate.source === "reco" || candidate.source === "webradio") {
    score += weights.directRecommendation;
    explanations.push("Recommended for Current Song");
  }

  // 2. Artist Continuity
  if (isSameArtist) {
    score += weights.sameArtist;
    explanations.push("Same Artist");
  }

  // 3. Language Alignment
  const seedLang = (currentTrack?.language || extractLanguage(currentTrack) || "").toLowerCase().trim();
  const candLang = (candidate.language || extractLanguage(candidate) || "").toLowerCase().trim();
  if (seedLang && candLang && seedLang === candLang) {
    score += weights.languageMatch;
    explanations.push("Language Match");
  }

  // 4. Mood and Energy Alignment
  if (currentTrack) {
    const seedProf = classifySongDetailed(currentTrack);
    const candProf = classifySongDetailed(candidate);

    if (seedProf.primaryMood === candProf.primaryMood) {
      score += weights.moodMatch;
      explanations.push("Similar Mood");
    } else if (seedProf.moodCategories.some((m) => candProf.moodCategories.includes(m))) {
      score += weights.moodMatch * 0.6;
    }

    const energyDiff = Math.abs(seedProf.energyLevel - candProf.energyLevel);
    if (energyDiff === 0) score += weights.energyMatch;
    else if (energyDiff === 1) score += weights.energyMatch * 0.7;
  }

  // 5. Popularity and Chart Performance (Balanced, not overwhelming)
  if (candidate.chartRank && candidate.chartRank <= 25) {
    score += Math.min(weights.popularity, (26 - candidate.chartRank) * 0.6);
    explanations.push("Trending");
  } else if (candidate.play_count >= 1000000) {
    score += 8;
  }

  // 6. User Feedback Signals
  const cid = normalizeTrackId(candidate.id);
  const compKey = getTrackCompositeKey(candidate);

  if (userLikes.has(cid) || userLikes.has(compKey)) {
    score += weights.userLikedBonus;
    explanations.push("Liked Song");
  }

  if (userCompletions.has(cid) || userCompletions.has(compKey)) {
    score += weights.userCompletedBonus;
  }

  const skips = (userSkips.get(cid) || 0) + (userSkips.get(compKey) || 0);
  if (skips > 0) {
    score -= Math.min(60, skips * weights.skipPenalty);
  }

  // 7. Repetition Penalties
  const recentRecos = context.recentlyRecommendedIds || context.recentQueueTrackIds || new Set();
  const recentRecosSet =
    recentRecos instanceof Set
      ? recentRecos
      : new Set(
          (Array.isArray(recentRecos)
            ? recentRecos
            : String(recentRecos || "").split(",")
          )
            .map((s) => String(s).trim())
            .filter(Boolean)
        );

  const rawId = String(candidate.id || "");
  const baseTitle = normalizeTitleForIdentity(candidate.title || candidate.song || "");

  if (recentlyPlayedIds.has(cid) || recentlyPlayedIds.has(compKey) || (rawId && recentlyPlayedIds.has(rawId))) {
    score -= weights.recentPlayPenalty;
  }

  if (
    recentRecosSet.has(cid) ||
    recentRecosSet.has(compKey) ||
    (rawId && recentRecosSet.has(rawId)) ||
    (baseTitle && (recentRecosSet.has(baseTitle) || recentRecosSet.has(`title:${baseTitle}`)))
  ) {
    score -= weights.recentQueuePenalty;
  }

  return {
    score: Math.max(0, score),
    explanations,
    isSameArtist,
  };
}

/**
 * Main coordinator: Gathers, deduplicates, scores candidates,
 * and feeds them to the trusted queue selection algorithm.
 */
export function buildAdaptiveQueue(currentTrack, rawCandidates, options = {}) {
  if (!currentTrack || !Array.isArray(rawCandidates) || rawCandidates.length === 0) {
    return [];
  }

  const maxResults = options.maxResults || ADAPTIVE_CONFIG.targetQueueSize;

  // 1. Filter and deduplicate candidates
  const eligiblePool = filterCandidatePool(rawCandidates, currentTrack, options);

  if (eligiblePool.length === 0) {
    return [];
  }

  // 2. Score candidates with adaptive layer to annotate contextual priority
  const scoredPool = eligiblePool.map((track) => {
    const evalResult = scoreAdaptiveCandidate(track, currentTrack, options);
    return {
      ...track,
      adaptiveScore: evalResult.score,
      adaptiveExplanations: evalResult.explanations,
      isSameArtist: evalResult.isSameArtist,
    };
  });

  // Sort by adaptive score descending so highest-affinity candidates enter queue algorithm first
  scoredPool.sort((a, b) => b.adaptiveScore - a.adaptiveScore);

  // 3. Delegate to the trusted existing queue selection algorithm (generateRecommendedQueue)
  // This preserves the exact 100-point hierarchy, priority tiers, and slot sequencing.
  const queueResult = generateRecommendedQueue(currentTrack, scoredPool, {
    excludeIds: options.excludeIds || [],
    recentQueueTrackIds: options.recentQueueTrackIds || [],
    sessionPlayedIds: options.recentlyPlayedTracks || [],
    maxResults,
  });

  return queueResult;
}
