/**
 * Hybrid Recommendation Engine — Configuration & Tuning Weights
 * 
 * Centralizes all scoring weights, event decay settings, diversity limits,
 * and caching parameters in ONE configurable file.
 */

export const RECOMMENDATION_CONFIG = {
  // Hybrid scoring weights (with collaborative filtering signal)
  weightsWithCollab: {
    contentScore: 0.40,
    collaborativeScore: 0.25,
    recencyScore: 0.15,
    popularityScore: 0.10,
    explorationBonus: 0.10,
  },

  // Hybrid scoring weights (redistributed when multi-user collaborative data is absent)
  weightsWithoutCollab: {
    contentScore: 0.65, // 0.40 + 0.25 redistributed
    collaborativeScore: 0.0,
    recencyScore: 0.15,
    popularityScore: 0.10,
    explorationBonus: 0.10,
  },

  // Event weights for building user taste profile
  eventWeights: {
    like: 3.0,          // User explicitly liked a track
    fullPlay: 2.0,      // Completed song playback
    partialPlay: 1.0,   // Played song for more than 30s but not completed
    playlistAdd: 2.0,   // Added track to custom playlist
    skip: -2.0,         // Skipped song under 30s
  },

  // Time decay half-life in days (14 days = events 14 days ago carry 50% weight)
  decayHalfLifeDays: 14,

  // Recency release boost half-life in days (for new releases)
  recencyHalfLifeDays: 75,

  // Thresholds and diversity constraints
  diversity: {
    defaultLimit: 8,
    maxPerArtist: 2,           // No more than 2 songs from the same artist in the top recommendations
    minDistinctGenres: 3,       // Spread across at least 3 distinct genres if available
    explorationRatio: 0.15,     // 15% exploration bonus weight
    exclusionWindowHours: 24,   // Exclude songs played in the last 24 hours
  },

  // Cache settings
  cache: {
    ttlMs: 10 * 60 * 1000,      // 10 minutes cache per user
  },
};

