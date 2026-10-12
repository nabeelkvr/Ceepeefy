/**
 * Ceepeefy — Auto-Queue Recommendation Weights & Tuning Configuration
 * 
 * Tunable weights (summing to 1.0) and algorithmic constraints for
 * the Spotify-style candidate scoring pipeline.
 */

export const RECOMMENDATION_WEIGHTS = {
  // --- Core Feature Weights (Normalized to 1.0) ---
  genreMatch: 0.25,        // Genre / sub-genre overlap
  moodEnergy: 0.15,        // Valence + Energy acoustic similarity
  artistSimilarity: 0.15,  // Exact or related/collaborator artist match
  tempoCloseness: 0.10,    // BPM distance similarity
  eraCloseness: 0.05,      // Release year proximity
  popularity: 0.10,        // Global play count / trending score
  userTaste: 0.15,         // Real-time learned affinity profile (likes/finishes)
  freshnessBonus: 0.05,    // Bonus for tracks not recently consumed

  // --- Behavioral Penalties ---
  penalties: {
    recentlyPlayed: 0.40,  // Deducted if played in the current session
    repeatedSkip: 0.50,    // Deducted if skipped repeatedly (< 30s)
    dislikedArtist: 0.80,  // Deducted if artist has negative affinity
  },

  // --- Diversity & Sequencing Constraints ---
  diversity: {
    maxConsecutiveArtist: 2, // Never allow same artist > 2 times consecutively
    maxConsecutiveAlbum: 1,  // Never allow same album/movie back-to-back
    familiarRatio: 0.70,     // 70% high-affinity/familiar songs
    discoveryRatio: 0.30,    // 30% exploration/new candidate discoveries
    topNCandidatesForRandom: 20, // Sample probabilistically from top 20
    temperature: 0.85,       // Softmax sampling temperature for weighted selection
  },

  // --- Auto-Queue Trigger Thresholds ---
  queueBuffer: {
    minBufferCount: 5,       // Trigger background async fetch when < 5 remain
    targetBufferCount: 10,   // Fill buffer up to at least 10 upcoming tracks
    seedHistoryWindow: 5,    // Current song + last 5 songs for seed profile
    candidatePoolSize: 150,  // Number of candidates fetched across tiers
    crossfadeSeconds: 4,     // Default gapless crossfade window (0-12s)
  },

  // --- Real-time Learning Feedback Multipliers (Taste Profile) ---
  feedbackMultipliers: {
    quickSkip: -0.5,        // Skipped under 30s -> strong negative
    lateSkip: -0.15,        // Skipped after 30s -> mild negative
    completed: 0.35,        // Played to completion -> positive
    likedOrAdded: 0.75,     // Liked or added to custom playlist -> strong positive
    replayed: 1.0,          // Replayed in session -> very strong positive
    decayHalfLifeHours: 72, // Time-decay half-life: 3 days
  },
};

export default RECOMMENDATION_WEIGHTS;
