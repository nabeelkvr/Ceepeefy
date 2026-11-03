/**
 * Spotify-Style Search Ranking System
 * 
 * Modular exports for text normalization, multi-tier text relevance scoring,
 * popularity/replay/recency signals, entity ranking for songs, albums, and artists,
 * and high-performance in-memory caching.
 */

export { SEARCH_RANKING_CONFIG } from "./config.js";
export {
  normalizeText,
  extractAliases,
  tokenizeText,
  levenshteinDistance,
  isTypoMatch,
} from "./textNormalizer.js";
export {
  scoreFieldMatch,
  calculateTextRelevance,
} from "./textScorer.js";
export {
  parsePlayCount,
  calculatePopularitySignal,
  calculateReplaySignal,
  calculateRecencyTrendingSignal,
  calculatePersonalAffinity,
} from "./popularityScorer.js";
export {
  normalizeBaseTitle,
  detectSongVersion,
  computeFinalScore,
  compareItems,
  rankSongs,
  rankArtists,
  rankAlbums,
} from "./entityRanker.js";
export { searchLRUCache } from "./searchIndex.js";

import { SEARCH_RANKING_CONFIG } from "./config.js";
import { normalizeText } from "./textNormalizer.js";
import { rankSongs, rankArtists, rankAlbums } from "./entityRanker.js";

/**
 * Unified search ranking coordinator:
 * Takes raw candidate lists of songs, albums, and artists, and ranks them
 * according to Spotify's entity-aware multi-factor relevance and popularity hierarchy.
 * 
 * @param {Object} rawCatalogResult - { songs, artists, albums, playlists, topMatch }
 * @param {string} rawQuery - The user's search query
 * @param {Object} context - Optional user session context
 * @param {Object} config - Config overrides
 * @returns {Object} Search result with intelligently ranked sections and topMatch
 */
export function rankAllSearchEntities(rawCatalogResult, rawQuery, context = {}, config = SEARCH_RANKING_CONFIG) {
  if (!rawCatalogResult || !rawQuery) {
    return rawCatalogResult || { songs: [], artists: [], albums: [], playlists: [], topMatch: null };
  }

  const normQuery = normalizeText(rawQuery);
  if (!normQuery) return rawCatalogResult;

  const rawSongs = Array.isArray(rawCatalogResult.songs)
    ? rawCatalogResult.songs
    : (Array.isArray(rawCatalogResult.tracks) ? rawCatalogResult.tracks : []);
  const rawArtists = Array.isArray(rawCatalogResult.artists) ? rawCatalogResult.artists : [];
  const rawAlbums = Array.isArray(rawCatalogResult.albums) ? rawCatalogResult.albums : [];
  const rawPlaylists = Array.isArray(rawCatalogResult.playlists) ? rawCatalogResult.playlists : [];

  // Check if query exactly matches an artist
  const exactArtistMatch = rawArtists.find((a) => normalizeText(a.name || a.title || "") === normQuery);
  const matchedArtistName = exactArtistMatch ? normalizeText(exactArtistMatch.name || exactArtistMatch.title || "") : null;

  const queryContext = {
    ...context,
    matchedArtistName,
  };

  // Rank each entity section with entity-specific rules
  const rankedSongs = rankSongs(rawSongs, rawQuery, queryContext, config);
  const rankedArtists = rankArtists(rawArtists, rawQuery, queryContext, config);
  const rankedAlbums = rankAlbums(rawAlbums, rawQuery, queryContext, config);

  // Resolve intelligent Top Match (Spotify behavior)
  let topMatch = null;
  const topSong = rankedSongs[0] || null;
  const topArtist = rankedArtists[0] || null;
  const topAlbum = rankedAlbums[0] || null;

  if (exactArtistMatch) {
    topMatch = {
      ...exactArtistMatch,
      type: "artist",
      badge: "Top Artist",
      badgeType: "artist",
    };
  } else if (topAlbum && normalizeText(topAlbum.title || topAlbum.name || "") === normQuery) {
    topMatch = {
      ...topAlbum,
      type: "album",
      badge: "Top Album",
      badgeType: "album",
    };
  } else if (topSong) {
    topMatch = {
      ...topSong,
      type: "song",
      badge: "Top Song",
      badgeType: "top",
    };
  } else if (topArtist) {
    topMatch = {
      ...topArtist,
      type: "artist",
      badge: "Top Artist",
      badgeType: "artist",
    };
  } else if (topAlbum) {
    topMatch = {
      ...topAlbum,
      type: "album",
      badge: "Top Album",
      badgeType: "album",
    };
  }

  return {
    ...rawCatalogResult,
    success: true,
    query: rawQuery,
    topMatch,
    songs: rankedSongs,
    tracks: rankedSongs,
    results: rankedSongs,
    artists: rankedArtists,
    albums: rankedAlbums,
    playlists: rawPlaylists,
  };
}
