/**
 * Smart Queue Recommendation System — Configuration & Tuning Parameters
 * 
 * Centralizes all scoring weights, diversity constraints, sampling temperatures,
 * acoustic flow weights, and queue replenishment thresholds in ONE config object.
 */

export const SMART_QUEUE_CONFIG = {
  // -------------------------------------------------------------
  // 1. Scoring Feature Weights (Normalized to sum to 1.0)
  // -------------------------------------------------------------
  weights: {
    genreSimilarity: 0.22,       // Genre & sub-genre overlap
    artistSimilarity: 0.18,      // Primary artist, composer, album, or collaborator
    moodSimilarity: 0.16,        // Valence & energy acoustic proximity
    tempoSimilarity: 0.10,       // BPM closeness with harmonic half/double time
    eraCloseness: 0.06,          // Release year proximity
    sharedTags: 0.08,            // Shared tag overlap (Jaccard index)
    coListeningSignal: 0.08,     // Transition & co-listening frequency
    popularity: 0.06,            // Log-scaled play count (prevents mega-hit domination)
    userTasteBonus: 0.06,        // User likes, high completion rate, and replay count
  },

  // -------------------------------------------------------------
  // 2. Behavioral Penalties
  // -------------------------------------------------------------
  penalties: {
    quickSkipBlacklist: 1.0,      // Total exclusion if skipped under 30 seconds
    quickSkipSimilarDampen: 0.30, // Score dampening on candidates sharing artist/mood with quick-skipped songs
    recentlyPlayed: 0.45,         // Deducted if played earlier in the current session
    consecutiveArtistDampen: 0.35,// Deducted if artist already queued recently
  },

  // -------------------------------------------------------------
  // 3. Queue Composition Mix (Ratios summing to 1.0)
  // -------------------------------------------------------------
  queueMix: {
    similarRatio: 0.70,          // 70% core similarity (best matches for seed vibe)
    popularRatio: 0.20,          // 20% trending/popular tracks matching language & mood
    discoveryRatio: 0.10,        // 10% undiscovered/hidden gems (lower play count, high similarity)
  },

  // -------------------------------------------------------------
  // 4. Diversity & MMR (Maximal Marginal Relevance) Constraints
  // -------------------------------------------------------------
  diversity: {
    mmrLambda: 0.70,             // 0.70 relevance to seed vs 0.30 diversity against already queued
    maxArtistPer10Songs: 2,      // Maximum 2 songs of the same artist in any 10-song window
    maxConsecutiveArtist: 2,     // Never the same artist back-to-back more than twice
    maxAlbumPer10Songs: 1,       // Maximum 1 song from the same album/movie per 10 songs
  },

  // -------------------------------------------------------------
  // 5. Controlled Randomness (Softmax / Weighted Sampling)
  // -------------------------------------------------------------
  sampling: {
    candidatePoolSize: 40,       // Top N candidate slice to sample probabilistically from
    temperature: 0.75,           // Softmax temperature: 0.1=almost deterministic, 1.5=highly exploratory
  },

  // -------------------------------------------------------------
  // 6. Flow Ordering (Acoustic Continuity)
  // -------------------------------------------------------------
  flow: {
    enabled: true,               // Smooth mood & tempo sequencing
    weightBpm: 0.55,             // Weight for tempo distance in transition cost
    weightMood: 0.45,            // Weight for valence/energy distance in transition cost
    maxBpmDeltaPerStep: 30,      // Soft target maximum BPM jump
  },

  // -------------------------------------------------------------
  // 7. Thresholds and Lifecycle Limits
  // -------------------------------------------------------------
  thresholds: {
    minRemainingToRefill: 5,     // Trigger refill when fewer than 5 songs remain
    targetQueueSize: 15,         // Desired automatic queue depth ahead (10-20 songs)
    quickSkipDurationSec: 30,    // Quick skip threshold in seconds
    historyResetKeepRecent: 20,  // If library exhausted, reset history but exclude last 20 played
    maxExpectedPlays: 50000000,  // Maximum expected play count for log10 normalization
  },

  // -------------------------------------------------------------
  // 8. Cold Start Fallbacks
  // -------------------------------------------------------------
  coldStart: {
    defaultBpm: 110,
    defaultMood: "chill_peaceful",
    defaultValence: 0.5,
    defaultEnergy: 0.5,
    defaultYear: 2023,
    defaultPopularityRatio: 0.25,
  },
};

export default SMART_QUEUE_CONFIG;

