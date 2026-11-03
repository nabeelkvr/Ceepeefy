/**
 * Popularity, Replay, Recency & Personal Affinity Scorer
 * 
 * Computes normalized (0.0 to 1.0) feature signals:
 * 1. Popularity: Log-scaled total play count
 * 2. Replay: Likes, completions, or playlist addition signals
 * 3. Recency & Trending: Exponential decay from release date (half-life ~75 days) + trending indicator
 * 4. Personal Affinity: User's recently listened/liked artists & languages
 */

import { SEARCH_RANKING_CONFIG } from "./config.js";

/**
 * Extracts numeric play count from various data types / fields
 * 
 * @param {any} rawPlays 
 * @returns {number} Integer play count
 */
export function parsePlayCount(rawPlays) {
  if (rawPlays === null || rawPlays === undefined) return 0;
  if (typeof rawPlays === "number") return isNaN(rawPlays) ? 0 : Math.round(rawPlays);

  const str = String(rawPlays).trim().toUpperCase();
  if (!str) return 0;

  const match = str.match(/^([\d,.]+)\s*([BKM])?$/);
  if (match) {
    const numPart = parseFloat(match[1].replace(/,/g, ""));
    if (isNaN(numPart)) return 0;
    const suffix = match[2];
    if (suffix === "B") return Math.round(numPart * 1000000000);
    if (suffix === "M") return Math.round(numPart * 1000000);
    if (suffix === "K") return Math.round(numPart * 1000);
    return Math.round(numPart);
  }

  const num = parseFloat(str.replace(/[^0-9.]/g, ""));
  return isNaN(num) ? 0 : Math.round(num);
}

/**
 * Computes log-scaled popularity score (0.0 to 1.0)
 * 
 * @param {Object} item 
 * @param {Object} config 
 * @returns {number}
 */
export function calculatePopularitySignal(item, config = SEARCH_RANKING_CONFIG) {
  const plays = parsePlayCount(
    item.playCount ?? item.play_count ?? item.plays ?? item.ctr ?? item.listeners ?? 0
  );

  if (plays <= 0) return 0.05; // Base floor

  const maxPlays = config.thresholds.maxExpectedPlays;
  const logScore = Math.log10(1 + plays) / Math.log10(1 + maxPlays);
  return Math.max(0.0, Math.min(1.0, logScore));
}

/**
 * Computes replay / engagement signal (0.0 to 1.0)
 * 
 * @param {Object} item 
 * @returns {number}
 */
export function calculateReplaySignal(item) {
  let score = 0;

  // 1. User likes or total like count
  const likes = parsePlayCount(item.likes ?? item.likeCount ?? item.favorites ?? 0);
  if (likes > 0) {
    score += Math.min(0.5, Math.log10(1 + likes) / 7.0);
  }

  // 2. Playlist inclusions
  const playlistAdds = parsePlayCount(item.playlistAdds ?? item.inPlaylists ?? item.playlistsCount ?? 0);
  if (playlistAdds > 0) {
    score += Math.min(0.3, Math.log10(1 + playlistAdds) / 5.0);
  }

  // 3. User finish / completion flag if available
  if (item.isLiked || item.liked) {
    score += 0.40;
  }
  if (item.isReplayed || item.replayed) {
    score += 0.30;
  }

  return Math.max(0.0, Math.min(1.0, score));
}

/**
 * Computes release recency & trending score with exponential decay
 * 
 * @param {Object} item 
 * @param {Object} config 
 * @returns {number}
 */
export function calculateRecencyTrendingSignal(item, config = SEARCH_RANKING_CONFIG) {
  let score = 0;

  // 1. Trending / Chart Indicator
  if (item.isTrending || item.chartRank || item.badge === "Trending" || item.badgeType === "trending") {
    score += 0.50;
  }

  // 2. Release date recency with exponential decay
  let releaseYear = parseInt(
    item.year || item.releaseDate?.slice(0, 4) || item.release_date?.slice(0, 4) || "0",
    10
  );

  const currentYear = new Date().getFullYear();

  if (releaseYear && releaseYear >= 1950 && releaseYear <= currentYear + 1) {
    // Check if releaseDate has specific day/month for precision
    let ageInDays = (currentYear - releaseYear) * 365;

    const rawDateStr = item.releaseDate || item.release_date;
    if (rawDateStr && rawDateStr.includes("-")) {
      const parsedTime = Date.parse(rawDateStr);
      if (!isNaN(parsedTime)) {
        ageInDays = Math.max(0, (Date.now() - parsedTime) / (1000 * 60 * 60 * 24));
      }
    }

    const halfLife = config.thresholds.recencyHalfLifeDays;
    const lambda = Math.LN2 / halfLife;
    const decayScore = Math.exp(-lambda * (ageInDays / 30)); // Monthly scaled decay
    score += decayScore * 0.50;
  } else {
    score += 0.15; // Neutral default
  }

  return Math.max(0.0, Math.min(1.0, score));
}

/**
 * Computes personal taste affinity bonus for current user session
 * 
 * @param {Object} item 
 * @param {Object} context - { userLikedArtists: Set, userLikedLanguages: Set }
 * @returns {number}
 */
export function calculatePersonalAffinity(item, context = {}) {
  let bonus = 0;

  const itemArtist = (item.artist || item.primary_artist || item.name || "").toLowerCase();
  const itemLang = (item.language || item.more_info?.language || "").toLowerCase();

  if (context.userLikedArtists && context.userLikedArtists.has(itemArtist)) {
    bonus += 0.60;
  }

  if (context.userLikedLanguages && context.userLikedLanguages.has(itemLang)) {
    bonus += 0.40;
  }

  return Math.max(0.0, Math.min(1.0, bonus));
}
