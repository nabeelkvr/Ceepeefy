/**
 * Unified Lyrics Types, Script Definitions, and Language Constants
 */

export const SCRIPT_TYPES = {
  MALAYALAM: "MALAYALAM",
  DEVANAGARI: "DEVANAGARI",
  TAMIL: "TAMIL",
  TELUGU: "TELUGU",
  KANNADA: "KANNADA",
  BENGALI: "BENGALI",
  LATIN: "LATIN",
  UNKNOWN: "UNKNOWN",
};

export const PROVIDER_NAMES = {
  JIOSAAVN: "jiosaavn",
  LRCLIB: "lrclib",
  MUSIXMATCH: "musixmatch",
  MOCK: "mock",
};

export const CACHE_STATUS = {
  HIT: "HIT",
  MISS: "MISS",
};

export const VERIFICATION_STATUS = {
  ORIGINAL: "original",
  CORRECTED_UNVERIFIED: "corrected_unverified",
  VERIFIED: "verified",
  NEEDS_REVIEW: "needs_review",
};

export const REJECTION_REASONS = {
  TITLE_MISMATCH: "Title similarity below acceptable threshold",
  ARTIST_MISMATCH: "Artist does not match requested track",
  DURATION_MISMATCH: "Duration differs significantly from requested track",
  VERSION_MISMATCH: "Mismatched version (e.g. remix vs original or live vs studio)",
  INSTRUMENTAL_MISMATCH: "Requested track is instrumental but vocals were returned",
  EMPTY_LYRICS: "Provider returned empty or malformed lyrics content",
  PROVIDER_UNAVAILABLE: "Provider request timed out or returned an error status",
  NOT_CONFIGURED: "Provider credentials or API key not configured",
};

/**
 * Creates a standard normalized lyrics response object
 */
export function createNormalizedLyrics(params = {}) {
  const {
    success = false,
    trackId = "",
    title = "",
    artist = "",
    album = "",
    detectedLanguage = "unknown",
    originalScript = SCRIPT_TYPES.UNKNOWN,
    displayScript = SCRIPT_TYPES.UNKNOWN,
    provider = "none",
    providerTrackId = null,
    matchConfidence = 0,
    isInstrumental = false,
    synced = false,
    lines = [],
    originalLyrics = "",
    displayLyrics = "",
    correctedLyrics = "",
    verificationStatus = VERIFICATION_STATUS.ORIGINAL,
    correctionMethod = "none",
    changesMade = [],
    confidenceLevel = matchConfidence,
    lastValidated = new Date().toISOString(),
    referenceSource = null,
    attribution = "",
    copyright = "",
    fetchedAt = new Date().toISOString(),
    cacheStatus = CACHE_STATUS.MISS,
    rejectionReason = null,
    message = null,
  } = params;

  return {
    success,
    trackId,
    title,
    artist,
    album,
    detectedLanguage,
    originalScript,
    displayScript,
    provider,
    providerTrackId,
    matchConfidence,
    isInstrumental,
    synced,
    lines,
    lyrics: lines, // Backward compatibility with components expecting .lyrics
    originalLyrics,
    displayLyrics,
    correctedLyrics: correctedLyrics || displayLyrics,
    verificationStatus,
    correctionMethod,
    changesMade,
    confidenceLevel,
    lastValidated,
    referenceSource,
    attribution,
    copyright,
    fetchedAt,
    cacheStatus,
    rejectionReason,
    message,
  };
}
