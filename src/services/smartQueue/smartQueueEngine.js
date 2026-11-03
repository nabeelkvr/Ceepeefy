/**
 * Spotify-Style Smart Queue Engine
 * 
 * Complete 6-Step Autoplay & Radio Pipeline:
 * Step 1: Candidate Generation & Deduplication with Step-by-Step Language Relaxation
 * Step 2: Multi-Factor Weighted Similarity Scoring (Single Config Object)
 * Step 3: Queue Mix Target (70% Similar, 20% Popular, 10% Discovery)
 * Step 4: Diversity Re-Ranking (Maximal Marginal Relevance + Rolling Window Artist Caps)
 * Step 5: Controlled Randomness (Softmax / Temperature Sampling from Top 30-50)
 * Step 6: Acoustic Flow Ordering (Smooth BPM & Mood Sequencing)
 */

import { SMART_QUEUE_CONFIG } from "./config.js";
import { extractSongFeatures, scoreCandidate, cleanStr } from "./scorer.js";
import { mmrReRank } from "./diversity.js";
import { balanceQueueMix, sampleWithControlledRandomness, orderQueueAcousticFlow } from "./flow.js";
import { QueueSessionManager, getTrackIdentityKey } from "./historyManager.js";

/**
 * Related languages mapping for progressive relaxation
 */
const RELATED_LANGUAGES = {
  malayalam: ["tamil", "telugu", "kannada"],
  tamil: ["malayalam", "telugu", "kannada"],
  telugu: ["tamil", "kannada", "malayalam"],
  kannada: ["telugu", "tamil", "malayalam"],
  hindi: ["punjabi", "bhojpuri", "marathi", "urdu"],
  punjabi: ["hindi", "urdu"],
  english: ["spanish", "french", "phonk"],
  phonk: ["english", "electronic"],
};

/**
 * Builds a smart queue for a seed song from a library of songs
 * 
 * @param {Object} seedSong - The song clicked or currently playing
 * @param {Array} library - Catalog of available songs
 * @param {Object} options - Runtime options and session state
 * @returns {Object} { queue, relaxationStatus, seedFeatures }
 */
