/**
 * Diversity & MMR Re-Ranking Module
 * 
 * Applies Maximal Marginal Relevance (MMR) and strict Spotify-style artist/album
 * window constraints:
 * - Max 2 songs of the same artist in any 10-song rolling window
 * - Never the same artist back-to-back more than twice
 * - Max 1 song from the same album/movie per 10 songs
 */

import { SMART_QUEUE_CONFIG } from "./config.js";
import { calculatePairwiseSimilarity, extractSongFeatures } from "./scorer.js";

/**
 * Checks if candidate violates artist or album diversity constraints in the selected queue
 */
export function violatesDiversityConstraints(candidateFeat, selectedQueueFeats, config = SMART_QUEUE_CONFIG) {
  const d = config.diversity;
  const qLen = selectedQueueFeats.length;
  if (qLen === 0) return false;

  const candidateArtists = candidateFeat.allArtists?.length > 0
    ? candidateFeat.allArtists
    : [candidateFeat.primaryArtist].filter(Boolean);
  const candidateAlbum = candidateFeat.album;

  // 1. Never the same artist back-to-back more than twice
  if (qLen >= 2) {
    const prev1 = selectedQueueFeats[qLen - 1].allArtists || [selectedQueueFeats[qLen - 1].primaryArtist];
    const prev2 = selectedQueueFeats[qLen - 2].allArtists || [selectedQueueFeats[qLen - 2].primaryArtist];
    const isConsecutiveThree = candidateArtists.some((a) => prev1.includes(a) && prev2.includes(a));
    if (isConsecutiveThree) {
      return true;
    }
  }

  // 2. Rolling 10-song window: max 2 songs by the same artist
  const windowStart = Math.max(0, qLen - 10);
  const windowTracks = selectedQueueFeats.slice(windowStart);
  for (const art of candidateArtists) {
    let artistCount = 0;
    for (const t of windowTracks) {
      const tArtists = t.allArtists || [t.primaryArtist];
      if (tArtists.includes(art) || t.primaryArtist === art) {
        artistCount++;
      }
    }
    if (artistCount >= d.maxArtistPer10Songs) {
      return true;
    }
  }

  // 3. Rolling 10-song window: max 1 song from the same album/movie
  if (candidateAlbum) {
    let albumCount = 0;
    for (const t of windowTracks) {
      if (t.album && t.album === candidateAlbum) {
        albumCount++;
      }
    }
    if (albumCount >= d.maxAlbumPer10Songs) {
      return true;
    }
  }

  return false;
}

/**
 * Maximal Marginal Relevance (MMR) re-ranking
 * 
 * @param {Array} scoredCandidates - List of { candidate, score, features }
 * @param {Object} seedTrack - The seed song
 * @param {number} targetCount - Number of items to select
 * @param {Object} config - Configuration object
 * @returns {Array} Re-ranked diverse track list
 */
export function mmrReRank(scoredCandidates, seedTrack, targetCount = 20, config = SMART_QUEUE_CONFIG) {
  if (!scoredCandidates || scoredCandidates.length === 0) return [];

  const lambda = config.diversity.mmrLambda ?? 0.70;
  const remaining = [...scoredCandidates];
  const selected = [];
  const selectedFeats = [];

  // Track max score for normalization
  const maxScore = Math.max(...remaining.map((item) => item.score), 0.001);

  while (selected.length < targetCount && remaining.length > 0) {
    let bestIndex = -1;
    let bestMmrScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i];
      const candTrack = item.candidate;
      const candFeat = item.features || extractSongFeatures(candTrack, config);

      // Check hard diversity constraints against currently selected queue
      if (violatesDiversityConstraints(candFeat, selectedFeats, config)) {
        continue;
      }

      // Normalized relevance to seed: in [0, 1]
      const relScore = item.score / maxScore;

      // Max similarity to already selected songs in the queue
      let maxSimToSelected = 0;
      if (selected.length > 0) {
        for (const selItem of selected) {
          const sim = calculatePairwiseSimilarity(candTrack, selItem.candidate, config);
          if (sim > maxSimToSelected) {
            maxSimToSelected = sim;
          }
        }
      }

      // MMR Formula
      const mmrScore = lambda * relScore - (1.0 - lambda) * maxSimToSelected;

      if (mmrScore > bestMmrScore) {
        bestMmrScore = mmrScore;
        bestIndex = i;
      }
    }

    // If remaining candidates strictly violate constraints, only pick if back-to-back rule isn't broken
    if (bestIndex === -1 && remaining.length > 0) {
      for (let i = 0; i < remaining.length; i++) {
        const item = remaining[i];
        const candFeat = item.features || extractSongFeatures(item.candidate, config);
        const qLen = selectedFeats.length;
        if (qLen >= 2) {
          const p1 = selectedFeats[qLen - 1].allArtists || [selectedFeats[qLen - 1].primaryArtist];
          const p2 = selectedFeats[qLen - 2].allArtists || [selectedFeats[qLen - 2].primaryArtist];
          const candArtists = candFeat.allArtists || [candFeat.primaryArtist];
          if (candArtists.some((a) => p1.includes(a) && p2.includes(a))) {
            continue;
          }
        }
        bestIndex = i;
        break;
      }
    }

    if (bestIndex === -1) {
      break; // Stop rather than violating diversity rules if sufficient tracks selected
    }

    const chosen = remaining.splice(bestIndex, 1)[0];
    selected.push(chosen);
    selectedFeats.push(chosen.features || extractSongFeatures(chosen.candidate, config));
  }

  return selected;
}
