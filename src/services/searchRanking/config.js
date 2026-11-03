/**
 * Spotify-Style Search Ranking Configuration
 * 
 * Centralizes all scoring weights, relevance tier thresholds, decay factors,
 * version penalties, and tie-breaker preferences in ONE tunable config object.
 */

export const SEARCH_RANKING_CONFIG = {
  // -------------------------------------------------------------
  // 1. Final Score Multi-Factor Weights (Sum to 1.0)
  // -------------------------------------------------------------
  weights: {
    textRelevance: 0.50,         // Match quality across title, artist, album, aliases
    popularity: 0.25,            // Log-scaled total play count
    replay: 0.10,                // Repeat plays, likes, playlist additions
    recencyTrending: 0.10,       // Exponential decay on release date + recent trending boost
    personalAffinity: 0.05,      // User's recent listening language & artist affinity
  },

  // -------------------------------------------------------------
  // 2. Field Match Weights (Title is weighted highest)
  // -------------------------------------------------------------
  fieldWeights: {
    title: 1.00,                 // Song / album / artist primary title
    artist: 0.75,                // Artist name match
    album: 0.60,                 // Album / movie name match
    alias: 0.80,                 // Transliterated alias or alternative name
  },

  // -------------------------------------------------------------
  // 3. Text Relevance Tiers (Score between 0.0 and 1.0)
  // -------------------------------------------------------------
  relevanceTiers: {
    exactMatch: 1.00,            // Exact string match after normalization
    startsWith: 0.90,            // Field starts with query
    wordStartsWith: 0.80,        // A word inside the field starts with query
    allTokensPresent: 0.70,      // All query tokens present in field (any order)
    fuzzyEdit1: 0.60,            // Typo match with Levenshtein distance 1
    fuzzyEdit2: 0.45,            // Typo match with Levenshtein distance 2
    artistTitleBonus: 0.15,      // Bonus when query matches both artist AND title (e.g., "Anirudh Hukum")
  },

  // -------------------------------------------------------------
  // 4. Thresholds & Gates
  // -------------------------------------------------------------
  thresholds: {
    relevanceGate: 0.35,         // Drop items with relevance < 0.35 so popularity cannot boost irrelevant items
    maxExpectedPlays: 50000000,  // Log10 normalizer upper bound (50M plays = 1.0)
    recencyHalfLifeDays: 75,     // Half-life for release recency decay (~2.5 months)
    maxArtistShareInTopSongs: 3, // Max songs by same artist in top 10 (unless query targets that artist)
    cacheTtlMs: 300000,          // 5-minute in-memory cache for repeated search queries
    cacheMaxSize: 500,           // Maximum cached query results in LRU map
  },

  // -------------------------------------------------------------
  // 5. Version Adjustments (Originals prioritized over remixes/covers)
  // -------------------------------------------------------------
  versionPenalties: {
    remix: 0.25,                 // Penalize remix unless query has "remix", "mix", "mashup"
    acoustic: 0.20,              // Penalize acoustic unless query has "acoustic", "unplugged"
    coverOrKaraoke: 0.40,        // Penalize karaoke, cover, tribute, or instrumental
    live: 0.15,                  // Penalize live recording unless query has "live", "concert"
    slowedReverb: 0.30,          // Penalize slowed+reverb edits
    originalBonus: 0.10,         // Bonus for verified official/original release
  },

  // -------------------------------------------------------------
  // 6. Typo Tolerance Settings
  // -------------------------------------------------------------
  typoTolerance: {
    minWordLengthForEdit1: 4,    // Allow 1 typo for words of 4-6 chars (e.g. "hukm" -> "hukum")
    minWordLengthForEdit2: 7,    // Allow 2 typos for words >= 7 chars (e.g. "kesariyaa" -> "kesariya")
  },

  // -------------------------------------------------------------
  // 7. Debug Logging Flag (OFF by default, never shown in UI)
  // -------------------------------------------------------------
  debugRanking: false,
};

export default SEARCH_RANKING_CONFIG;
