/**
 * Centralized Lyrics Service
 *
 * Implements Section 3, 7, 8, 9, 10 & 12:
 * - Provider Sequence: JioSaavn -> LRCLIB -> Musixmatch -> Mock
 * - Multi-tier Caching (24h positive, 5m negative)
 * - In-flight Request Deduplication
 * - Request Timeouts via AbortController
 * - Language Detection & Transliteration Layer
 * - Privacy-Conscious Structured Diagnostic Logging
 */

import { JioSaavnProvider } from "./providers/jiosaavnProvider.js";
import { LrclibProvider } from "./providers/lrclibProvider.js";
import { MusixmatchProvider } from "./providers/musixmatchProvider.js";
import { MockProvider } from "./providers/mockProvider.js";
import { processLyricsLanguageAndScript } from "./textProcessor.js";
import { lyricsCorrectionService } from "./lyricsCorrectionService.js";
import { createNormalizedLyrics, CACHE_STATUS } from "./types.js";
import { normalizeSongTitle } from "./songMatcher.js";

const POSITIVE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const NEGATIVE_CACHE_TTL = 5 * 60 * 1000;       // 5 minutes

class LyricsService {
  constructor() {
    this.providers = [
      new JioSaavnProvider(),
      new LrclibProvider(),
      new MusixmatchProvider(),
      new MockProvider(),
    ];

    // In-memory cache: cacheKey -> { data: NormalizedLyrics, expiresAt: number }
    this.cache = new Map();

    // In-flight request deduplication map: cacheKey -> Promise<NormalizedLyrics>
    this.inFlightRequests = new Map();
  }

  /**
   * Generates a stable composite cache key
   */
  generateCacheKey(trackSeed = {}) {
    const cleanId = String(trackSeed.id || "").replace(/^track-/, "").trim().toLowerCase();
    const cleanTitle = normalizeSongTitle(trackSeed.title || trackSeed.track || "");
    const cleanArtist = (trackSeed.artist || "")
      .split(/[,&/]|feat\.?|ft\.?/i)[0]
      .trim()
      .toLowerCase();
    const targetLang = (trackSeed.language || "").toLowerCase().trim();

    return `${cleanId}:::${cleanTitle}:::${cleanArtist}:::${targetLang}`;
  }

