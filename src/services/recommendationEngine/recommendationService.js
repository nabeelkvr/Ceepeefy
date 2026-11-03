/**
 * Hybrid Recommendation Engine — Master Service
 *
 * Implements:
 * - 10-minute in-memory cache with user-level cache invalidation
 * - Dynamic Candidate Retrieval & Filtering
 * - Hybrid scoring (Content, Collaborative, Recency, Popularity, Exploration, Skip Penalty)
 * - Diversity enforcement (max 2 per artist, 3+ genres)
 * - Cold-start handling for new listeners
 * - Refresh seed rotation
 */

import { RECOMMENDATION_CONFIG } from "./config.js";
import { buildTasteProfile } from "./tasteProfile.js";
import { scoreCandidateTrack } from "./scorer.js";
import {
  filterExclusions,
  selectDiverseRecommendations,
  selectColdStartRecommendations,
} from "./diversity.js";
import { getAllCandidatePool } from "../../utils/personalizedRecommendations.js";

// In-memory 10-minute cache: userId:seed -> { timestamp, recommendations }
const recommendationCache = new Map();

/**
 * Invalidates cached recommendations for a specific user, or all users if omitted
 * Triggered when a user likes, skips, or finishes a song.
 */
export function invalidateRecommendationCache(userId = null) {
  if (!userId) {
    recommendationCache.clear();
    return;
  }
  const prefix = `${String(userId).toLowerCase()}:`;
  for (const key of recommendationCache.keys()) {
    if (key.startsWith(prefix) || key.startsWith(`${userId}:`)) {
      recommendationCache.delete(key);
    }
  }
}

/**
 * Main recommendation generation function
 *
 * @param {string|null} userId - The user identifier
 * @param {number} [limit=8] - Target count of recommendations
 * @param {object} [options]
 * @param {Array<object>} [options.candidatePool] - Optional custom catalog pool
 * @param {Array<object>} [options.recentlyPlayed] - User's play history
 * @param {Array<object|string>} [options.likedTracks] - User's liked tracks
 * @param {Array<object>} [options.customPlaylists] - User's playlists
 * @param {Array<object|string>} [options.skips] - Skipped tracks
 * @param {number} [options.seed=0] - Random seed for refresh rotation
 * @param {boolean} [options.bypassCache=false] - Force cache bypass
 * @param {object} [options.collaborativeSignals] - Optional collaborative scoring provider
 * @returns {Array<object>} Recommended tracks with id, title, artist, album, coverUrl, score, reason
 */
export function getRecommendations(userId = null, limit = 8, options = {}) {
  const {
    candidatePool = getAllCandidatePool(),
    recentlyPlayed = [],
    likedTracks = [],
    customPlaylists = [],
    skips = [],
    seed = 0,
    bypassCache = false,
    collaborativeSignals = null,
  } = options;

  const targetLimit = Number(limit) || RECOMMENDATION_CONFIG.diversity.defaultLimit;
  const userKey = userId ? String(userId).toLowerCase() : "anonymous";
  const cacheKey = `${userKey}:seed_${seed}:limit_${targetLimit}`;

  // 1. Check in-memory cache
  if (!bypassCache && recommendationCache.has(cacheKey)) {
    const cached = recommendationCache.get(cacheKey);
    const now = Date.now();
    if (now - cached.timestamp < RECOMMENDATION_CONFIG.cache.ttlMs) {
      return cached.recommendations;
    }
    recommendationCache.delete(cacheKey);
  }

  // 2. Build User Taste Profile
  const tasteProfile = buildTasteProfile({
    recentlyPlayed,
    likedTracks,
    customPlaylists,
    skips,
  });

  // 3. Cold Start Check: If no user history or likes, use diverse curated cold-start
  if (!tasteProfile.hasHistory) {
    const coldStart = selectColdStartRecommendations(candidatePool, targetLimit, seed);
    recommendationCache.set(cacheKey, {
      timestamp: Date.now(),
      recommendations: coldStart,
    });
    return coldStart;
  }

  // 4. Candidate Exclusion Filtering (24h exclusion, liked exclusion, recent skips)
  const eligibleCandidates = filterExclusions(candidatePool, tasteProfile, targetLimit);

  // 5. Score Candidates
  const scoredItems = eligibleCandidates.map((candidate) =>
    scoreCandidateTrack(candidate, tasteProfile, {
      collaborativeSignals,
      seed,
    })
  );

  // 6. Sort by score descending
  scoredItems.sort((a, b) => b.score - a.score);

  // 7. Select diverse recommendations (max 2 per artist, 3+ genres)
  const finalRecommendations = selectDiverseRecommendations(scoredItems, targetLimit);

  // 8. Cache result
  recommendationCache.set(cacheKey, {
    timestamp: Date.now(),
    recommendations: finalRecommendations,
  });

  return finalRecommendations;
}

