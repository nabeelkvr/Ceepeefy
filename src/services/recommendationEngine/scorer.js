/**
 * Hybrid Recommendation Scorer
 * 
 * Implements the hybrid scoring formula:
 * score = 0.40 * contentScore
 *       + 0.25 * collaborativeScore
 *       + 0.15 * recencyScore
 *       + 0.10 * popularityScore
 *       + 0.10 * explorationBonus
 *       - skipPenalty
 *
 * Automatically redistributes collaborativeScore weight (0.25) to contentScore (0.65)
 * when multi-user collaborative data is not available.
 */

import { RECOMMENDATION_CONFIG } from "./config.js";
import { cleanStr, extractArtists, normalizeMovieAlbum } from "../../utils/recommendationEngine.js";
import { classifySongDetailed } from "../../utils/songClassifier.js";

/**
 * Computes cosine similarity between two key-value vectors (Maps or Objects).
 * dot(A, B) / (norm(A) * norm(B))
 */
export function computeCosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  const getA = (k) => (vecA instanceof Map ? vecA.get(k) || 0 : vecA[k] || 0);
  const getB = (k) => (vecB instanceof Map ? vecB.get(k) || 0 : vecB[k] || 0);

  const keysA = vecA instanceof Map ? Array.from(vecA.keys()) : Object.keys(vecA);
  const keysB = vecB instanceof Map ? Array.from(vecB.keys()) : Object.keys(vecB);
  const allKeys = new Set([...keysA, ...keysB]);

  for (const k of allKeys) {
    const valA = getA(k);
    const valB = getB(k);
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  if (normA <= 0 || normB <= 0) return 0;
  return Math.min(1, Math.max(0, dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))));
}

/**
 * Deterministic pseudo-random float generator in [0, 1) based on a string key and seed
 */
