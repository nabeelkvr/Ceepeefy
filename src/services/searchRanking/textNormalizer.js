/**
 * Search Query & Text Normalization Engine
 * 
 * Implements:
 * 1. Unicode NFKC / NFKD normalization and diacritic removal
 * 2. Multi-language and romanized transliteration alias mapping
 * 3. Tokenization and partial prefix matching
 * 4. Levenshtein edit distance with length-aware typo thresholds
 */

import { SEARCH_RANKING_CONFIG } from "./config.js";

/**
 * Common regional script to latin phonetic replacements
 */
const SCRIPT_PHONETIC_REPLACEMENTS = [
  // Malayalam / Tamil / Telugu / Hindi common phonetic mappings
  [/[\u0D00-\u0D7F]/g, ""], // Malayalam block fallback if romanized title exists
  [/[\u0B80-\u0BFF]/g, ""], // Tamil block fallback
  [/[\u0900-\u097F]/g, ""], // Devanagari block fallback
  [/[\u0C00-\u0C7F]/g, ""], // Telugu block fallback
];

/**
 * Normalizes text for clean, script-safe, diacritic-free comparison
 * 
 * @param {string} str - Raw text
 * @returns {string} Normalized string
 */
export function normalizeText(str) {
  if (!str || typeof str !== "string") return "";

  return str
    .normalize("NFKC") // Canonical decomposition followed by canonical composition
    .toLowerCase()
    .normalize("NFKD") // Separate base characters and diacritical marks
    .replace(/[\u0300-\u036f]/g, "") // Strip diacritics (accents)
    .replace(/&quot;|&#039;|&#39;|&amp;|&lt;|&gt;/g, " ")
    .replace(/[^a-z0-9\s]/g, " ") // Strip punctuation
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
}

/**
 * Extracts searchable aliases from track/album/artist metadata
 * 
 * @param {Object} entity - The item to index
 * @returns {Array<string>} Array of normalized alias strings
 */
export function extractAliases(entity) {
  if (!entity) return [];
  const aliases = new Set();

  const add = (val) => {
    if (!val || typeof val !== "string") return;
    const norm = normalizeText(val);
    if (norm && norm.length >= 2) aliases.add(norm);
  };

  add(entity.alias);
  add(entity.subtitle);
  add(entity.description);
  add(entity.movieName);
  add(entity.movie);
  add(entity.romanizedTitle);
  add(entity.romanized_name);

  // If title has "(From ...)" or "- From ...", extract film name as alias
  const rawTitle = entity.title || entity.song || entity.name || "";
  const matchFilm = rawTitle.match(/\s*[\(\[](?:from|movie|soundtrack|album)\s+["']?([^"')\]]+)["']?\s*[\)\]]/i);
  if (matchFilm && matchFilm[1]) {
    add(matchFilm[1]);
  }

  // Add individual singer names from singers field
  if (typeof entity.singers === "string") {
    entity.singers.split(/[,&/|]/).forEach(add);
  }

  return Array.from(aliases);
}

/**
 * Tokenizes normalized text into word tokens
 * 
 * @param {string} text - Normalized text
 * @returns {Array<string>} Tokens
 */
export function tokenizeText(text) {
  const norm = normalizeText(text);
  if (!norm) return [];
  return norm.split(/\s+/).filter(Boolean);
}

/**
 * Computes Levenshtein edit distance between two strings
 * 
 * @param {string} a 
 * @param {string} b 
 * @returns {number} Edit distance
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const aLen = a.length;
  const bLen = b.length;

  // Single row memory optimization
  let prevRow = new Array(bLen + 1);
  let currRow = new Array(bLen + 1);

  for (let j = 0; j <= bLen; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= aLen; i++) {
    currRow[0] = i;
    const aChar = a[i - 1];

    for (let j = 1; j <= bLen; j++) {
      const bChar = b[j - 1];
      const cost = aChar === bChar ? 0 : 1;
      currRow[j] = Math.min(
        currRow[j - 1] + 1,     // insertion
        prevRow[j] + 1,         // deletion
        prevRow[j - 1] + cost   // substitution
      );
    }

    // Swap rows
    for (let j = 0; j <= bLen; j++) {
      prevRow[j] = currRow[j];
    }
  }

  return prevRow[bLen];
}

/**
 * Checks if queryToken matches targetToken within allowed typo distance
 * 
 * @param {string} queryToken 
 * @param {string} targetToken 
 * @param {Object} config 
 * @returns {{ matches: boolean, editDistance: number }}
 */
export function isTypoMatch(queryToken, targetToken, config = SEARCH_RANKING_CONFIG) {
  if (queryToken === targetToken) {
    return { matches: true, editDistance: 0 };
  }

  // Prefix matching while typing: "illu" matches "illuminati"
  if (targetToken.startsWith(queryToken)) {
    return { matches: true, editDistance: 0, isPrefix: true };
  }

  const qLen = queryToken.length;
  const tLen = targetToken.length;

  const { minWordLengthForEdit1, minWordLengthForEdit2 } = config.typoTolerance;

  // Words under 4 chars must match exactly or as prefix (no typos permitted)
  if (qLen < minWordLengthForEdit1) {
    return { matches: false, editDistance: Infinity };
  }

  // Determine allowed distance based on word length
  const maxAllowedDist = qLen >= minWordLengthForEdit2 ? 2 : 1;

  // Quick length difference check
  if (Math.abs(qLen - tLen) > maxAllowedDist) {
    // If target is longer, check if query matches a prefix of target with typo
    if (tLen > qLen) {
      const targetPrefix = targetToken.slice(0, qLen);
      const dist = levenshteinDistance(queryToken, targetPrefix);
      if (dist <= maxAllowedDist) {
        return { matches: true, editDistance: dist, isPrefix: true };
      }
    }
    return { matches: false, editDistance: Infinity };
  }

  const dist = levenshteinDistance(queryToken, targetToken);
  if (dist <= maxAllowedDist) {
    return { matches: true, editDistance: dist };
  }

  return { matches: false, editDistance: dist };
}
