/**
 * Multi-Tier Text Relevance Scoring Engine
 * 
 * Computes a normalized 0.0 - 1.0 relevance score per item across:
 * - Title (weight 1.0)
 * - Artist (weight 0.75)
 * - Album (weight 0.60)
 * - Aliases (weight 0.80)
 * 
 * Implements strict tier hierarchy:
 * 1. Exact match (1.0)
 * 2. Starts with query (0.9)
 * 3. Word starts with query (0.8)
 * 4. All query tokens present in any order (0.7)
 * 5. Typo / fuzzy match (0.45 - 0.60)
 * + Combined Artist + Title co-occurrence bonus (+0.15)
 * 
 * Drops items below the relevance gate threshold (0.35) so popularity
 * can never push irrelevant items into search results.
 */

import { SEARCH_RANKING_CONFIG } from "./config.js";
import { normalizeText, tokenizeText, isTypoMatch, extractAliases } from "./textNormalizer.js";

/**
 * Evaluates the match tier score of a single string field against the normalized query
 * 
 * @param {string} rawFieldValue 
 * @param {string} normQuery 
 * @param {Array<string>} queryTokens 
 * @param {Object} config 
 * @returns {number} Score between 0.0 and 1.0
 */
export function scoreFieldMatch(rawFieldValue, normQuery, queryTokens, config = SEARCH_RANKING_CONFIG) {
  if (!rawFieldValue || !normQuery) return 0.0;
  const normField = normalizeText(rawFieldValue);
  if (!normField) return 0.0;

  const tiers = config.relevanceTiers;

  // Tier 1: Exact match (after normalization)
  if (normField === normQuery) {
    return tiers.exactMatch; // 1.0
  }

  // Tier 2: Starts with query
  if (normField.startsWith(normQuery)) {
    return tiers.startsWith; // 0.9
  }

  const fieldTokens = normField.split(/\s+/).filter(Boolean);

  // Tier 3: A word in the field starts with query
  const anyWordStartsWith = fieldTokens.some((word) => word.startsWith(normQuery));
  if (anyWordStartsWith) {
    return tiers.wordStartsWith; // 0.8
  }

  // Tier 4: All query tokens are present in the field (in any order)
  if (queryTokens.length > 0) {
    let allTokensFound = true;
    for (const qTok of queryTokens) {
      const foundInField = fieldTokens.some((fTok) => fTok === qTok || fTok.startsWith(qTok));
      if (!foundInField) {
        allTokensFound = false;
        break;
      }
    }
    if (allTokensFound) {
      return tiers.allTokensPresent; // 0.7
    }
  }

  // Tier 5: Fuzzy / Typo match
  if (queryTokens.length > 0) {
    let matchedTokenCount = 0;
    let totalEditDist = 0;

    for (const qTok of queryTokens) {
      let bestTokenMatch = null;
      let minTokenDist = Infinity;

      for (const fTok of fieldTokens) {
        const typoRes = isTypoMatch(qTok, fTok, config);
        if (typoRes.matches && typoRes.editDistance < minTokenDist) {
          minTokenDist = typoRes.editDistance;
          bestTokenMatch = typoRes;
        }
      }

      if (bestTokenMatch) {
        matchedTokenCount++;
        totalEditDist += minTokenDist;
      }
    }

    // If all or majority of tokens match via typo / prefix tolerance
    const matchRatio = matchedTokenCount / queryTokens.length;
    if (matchRatio === 1.0) {
      // 1-edit typo = 0.60, 2-edit typo = 0.45
      return totalEditDist <= 1 ? tiers.fuzzyEdit1 : tiers.fuzzyEdit2;
    } else if (queryTokens.length > 1 && matchRatio >= 0.66) {
      return tiers.fuzzyEdit2 * matchRatio;
    }
  }

  return 0.0;
}

/**
 * Computes overall text relevance score across title, artist, album, and aliases
 * 
 * @param {Object} item - Candidate song/album/artist
 * @param {string} rawQuery - Raw search query
 * @param {Object} config - Ranking configuration
 * @returns {{ textScore: number, passedGate: boolean, matchDetails: Object }}
 */
export function calculateTextRelevance(item, rawQuery, config = SEARCH_RANKING_CONFIG) {
  if (!item || !rawQuery) {
    return { textScore: 0, passedGate: false, matchDetails: {} };
  }

  const normQuery = normalizeText(rawQuery);
  if (!normQuery) {
    return { textScore: 0, passedGate: false, matchDetails: {} };
  }

  const queryTokens = tokenizeText(normQuery);
  const fw = config.fieldWeights;
  const tiers = config.relevanceTiers;

  // 1. Title match
  const rawTitle = item.title || item.song || item.name || "";
  const titleScore = scoreFieldMatch(rawTitle, normQuery, queryTokens, config);

  // 2. Artist match
  const rawArtist = item.artist || item.primary_artist || item.primaryArtist || item.singers || "";
  const artistScore = scoreFieldMatch(rawArtist, normQuery, queryTokens, config);

  // 3. Album match
  const rawAlbum = item.album || item.albumName || item.movieName || item.movie || "";
  const albumScore = scoreFieldMatch(rawAlbum, normQuery, queryTokens, config);

  // 4. Aliases match (transliterations, romanized titles, film mentions)
  const aliases = extractAliases(item);
  let aliasScore = 0;
  for (const alias of aliases) {
    const s = scoreFieldMatch(alias, normQuery, queryTokens, config);
    if (s > aliasScore) aliasScore = s;
  }

  // Find best weighted score across fields
  const weightedScores = [
    titleScore * fw.title,
    artistScore * fw.artist,
    albumScore * fw.album,
    aliasScore * fw.alias,
  ];

  let bestRawScore = Math.max(titleScore, artistScore * 0.9, albumScore * 0.85, aliasScore * 0.9);
  let bestScore = Math.max(...weightedScores);

  // 5. Co-occurrence bonus: Query matches both artist AND title (e.g. "anirudh hukum", "arijit kesariya")
  let hasArtistTitleBonus = false;
  if (queryTokens.length >= 2 && rawTitle && rawArtist) {
    const normTitle = normalizeText(rawTitle);
    const normArtist = normalizeText(rawArtist);
    const titleTokens = normTitle.split(/\s+/).filter(Boolean);
    const artistTokens = normArtist.split(/\s+/).filter(Boolean);

    let hasTitlePart = false;
    let hasArtistPart = false;

    for (const qTok of queryTokens) {
      if (titleTokens.some((t) => t.startsWith(qTok))) hasTitlePart = true;
      if (artistTokens.some((a) => a.startsWith(qTok))) hasArtistPart = true;
    }

    if (hasTitlePart && hasArtistPart) {
      hasArtistTitleBonus = true;
      bestScore = Math.min(1.0, Math.max(bestScore, tiers.allTokensPresent) + tiers.artistTitleBonus);
      bestRawScore = Math.min(1.0, bestRawScore + tiers.artistTitleBonus);
    }
  }

  // Normalized final text score: clamped in [0.0, 1.0]
  const finalScore = Math.max(0.0, Math.min(1.0, Math.max(bestScore, bestRawScore)));

  // Relevance Gate: Drop anything below threshold
  const passedGate = finalScore >= config.thresholds.relevanceGate;

  return {
    textScore: passedGate ? finalScore : 0.0,
    rawTextScore: finalScore,
    passedGate,
    matchDetails: {
      titleScore,
      artistScore,
      albumScore,
      aliasScore,
      hasArtistTitleBonus,
      matchedTitle: rawTitle,
      matchedArtist: rawArtist,
    },
  };
}