export function seededRandom(key, seed = 0) {
  let h = 0x811c9dc5 ^ seed;
  const str = String(key);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Calculates contentScore comparing candidate song to the user taste profile
 */
export function calculateContentScore(candidate, tasteProfile) {
  if (!tasteProfile.hasHistory) {
    return 0.5; // neutral baseline for cold start
  }

  const candArtists = extractArtists(candidate);
  const classified = classifySongDetailed(candidate);
  const candGenre = (candidate.genre || classified?.genre || "").toLowerCase().trim();
  const candMood = (classified?.mood || candidate.mood || "").toLowerCase().trim();
  const candLang = (classified?.language || candidate.language || "").toLowerCase().trim();

  // 1. Artist alignment
  let artistMatch = 0;
  candArtists.forEach((art) => {
    const prop = tasteProfile.artistProfile.proportions.get(art) || 0;
    if (prop > artistMatch) artistMatch = prop;
  });
  // Cap and scale artist match
  const artistScore = Math.min(1.0, artistMatch * 2.5);

  // 2. Genre alignment
  const genreProp = candGenre ? tasteProfile.genreProfile.proportions.get(candGenre) || 0 : 0;
  const genreScore = Math.min(1.0, genreProp * 2.0);

  // 3. Mood alignment
  const moodProp = candMood ? tasteProfile.moodProfile.proportions.get(candMood) || 0 : 0;
  const moodScore = Math.min(1.0, moodProp * 2.0);

  // 4. Tempo / Energy alignment
  const candEnergy = classified?.energy || (candidate.tempo > 125 ? 5 : candidate.tempo < 85 ? 2 : 3);
  const candTempoCategory = candEnergy <= 2 ? "slow" : candEnergy >= 5 ? "fast" : "medium";
  const totalTempoWeight =
    tasteProfile.tempoWeights.slow + tasteProfile.tempoWeights.medium + tasteProfile.tempoWeights.fast;
  const tempoScore =
    totalTempoWeight > 0 ? (tasteProfile.tempoWeights[candTempoCategory] || 0) / totalTempoWeight : 0.5;

  // 5. Language alignment
  const langProp = candLang ? tasteProfile.languageProfile.proportions.get(candLang) || 0 : 0;
  const langScore = Math.min(1.0, langProp * 2.2);

  // Weighted composite content similarity
  const contentScore =
    artistScore * 0.35 +
    genreScore * 0.25 +
    moodScore * 0.15 +
    tempoScore * 0.10 +
    langScore * 0.15;

  return Math.min(1.0, Math.max(0, contentScore));
}

/**
 * Calculates recencyScore based on release date & recently listened artists
 */
export function calculateRecencyScore(candidate, tasteProfile, nowYear = new Date().getFullYear()) {
  let score = 0;

  // 1. Release era closeness
  const releaseYear = candidate.year || candidate.releaseYear || candidate.release_date?.substring(0, 4);
  if (releaseYear) {
    const yearDiff = Math.max(0, nowYear - parseInt(releaseYear, 10));
    // New releases (last 1-2 years) get high score
    const yearScore = Math.max(0, 1 - yearDiff / 15);
    score += yearScore * 0.5;
  } else {
    score += 0.25; // default moderate score
  }

  // 2. Artist recency bonus (if user recently listened to this artist in their top 3 recent plays)
  const candArtists = extractArtists(candidate);
  const hasRecentArtist = candArtists.some((art) => tasteProfile.mostRecentArtists.includes(art));
  if (hasRecentArtist) {
    score += 0.5;
  }

  return Math.min(1.0, Math.max(0, score));
}

/**
 * Calculates normalized popularityScore using log scale
 */
export function calculatePopularityScore(candidate, maxPlays = 500000) {
  const plays = Number(candidate.playCount || candidate.play_count || candidate.plays || 0);
  if (plays <= 0) {
    // Curated high-badge tracks get a slight popularity boost even without explicit play counts
    if (candidate.badge === "Master" || candidate.badge === "Dolby Atmos") {
      return 0.45;
    }
    return 0.25; // Safe default for catalog songs
  }

  const logPlays = Math.log10(1 + plays);
  const logMax = Math.log10(1 + Math.max(maxPlays, plays));
  return Math.min(1.0, Math.max(0, logPlays / logMax));
}

/**
 * Calculates explorationBonus for refreshing discoveries outside top taste
 */
export function calculateExplorationBonus(candidate, tasteProfile, seed = 0) {
  const tid = String(candidate.id);
  const candArtists = extractArtists(candidate);
  const classified = classifySongDetailed(candidate);
  const candGenre = (candidate.genre || classified?.genre || "").toLowerCase().trim();

  // If artist is NOT in the user's top familiar artists, candidate qualifies for exploration
  const isFamiliarArtist = candArtists.some(
    (art) => (tasteProfile.artistProfile.proportions.get(art) || 0) > 0.08
  );
  const isFamiliarGenre = candGenre && (tasteProfile.genreProfile.proportions.get(candGenre) || 0) > 0.15;

  let baseExploration = 0.2;
  if (!isFamiliarArtist) baseExploration += 0.5;
  if (!isFamiliarGenre) baseExploration += 0.3;

  // Add deterministic pseudo-random noise based on seed for rotating discoveries on refresh
  const noise = seededRandom(`${tid}_seed${seed}`, seed * 7919);
  return Math.min(1.0, Math.max(0, baseExploration * 0.6 + noise * 0.4));
}

/**
 * Calculates skipPenalty
 */
export function calculateSkipPenalty(candidate, tasteProfile) {
  const tid = String(candidate.id);
  if (tasteProfile.skippedIds.has(tid)) {
    return 1.0; // Maximum penalty for explicitly skipped song
  }

  const candArtists = extractArtists(candidate);
  let artistSkips = 0;
  candArtists.forEach((art) => {
    artistSkips += tasteProfile.skippedArtists.get(art) || 0;
  });

  if (artistSkips >= 3) return 0.7;
  if (artistSkips >= 1) return 0.3;
  return 0.0;
}

/**
 * Generates an intuitive human-readable reason string for UI
 */
export function generateRecommendationReason(candidate, tasteProfile, breakdown) {
  if (!tasteProfile.hasHistory) {
    if (candidate.badge) return `Trending • ${candidate.badge}`;
    return "Popular right now";
  }

  const candArtists = extractArtists(candidate);
  const classified = classifySongDetailed(candidate);

  // Check top matching artist
  let topArtist = "";
  let highestArtistWeight = 0;
  candArtists.forEach((art) => {
    const w = tasteProfile.artistProfile.weights.get(art) || 0;
    if (w > highestArtistWeight) {
      highestArtistWeight = w;
      topArtist = art;
    }
  });

  if (topArtist && highestArtistWeight > 1.5) {
    const formattedArtist = candidate.artist?.split(/[,&]/)[0]?.trim() || topArtist;
    return `Because you like ${formattedArtist}`;
  }

  // Check recent artist match
  const recentArtistMatch = candArtists.find((art) => tasteProfile.mostRecentArtists.includes(art));
  if (recentArtistMatch) {
    const formattedArtist = candidate.artist?.split(/[,&]/)[0]?.trim() || recentArtistMatch;
    return `Similar to your recent plays of ${formattedArtist}`;
  }

  // Genre match
  const genre = candidate.genre || classified?.genre;
  if (genre && (tasteProfile.genreProfile.proportions.get(genre.toLowerCase().trim()) || 0) > 0.15) {
    return `Top pick in ${genre}`;
  }

  // Mood match
  const mood = classified?.mood || candidate.mood;
  if (mood && (tasteProfile.moodProfile.proportions.get(mood.toLowerCase().trim()) || 0) > 0.15) {
    return `Matches your ${mood} vibe`;
  }

  // New release
  if (breakdown.recencyScore > 0.75) {
    return `Fresh release • ${candidate.artist}`;
  }

  // Exploration
  if (breakdown.explorationBonus > 0.6) {
    return "Fresh discovery for you";
  }

  return "Suggested for you";
}

/**
 * Scores a candidate track using the hybrid recommendation formula
 */
export function scoreCandidateTrack(candidate, tasteProfile, options = {}) {
  const { collaborativeSignals = null, seed = 0 } = options;

  const contentScore = calculateContentScore(candidate, tasteProfile);
  const recencyScore = calculateRecencyScore(candidate, tasteProfile);
  const popularityScore = calculatePopularityScore(candidate);
  const explorationBonus = calculateExplorationBonus(candidate, tasteProfile, seed);
  const skipPenalty = calculateSkipPenalty(candidate, tasteProfile);

  let collaborativeScore = null;
  if (collaborativeSignals && typeof collaborativeSignals.getScore === "function") {
    collaborativeScore = collaborativeSignals.getScore(candidate);
  }

  const hasCollab = collaborativeScore !== null && !isNaN(collaborativeScore);
  const weights = hasCollab
    ? RECOMMENDATION_CONFIG.weightsWithCollab
    : RECOMMENDATION_CONFIG.weightsWithoutCollab;

  const effectiveCollab = hasCollab ? collaborativeScore : 0;

  const rawScore =
    weights.contentScore * contentScore +
    weights.collaborativeScore * effectiveCollab +
    weights.recencyScore * recencyScore +
    weights.popularityScore * popularityScore +
    weights.explorationBonus * explorationBonus -
    skipPenalty;

  const finalScore = Math.max(0, rawScore);

  const breakdown = {
    contentScore,
    collaborativeScore: effectiveCollab,
    recencyScore,
    popularityScore,
    explorationBonus,
    skipPenalty,
  };

  const reason = generateRecommendationReason(candidate, tasteProfile, breakdown);

  return {
    track: candidate,
    score: parseFloat(finalScore.toFixed(4)),
    breakdown,
    reason,
  };
}

