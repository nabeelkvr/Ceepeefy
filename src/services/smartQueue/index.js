/**
 * Spotify-Style Smart Queue System
 * 
 * Modular exports for candidate generation, similarity scoring, diversity re-ranking,
 * controlled sampling, acoustic flow ordering, and session history management.
 */

export { SMART_QUEUE_CONFIG } from "./config.js";
export {
  extractSongFeatures,
  cleanStr,
  extractArtists,
  calculateGenreSimilarity,
  calculateArtistSimilarity,
  calculateMoodSimilarity,
  calculateTempoSimilarity,
  calculateEraCloseness,
  calculateSharedTagsSimilarity,
  calculateLogPopularity,
  calculatePairwiseSimilarity,
  scoreCandidate,
} from "./scorer.js";
export {
  violatesDiversityConstraints,
  mmrReRank,
} from "./diversity.js";
export {
  sampleWithControlledRandomness,
  balanceQueueMix,
  orderQueueAcousticFlow,
} from "./flow.js";
export {
  QueueSessionManager,
  normalizeBaseTitle,
  getTrackIdentityKey,
} from "./historyManager.js";
export {
  buildSmartQueue,
  refillSmartQueue,
} from "./smartQueueEngine.js";