export function buildSmartQueue(seedSong, library, options = {}) {
  if (!seedSong || !Array.isArray(library) || library.length === 0) {
    return { queue: [], relaxationStatus: null, seedFeatures: null };
  }

  const config = options.config || SMART_QUEUE_CONFIG;
  const sessionManager = options.sessionManager || new QueueSessionManager(config);
  const targetQueueSize = options.targetQueueSize || config.thresholds.targetQueueSize;

  const seedFeat = extractSongFeatures(seedSong, config);
  const seedLang = seedFeat.language;

  // -------------------------------------------------------------
  // STEP 1: Candidate Generation & Deduplication
  // -------------------------------------------------------------
  let candidatePool = [];
  const relaxationStatus = {
    isRelaxed: false,
    level: "strict",
    originalLanguage: seedLang,
    activeLanguages: [seedLang],
    message: null,
  };

  // Helper to filter eligible tracks from library
  const getEligibleCandidates = (allowedLangs = null) => {
    const list = [];
    const seenKeys = new Set();
    const seedKey = getTrackIdentityKey(seedSong);
    if (seedKey) seenKeys.add(seedKey);

    for (const song of library) {
      if (!song || !song.id) continue;

      // Filter by language if specified
      if (allowedLangs && allowedLangs.length > 0) {
        const sLang = (song.language || song.more_info?.language || "").toLowerCase().trim();
        if (sLang && !allowedLangs.includes(sLang)) {
          continue;
        }
      }

      // Check session exclusion (played, skipped, in current queue, or duplicate)
      if (sessionManager.isExcluded(song)) {
        continue;
      }

      // De-duplicate remix/re-upload variations with identical title + artist
      const songKey = getTrackIdentityKey(song);
      if (songKey) {
        if (seenKeys.has(songKey)) continue;
        seenKeys.add(songKey);
      }

      list.push(song);
    }
    return list;
  };

  // Step 1a: Try strict same-language match
  if (seedLang) {
    candidatePool = getEligibleCandidates([seedLang]);
  } else {
    candidatePool = getEligibleCandidates(null);
  }

  // Step 1b: Progressive relaxation if library is small / pool under target
  if (candidatePool.length < targetQueueSize && seedLang) {
    const related = RELATED_LANGUAGES[seedLang] || [];
    if (related.length > 0) {
      const relatedCandidates = getEligibleCandidates([seedLang, ...related]);
      if (relatedCandidates.length > candidatePool.length) {
        candidatePool = relatedCandidates;
        relaxationStatus.isRelaxed = true;
        relaxationStatus.level = "related";
        relaxationStatus.activeLanguages = [seedLang, ...related];
        relaxationStatus.message = `Strict language candidate pool exhausted. Relaxed to related regional languages: ${related.join(", ")}`;
        if (typeof options.onRuleRelaxed === "function") {
          options.onRuleRelaxed(relaxationStatus);
        }
      }
    }
  }

  // Only relax to all languages if related languages returned 0 candidates
  if (candidatePool.length === 0) {
    candidatePool = getEligibleCandidates(null);
    if (candidatePool.length > 0) {
      relaxationStatus.isRelaxed = true;
      relaxationStatus.level = "all";
      relaxationStatus.message = `Candidate pool under target and related languages exhausted. Relaxed language constraint to entire library.`;
      if (typeof options.onRuleRelaxed === "function") {
        options.onRuleRelaxed(relaxationStatus);
      }
    }
  }

  // If still fewer than target candidates because entire library was played,
  // reset session history but keep last 20 played songs excluded
  if (candidatePool.length < targetQueueSize) {
    sessionManager.resetHistoryExceptRecent(config.thresholds.historyResetKeepRecent);
    candidatePool = seedLang ? getEligibleCandidates([seedLang]) : getEligibleCandidates(null);
    if (candidatePool.length < targetQueueSize) {
      candidatePool = getEligibleCandidates(null);
    }
  }

  if (candidatePool.length === 0) {
    return { queue: [], relaxationStatus, seedFeatures: seedFeat };
  }

  // -------------------------------------------------------------
  // STEP 2: Similarity Scoring
  // -------------------------------------------------------------
  const context = {
    userLikes: options.userLikes || new Set(),
    userCompletions: options.userCompletions || new Set(),
    userReplays: options.userReplays || new Set(),
    skippedProfiles: sessionManager.quickSkippedProfiles,
    sessionPlayedIds: sessionManager.playedTrackIds,
    coListeningMatrix: options.coListeningMatrix || null,
  };

  const scoredCandidates = candidatePool.map((candidate) => {
    return scoreCandidate(candidate, seedSong, context, config);
  });

  // Sort by score descending
  scoredCandidates.sort((a, b) => b.score - a.score);

  // -------------------------------------------------------------
  // STEP 3: Queue Mix Allocation (70% Similar, 20% Popular, 10% Discovery)
  // -------------------------------------------------------------
  const mixedCandidates = balanceQueueMix(scoredCandidates, Math.min(scoredCandidates.length, targetQueueSize * 3), config);

  // -------------------------------------------------------------
  // STEP 4: Diversity Re-Ranking (MMR + Artist Window Constraints)
  // -------------------------------------------------------------
  const poolToReRank = mixedCandidates.length >= targetQueueSize ? mixedCandidates : scoredCandidates;
  const diverseCandidates = mmrReRank(poolToReRank, seedSong, Math.min(poolToReRank.length, targetQueueSize + 5), config);

  // -------------------------------------------------------------
  // STEP 5: Controlled Randomness (Softmax / Temperature Sampling)
  // -------------------------------------------------------------
  const sampledItems = sampleWithControlledRandomness(
    diverseCandidates,
    Math.min(targetQueueSize, diverseCandidates.length),
    config.sampling.temperature,
    config
  );

  // -------------------------------------------------------------
  // STEP 6: Flow Ordering (Acoustic Continuity)
  // -------------------------------------------------------------
  const finalOrderedQueue = orderQueueAcousticFlow(sampledItems, seedSong, config);

  return {
    queue: finalOrderedQueue,
    relaxationStatus,
    seedFeatures: seedFeat,
  };
}

/**
 * Refills the smart queue when fewer than 5 tracks remain
 * Uses the LAST played song as the new seed to smoothly evolve the vibe
 * 
 * @param {Object} lastPlayedTrack - The song that just played
 * @param {Array} currentAutoQueue - Currently remaining auto-queue
 * @param {Array} library - Available song library
 * @param {QueueSessionManager} sessionManager - Active session manager
 * @param {Object} options - Options
 */
export function refillSmartQueue(lastPlayedTrack, currentAutoQueue = [], library = [], sessionManager, options = {}) {
  const config = options.config || SMART_QUEUE_CONFIG;
  const minThreshold = config.thresholds.minRemainingToRefill;
  const targetSize = config.thresholds.targetQueueSize;

  // Only refill if current queue depth is below threshold
  if (currentAutoQueue.length >= minThreshold) {
    return { queue: currentAutoQueue, refilled: false };
  }

  const neededCount = targetSize - currentAutoQueue.length;
  if (neededCount <= 0) {
    return { queue: currentAutoQueue, refilled: false };
  }

  // Update session manager with existing queued items to prevent duplicates
  if (sessionManager) {
    sessionManager.autoQueue = [...currentAutoQueue];
  }

  // Generate new batch using last played track as seed
  const { queue: newBatch, relaxationStatus } = buildSmartQueue(lastPlayedTrack, library, {
    ...options,
    config,
    sessionManager,
    targetQueueSize: neededCount + 2,
  });

  // Deduplicate against remaining items in current queue
  const existingIds = new Set(currentAutoQueue.map((t) => String(t.id).replace(/^track-/, "").trim()));
  const freshTracks = newBatch.filter((t) => !existingIds.has(String(t.id).replace(/^track-/, "").trim()));

  const updatedQueue = [...currentAutoQueue, ...freshTracks.slice(0, neededCount)];

  return {
    queue: updatedQueue,
    refilled: true,
    addedCount: updatedQueue.length - currentAutoQueue.length,
    relaxationStatus,
  };
}
