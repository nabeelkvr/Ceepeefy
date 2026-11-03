/**
 * Flow Ordering & Controlled Randomness Module
 * 
 * Implements:
 * 1. Queue mix synthesis (70% core similarity, 20% popular context-fit, 10% discovery)
 * 2. Softmax temperature-controlled weighted sampling from top candidates
 * 3. Acoustic flow sequencing to ensure smooth tempo & mood continuity without whiplash
 */

import { SMART_QUEUE_CONFIG } from "./config.js";
import { extractSongFeatures } from "./scorer.js";
import { violatesDiversityConstraints } from "./diversity.js";

/**
 * Weighted reservoir / Softmax probabilistic sampling without replacement
 * 
 * @param {Array} candidateItems - List of { candidate, score, features }
 * @param {number} count - Target number of tracks to select
 * @param {number} temperature - Softmax temperature (higher = more exploratory)
 * @param {Object} config - System configuration
 */
export function sampleWithControlledRandomness(candidateItems, count, temperature = 0.75, config = SMART_QUEUE_CONFIG) {
  if (!candidateItems || candidateItems.length <= count) {
    return candidateItems ? [...candidateItems] : [];
  }

  const pool = [...candidateItems];
  const selected = [];
  const selectedFeats = [];

  // Find max score for numerical stability in exp()
  const maxScore = Math.max(...pool.map((c) => c.score), 0.001);

  while (selected.length < count && pool.length > 0) {
    // Filter out candidates that violate diversity constraints with the current selection
    const validPool = pool.filter((item) => {
      const feat = item.features || extractSongFeatures(item.candidate || item, config);
      return !violatesDiversityConstraints(feat, selectedFeats, config);
    });

    const activePool = validPool.length > 0 ? validPool : pool;

    // Compute softmax probabilities on active pool
    const exps = activePool.map((item) => Math.exp((item.score / maxScore) / Math.max(0.05, temperature)));
    const sumExps = exps.reduce((acc, v) => acc + v, 0);

    let rand = Math.random() * sumExps;
    let chosenItem = activePool[0];

    for (let i = 0; i < activePool.length; i++) {
      rand -= exps[i];
      if (rand <= 0) {
        chosenItem = activePool[i];
        break;
      }
    }

    const poolIdx = pool.indexOf(chosenItem);
    if (poolIdx !== -1) {
      pool.splice(poolIdx, 1);
    }

    selected.push(chosenItem);
    selectedFeats.push(chosenItem.features || extractSongFeatures(chosenItem.candidate || chosenItem, config));
  }

  return selected;
}

/**
 * Balances the candidate pool according to the 70 / 20 / 10 mix target
 * - 70% Core Similar: Highest similarity to the seed track
 * - 20% Popular: Well-known hits that fit the language and mood
 * - 10% Discovery: Lesser-known or fresh tracks with high similarity
 */
