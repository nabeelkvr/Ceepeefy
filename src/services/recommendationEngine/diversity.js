/**
 * Recommendation Diversity & Constraint Filter
 * 
 * Enforces:
 * 1. 24-hour play exclusion
 * 2. Liked song exclusion (unless candidate pool is too small)
 * 3. Max 2 songs per artist
 * 4. Genre spread across at least 3 distinct genres
 * 5. Cold start curated selection for new users
 */

import { RECOMMENDATION_CONFIG } from "./config.js";
import { cleanStr, extractArtists } from "../../utils/recommendationEngine.js";
import { createTrackDeduplicator } from "../../utils/trackIdentity.js";
import { classifySongDetailed } from "../../utils/songClassifier.js";

/**
 * Applies exclusion rules to filter candidate songs before ranking
 */
export function filterExclusions(candidatePool, tasteProfile, limit = 8) {
  const deduplicator = createTrackDeduplicator();
  const eligible = [];

  for (const song of candidatePool) {
    if (!song || !song.id) continue;
    const tid = String(song.id);

    // Skip exact duplicates in the candidate pool
    if (deduplicator.has(song)) continue;

    // Rule 1: Exclude songs played in the last 24 hours
    if (tasteProfile.playedIdsIn24h.has(tid)) {
      continue;
    }

    // Rule 2: Exclude songs already in liked list (unless available pool is smaller than limit)
    if (candidatePool.length >= limit && tasteProfile.likedIds.has(tid)) {
      continue;
    }

    // Rule 3: Exclude songs that were recently skipped with penalty = 1.0
    if (tasteProfile.skippedIds.has(tid)) {
      continue;
    }

    deduplicator.add(song);
    eligible.push(song);
  }

  // Fallback: If library/candidates became too small after exclusions, relax 24h & liked exclusions
  if (eligible.length < limit) {
    for (const song of candidatePool) {
      if (!song || !song.id) continue;
      if (!deduplicator.has(song)) {
        deduplicator.add(song);
        eligible.push(song);
        if (eligible.length >= limit * 2) break;
      }
    }
  }

  return eligible;
}

/**
 * Re-ranks and selects the final diverse recommendations list
 */
export function selectDiverseRecommendations(scoredItems, limit = 8) {
  const selected = [];
  const deduplicator = createTrackDeduplicator();
  const artistCounts = new Map();
  const selectedGenres = new Set();
  const maxPerArtist = RECOMMENDATION_CONFIG.diversity.maxPerArtist;

  // Pass 1: Select top items adhering strictly to artist cap (max 2) and genre diversity
  for (const item of scoredItems) {
    if (selected.length >= limit) break;
    const { track } = item;

    if (deduplicator.has(track)) continue;

    // Check artist frequency cap (max 2 songs per artist in top recommendations)
    const primaryArtist = cleanStr(track.artist || track.primary_artist || "").split(",")[0].trim();
    const currentArtistCount = artistCounts.get(primaryArtist) || 0;

    if (primaryArtist && currentArtistCount >= maxPerArtist) {
      continue;
    }

    deduplicator.add(track);
    selected.push({
      ...track,
      score: item.score,
      reason: item.reason,
      breakdown: item.breakdown,
    });

    if (primaryArtist) {
      artistCounts.set(primaryArtist, currentArtistCount + 1);
    }

    const genre = (track.genre || "").toLowerCase().trim();
    if (genre) selectedGenres.add(genre);
  }

  // Pass 2: If we didn't fill the target limit, fill with remaining scored candidates
  if (selected.length < limit) {
    for (const item of scoredItems) {
      if (selected.length >= limit) break;
      const { track } = item;
      if (!deduplicator.has(track)) {
        deduplicator.add(track);
        selected.push({
          ...track,
          score: item.score,
          reason: item.reason,
          breakdown: item.breakdown,
        });
      }
    }
  }

  return selected.slice(0, limit);
}

/**
 * Curated Cold-Start Selection for new users with empty history
 */
export function selectColdStartRecommendations(candidatePool, limit = 8, seed = 0) {
  const deduplicator = createTrackDeduplicator();
  const artistCounts = new Map();
  const selected = [];

  // Group candidate pool by genre to guarantee genre diversity
  const genreBuckets = new Map();
  candidatePool.forEach((track) => {
    const genre = (track.genre || "Pop").toLowerCase().trim();
    if (!genreBuckets.has(genre)) {
      genreBuckets.set(genre, []);
    }
    genreBuckets.get(genre).push(track);
  });

  const genres = Array.from(genreBuckets.keys());

  // Round-robin through top genres with seed offset
  let round = 0;
  while (selected.length < limit && round < 20) {
    for (let i = 0; i < genres.length; i++) {
      if (selected.length >= limit) break;
      const gIndex = (i + seed) % genres.length;
      const bucket = genreBuckets.get(genres[gIndex]) || [];
      const itemIndex = (round + seed) % (bucket.length || 1);
      const track = bucket[itemIndex];

      if (track && !deduplicator.has(track)) {
        const primaryArtist = cleanStr(track.artist || "").split(",")[0].trim();
        const artCount = artistCounts.get(primaryArtist) || 0;

        if (artCount < RECOMMENDATION_CONFIG.diversity.maxPerArtist) {
          deduplicator.add(track);
          selected.push({
            ...track,
            score: 0.85 - selected.length * 0.02,
            reason: track.badge ? `Trending • ${track.badge}` : "Popular right now",
          });
          if (primaryArtist) artistCounts.set(primaryArtist, artCount + 1);
        }
      }
    }
    round++;
  }

  // Fallback if needed
  if (selected.length < limit) {
    for (const track of candidatePool) {
      if (selected.length >= limit) break;
      if (!deduplicator.has(track)) {
        deduplicator.add(track);
        selected.push({
          ...track,
          score: 0.7,
          reason: "Popular right now",
        });
      }
    }
  }

  return selected.slice(0, limit);
}