  /**
   * Main retrieval method
   */
  getLyrics(trackSeed = {}, options = {}) {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(trackSeed);

    // 1. Check existing cache
    if (options.bypassCache) {
      this.cache.delete(cacheKey);
    } else if (this.cache.has(cacheKey)) {
      const cachedEntry = this.cache.get(cacheKey);
      if (Date.now() < cachedEntry.expiresAt) {
        console.log(
          `[LyricsService] Cache HIT for "${trackSeed.title || ""}" (Provider: ${cachedEntry.data.provider}, Synced: ${cachedEntry.data.synced})`
        );
        return Promise.resolve({
          ...cachedEntry.data,
          cacheStatus: CACHE_STATUS.HIT,
        });
      } else {
        // Expired
        this.cache.delete(cacheKey);
      }
    }

    // 2. In-flight request deduplication
    if (this.inFlightRequests.has(cacheKey)) {
      console.log(`[LyricsService] Reusing in-flight request for "${trackSeed.title || ""}"`);
      return this.inFlightRequests.get(cacheKey);
    }

    // 3. Initiate lookup pipeline wrapped in deduplicated Promise
    const fetchPromise = this._executeProviderPipeline(trackSeed, options, startTime, cacheKey)
      .finally(() => {
        this.inFlightRequests.delete(cacheKey);
      });

    this.inFlightRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * Internal pipeline executing provider sequence and normalization
   */
  async _executeProviderPipeline(trackSeed, options, startTime, cacheKey) {
    let acceptedResult = null;
    let attemptedProviders = [];

    // Filter providers: allow custom list or standard sequence
    const providersToTry = this.providers.filter((p) => {
      if (options.provider && p.name !== options.provider) return false;
      return true;
    });

    // 1. Fast Parallel Execution for primary providers (JioSaavn + LRCLIB)
    if (!options.provider && providersToTry.length >= 2) {
      const primaryProviders = providersToTry.slice(0, 2);
      attemptedProviders.push(...primaryProviders.map((p) => p.name));

      const parallelResults = await Promise.allSettled(
        primaryProviders.map((p) =>
          p.fetchLyrics(trackSeed, { timeoutMs: options.timeoutMs || 2500 })
        )
      );

      const successfulResults = [];
      parallelResults.forEach((res, idx) => {
        if (
          res.status === "fulfilled" &&
          res.value &&
          res.value.found &&
          Array.isArray(res.value.lines) &&
          res.value.lines.length > 0
        ) {
          successfulResults.push(res.value);
        } else if (res.status === "rejected") {
          console.warn(
            `[LyricsService] Fast primary provider ${primaryProviders[idx].name} error:`,
            res.reason?.message
          );
        }
      });

      // Prefer synced lyrics with highest confidence
      if (successfulResults.length > 0) {
        successfulResults.sort((a, b) => {
          if (a.synced && !b.synced) return -1;
          if (!a.synced && b.synced) return 1;
          return (b.matchConfidence || 0) - (a.matchConfidence || 0);
        });
        acceptedResult = successfulResults[0];
      }
    }

    // 2. Sequential fallback execution for remaining providers if needed
    if (!acceptedResult) {
      const remainingProviders = options.provider
        ? providersToTry
        : providersToTry.slice(2);

      for (const provider of remainingProviders) {
        if (!attemptedProviders.includes(provider.name)) {
          attemptedProviders.push(provider.name);
        }
        try {
          const result = await provider.fetchLyrics(trackSeed, {
            timeoutMs: options.timeoutMs || 2500,
          });

          if (result && result.found && Array.isArray(result.lines) && result.lines.length > 0) {
            acceptedResult = result;
            break;
          }
        } catch (err) {
          console.warn(`[LyricsService] Provider ${provider.name} error:`, err.message);
        }
      }
    }

    const durationMs = Date.now() - startTime;

    // 3. If a valid lyrics result was accepted, apply language, script processing & correction pipeline
    if (acceptedResult) {
      const langScriptResult = processLyricsLanguageAndScript(
        acceptedResult.rawLyrics,
        acceptedResult.lines,
        trackSeed
      );

      // Run dedicated validation & correction pipeline (Malayalam safe normalization, verified reference comparison, etc.)
      const correctionResult = lyricsCorrectionService.validateAndCorrectLyrics(
        trackSeed,
        langScriptResult.lines,
        langScriptResult.displayLyrics,
        options
      );

      const normalizedResponse = createNormalizedLyrics({
        success: true,
        trackId: String(trackSeed.id || ""),
        title: trackSeed.title || "",
        artist: trackSeed.artist || "",
        album: trackSeed.album || "",
        detectedLanguage: langScriptResult.detectedLanguage,
        originalScript: langScriptResult.originalScript,
        displayScript: langScriptResult.displayScript,
        provider: acceptedResult.provider,
        providerTrackId: acceptedResult.providerTrackId,
        matchConfidence: acceptedResult.matchConfidence || 90,
        isInstrumental: Boolean(trackSeed.isInstrumental || trackSeed.isBgm),
        synced: Boolean(acceptedResult.synced),
        lines: correctionResult.lines,
        originalLyrics: langScriptResult.originalLyrics || acceptedResult.rawLyrics,
        displayLyrics: correctionResult.displayLyrics,
        correctedLyrics: correctionResult.correctedLyrics,
        verificationStatus: correctionResult.verificationStatus,
        correctionMethod: correctionResult.correctionMethod,
        changesMade: correctionResult.changesMade,
        confidenceLevel: correctionResult.confidenceLevel,
        lastValidated: correctionResult.lastValidated,
        referenceSource: correctionResult.referenceSource,
        attribution: acceptedResult.attribution || "Lyrics provided by authorized sources",
        copyright: acceptedResult.copyright || "",
        fetchedAt: new Date().toISOString(),
        cacheStatus: CACHE_STATUS.MISS,
      });

      // Save to positive cache (24 hours)
      this.cache.set(cacheKey, {
        data: normalizedResponse,
        expiresAt: Date.now() + POSITIVE_CACHE_TTL,
      });

      console.log(
        `[LyricsService] SUCCESS for "${trackSeed.title}": Provider=${acceptedResult.provider} | Lang=${langScriptResult.detectedLanguage} | Verified=${correctionResult.verificationStatus} | Synced=${Boolean(acceptedResult.synced)} | Time=${durationMs}ms`
      );

      return normalizedResponse;
    }

    // 5. No provider returned usable lyrics -> Negative Cache (5 minutes)
    const notFoundResponse = createNormalizedLyrics({
      success: false,
      trackId: String(trackSeed.id || ""),
      title: trackSeed.title || "",
      artist: trackSeed.artist || "",
      album: trackSeed.album || "",
      detectedLanguage: trackSeed.language || "unknown",
      provider: "none",
      isInstrumental: Boolean(trackSeed.isInstrumental || trackSeed.isBgm),
      synced: false,
      lines: [],
      originalLyrics: "",
      displayLyrics: "",
      message: "No lyrics available for this track across configured providers",
      rejectionReason: `Attempted providers [${attemptedProviders.join(", ")}] returned no verified lyrics`,
      fetchedAt: new Date().toISOString(),
      cacheStatus: CACHE_STATUS.MISS,
    });

    this.cache.set(cacheKey, {
      data: notFoundResponse,
      expiresAt: Date.now() + NEGATIVE_CACHE_TTL,
    });

    console.log(
      `[LyricsService] NOT FOUND for "${trackSeed.title || ""}": Attempted=[${attemptedProviders.join(", ")}] | Time=${durationMs}ms`
    );

    return notFoundResponse;
  }

  /**
   * Clears internal cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Export singleton instance
export const lyricsService = new LyricsService();