export function balanceQueueMix(scoredCandidates, targetCount = 15, config = SMART_QUEUE_CONFIG) {
  if (!scoredCandidates || scoredCandidates.length <= targetCount) {
    return scoredCandidates || [];
  }

  const mix = config.queueMix;
  const numSimilar = Math.round(targetCount * mix.similarRatio);
  const numPopular = Math.round(targetCount * mix.popularRatio);
  const numDiscovery = Math.max(1, targetCount - numSimilar - numPopular);

  const selectedIds = new Set();
  const result = [];

  // 1. Sort by overall similarity score
  const sortedBySim = [...scoredCandidates].sort((a, b) => b.score - a.score);
  for (const item of sortedBySim) {
    if (result.length >= numSimilar) break;
    const id = item.features?.id || String(item.candidate?.id);
    if (!selectedIds.has(id)) {
      selectedIds.add(id);
      result.push({ ...item, mixType: "similar" });
    }
  }

  // 2. Sort remaining by popularity (fitting mood)
  const remainingForPop = scoredCandidates
    .filter((item) => !selectedIds.has(item.features?.id || String(item.candidate?.id)))
    .sort((a, b) => (b.features?.playCount || 0) - (a.features?.playCount || 0));

  let popCount = 0;
  for (const item of remainingForPop) {
    if (popCount >= numPopular) break;
    const id = item.features?.id || String(item.candidate?.id);
    if (!selectedIds.has(id)) {
      selectedIds.add(id);
      result.push({ ...item, mixType: "popular" });
      popCount++;
    }
  }

  // 3. Sort remaining by discovery gems (lower play count, higher acoustic/mood fit)
  const remainingForDisc = scoredCandidates
    .filter((item) => !selectedIds.has(item.features?.id || String(item.candidate?.id)))
    .sort((a, b) => {
      const discA = a.score / Math.log10(Math.max(10, a.features?.playCount || 10));
      const discB = b.score / Math.log10(Math.max(10, b.features?.playCount || 10));
      return discB - discA;
    });

  let discCount = 0;
  for (const item of remainingForDisc) {
    if (discCount >= numDiscovery) break;
    const id = item.features?.id || String(item.candidate?.id);
    if (!selectedIds.has(id)) {
      selectedIds.add(id);
      result.push({ ...item, mixType: "discovery" });
      discCount++;
    }
  }

  // Fill up if any category fell short
  for (const item of sortedBySim) {
    if (result.length >= targetCount) break;
    const id = item.features?.id || String(item.candidate?.id);
    if (!selectedIds.has(id)) {
      selectedIds.add(id);
      result.push({ ...item, mixType: "fallback" });
    }
  }

  return result;
}

/**
 * Arranges the final selected queue into a smooth, Spotify-style acoustic flow
 * Eliminates sudden mood or tempo jumps by finding an optimal greedy sequence
 * 
 * @param {Array} queueItems - Items to order
 * @param {Object} seedTrack - Seed track anchor
 * @param {Object} config - System config
 */
export function orderQueueAcousticFlow(queueItems, seedTrack, config = SMART_QUEUE_CONFIG) {
  if (!queueItems || queueItems.length <= 1 || !config.flow.enabled) {
    return queueItems ? queueItems.map((item) => item.candidate || item) : [];
  }

  const seedFeat = extractSongFeatures(seedTrack, config);
  const remaining = queueItems.map((item) => ({
    rawItem: item,
    features: item.features || extractSongFeatures(item.candidate || item, config),
  }));

  const ordered = [];
  const orderedFeats = [];
  let currentFeat = seedFeat;

  const wBpm = config.flow.weightBpm ?? 0.55;
  const wMood = config.flow.weightMood ?? 0.45;

  while (remaining.length > 0) {
    let bestIndex = -1;
    let minDistance = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candFeat = remaining[i].features;

      // Ensure ordering preserves artist diversity constraints
      if (remaining.length > 1 && violatesDiversityConstraints(candFeat, orderedFeats, config)) {
        continue;
      }

      // 1. BPM transition cost (normalized to 60 BPM range)
      const bpmDiff = Math.abs(currentFeat.tempo - candFeat.tempo);
      const harmonicDiff = Math.min(
        bpmDiff,
        Math.abs(currentFeat.tempo * 2 - candFeat.tempo),
        Math.abs(currentFeat.tempo - candFeat.tempo * 2)
      );
      const bpmCost = Math.min(1.0, harmonicDiff / 60);

      // 2. Mood transition cost (Valence and Energy Euclidean distance)
      const dV = currentFeat.valence - candFeat.valence;
      const dE = currentFeat.energy - candFeat.energy;
      const moodCost = Math.sqrt(dV * dV + dE * dE) / 1.4142;

      // Combined transition cost
      const distance = wBpm * bpmCost + wMood * moodCost;

      if (distance < minDistance) {
        minDistance = distance;
        bestIndex = i;
      }
    }

    if (bestIndex === -1) {
      bestIndex = 0;
    }

    const chosen = remaining.splice(bestIndex, 1)[0];
    ordered.push(chosen.rawItem.candidate || chosen.rawItem);
    orderedFeats.push(chosen.features);
    currentFeat = chosen.features;
  }

  return ordered;
}
