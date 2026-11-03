/**
 * Spotify-Style Entity Ranker for Songs, Albums, and Artists
 * 
 * Implements:
 * 1. Multi-factor final score combination with strict relevance gating
 * 2. Version demotion (original > remix / cover / live unless explicitly queried)
 * 3. Artist search boosting (exact artist query ranks artist #1 and boosts their top tracks)
 * 4. Album aggregation & exact album match prioritizing
 * 5. Intra-result diversity guard & deterministic tie-breaking
 * 6. Optional debug logging flag (OFF by default)
 */

import { SEARCH_RANKING_CONFIG } from "./config.js";
import { normalizeText } from "./textNormalizer.js";
import { calculateTextRelevance } from "./textScorer.js";
import {
  parsePlayCount,
  calculatePopularitySignal,
  calculateReplaySignal,
  calculateRecencyTrendingSignal,
  calculatePersonalAffinity,
} from "./popularityScorer.js";

/**
 * Normalizes title for deduplication of remix/re-upload variations
 */
export function normalizeBaseTitle(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&quot;|&#039;|&#39;|&amp;|&lt;|&gt;/g, " ")
    .replace(
      /\s*[\(\[][^\)\]]*(?:remix|mix|edit|acoustic|live|slowed|reverb|version|deluxe|audio|video|lyric|theme|bgm|ost|feat|ft|club|soundtrack)[^\)\]]*[\)\]]/gi,
      ""
    )
    .replace(/\s*-\s*.*?(?:remix|mix|edit|acoustic|live|slowed|reverb|version|deluxe|audio|video|lyric|theme|bgm|ost|club|soundtrack).*/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detects if a title represents a non-original version
 */
export function detectSongVersion(title, artist = "") {
  const combined = `${title} ${artist}`.toLowerCase();
  return {
    isRemix: /\b(remix|dj\s*remix|mashup|club\s*mix|extended\s*mix)\b/i.test(combined),
    isAcoustic: /\b(acoustic|unplugged|piano\s*version|guitar\s*version)\b/i.test(combined),
    isCover: /\b(cover|tribute|originally\s*performed|rendition)\b/i.test(combined),
    isKaraoke: /\b(karaoke|instrumental|minus\s*one|backing\s*track)\b/i.test(combined),
    isLive: /\b(live|concert|tour\s*edition)\b/i.test(combined),
    isSlowedReverb: /\b(slowed|reverb|l\/o\/f\/i|lofi\s*flip)\b/i.test(combined),
  };
}

/**
 * Computes the unified final score for an item
 */
export function computeFinalScore(item, rawQuery, context = {}, config = SEARCH_RANKING_CONFIG) {
  const { textScore, passedGate, matchDetails } = calculateTextRelevance(item, rawQuery, config);

  if (!passedGate) {
    return {
      finalScore: 0.0,
      passedGate: false,
      scores: { text: 0, popularity: 0, replay: 0, recency: 0, personal: 0 },
      matchDetails,
    };
  }

  const popScore = calculatePopularitySignal(item, config);
  const repScore = calculateReplaySignal(item);
  const recScore = calculateRecencyTrendingSignal(item, config);
  const perScore = calculatePersonalAffinity(item, context);

  const w = config.weights;
  let score =
    w.textRelevance * textScore +
    w.popularity * popScore +
    w.replay * repScore +
    w.recencyTrending * recScore +
    w.personalAffinity * perScore;

  // -----------------------------------------------------------
  // Version Adjustments for Songs
  // (Originals prioritized over remixes/covers unless user explicitly queried for them)
  // -----------------------------------------------------------
  const rawTitle = item.title || item.song || "";
  const version = detectSongVersion(rawTitle, item.artist || "");
  const normQuery = normalizeText(rawQuery);
  const isExplicitRemix = /\b(remix|mix|mashup)\b/i.test(normQuery);
  const isExplicitAcoustic = /\b(acoustic|unplugged)\b/i.test(normQuery);
  const isExplicitCover = /\b(cover|karaoke|instrumental)\b/i.test(normQuery);
  const isExplicitLive = /\b(live|concert)\b/i.test(normQuery);
  const isExplicitSlowed = /\b(slowed|reverb)\b/i.test(normQuery);

  const vp = config.versionPenalties;
  let versionDelta = 0;

  if (version.isRemix && !isExplicitRemix) versionDelta -= vp.remix;
  if (version.isAcoustic && !isExplicitAcoustic) versionDelta -= vp.acoustic;
  if ((version.isCover || version.isKaraoke) && !isExplicitCover) versionDelta -= vp.coverOrKaraoke;
  if (version.isLive && !isExplicitLive) versionDelta -= vp.live;
  if (version.isSlowedReverb && !isExplicitSlowed) versionDelta -= vp.slowedReverb;

  if (
    !version.isRemix &&
    !version.isAcoustic &&
    !version.isCover &&
    !version.isKaraoke &&
    !version.isLive &&
    !version.isSlowedReverb
  ) {
    versionDelta += vp.originalBonus; // Bonus for official / standard version
  }

  // Artist search boost: If query matches an artist name, boost songs by that artist
  if (context.matchedArtistName) {
    const itemArtist = normalizeText(item.artist || item.primary_artist || "");
    if (itemArtist.includes(context.matchedArtistName) || context.matchedArtistName.includes(itemArtist)) {
      score += 0.20;
    }
  }

  const finalScore = Math.max(0.01, score + versionDelta);

  if (config.debugRanking) {
    console.log(`[SearchRanker] "${rawTitle}" by "${item.artist}":`, {
      finalScore: finalScore.toFixed(3),
      text: textScore.toFixed(3),
      pop: popScore.toFixed(3),
      rep: repScore.toFixed(3),
      rec: recScore.toFixed(3),
      verDelta: versionDelta.toFixed(3),
    });
  }

  return {
    finalScore,
    passedGate: true,
    scores: {
      text: textScore,
      popularity: popScore,
      replay: repScore,
      recency: recScore,
      personal: perScore,
    },
    matchDetails,
  };
}

/**
 * Deterministic tie-breaker:
 * 1. Final score descending
 * 2. Popularity (play count) descending
 * 3. Release year descending
 * 4. Alphabetical title ascending
 */
export function compareItems(a, b) {
  if (Math.abs(b.searchScore - a.searchScore) > 0.0001) {
    return b.searchScore - a.searchScore;
  }
  const playsA = parsePlayCount(a.playCount ?? a.play_count ?? a.plays ?? a.ctr ?? 0);
  const playsB = parsePlayCount(b.playCount ?? b.play_count ?? b.plays ?? b.ctr ?? 0);
  if (playsB !== playsA) {
    return playsB - playsA;
  }
  const yearA = parseInt(a.year || "0", 10) || 0;
  const yearB = parseInt(b.year || "0", 10) || 0;
  if (yearB !== yearA) {
    return yearB - yearA;
  }
  const titleA = (a.title || a.name || "").toLowerCase();
  const titleB = (b.title || b.name || "").toLowerCase();
  return titleA.localeCompare(titleB);
}

/**
 * Deduplicates and ranks song candidates
 * 
 * @param {Array} rawSongs - Songs to rank
 * @param {string} rawQuery - Search query
 * @param {Object} context - Optional context (activeEntity, user preferences)
 * @param {Object} config - System config
 * @returns {Array} Intelligently ranked songs
 */
export function rankSongs(rawSongs, rawQuery, context = {}, config = SEARCH_RANKING_CONFIG) {
  if (!Array.isArray(rawSongs) || rawSongs.length === 0) return [];
  const trimmed = (rawQuery || "").trim();
  if (!trimmed) return rawSongs;
  const normQuery = normalizeText(trimmed);
  if (!normQuery) return [];

  // 1. Deduplicate identical song versions (retaining highest playCount / valid audioUrl)
  const dedupMap = new Map();
  for (const s of rawSongs) {
    if (!s || (!s.title && !s.song)) continue;
    const baseTitle = normalizeBaseTitle(s.title || s.song);
    const baseArtist = normalizeText(s.artist || s.primary_artist || "");
    const version = detectSongVersion(s.title || s.song, s.artist);

    // Keep legitimate remixes as distinct candidates, but collapse exact duplicate uploads
    const variantTag = version.isRemix || version.isAcoustic || version.isCover
      ? `:::${normalizeText(s.title || s.song)}`
      : "";
    const key = `${baseTitle}:::${baseArtist}${variantTag}`;

    const trackPlays = parsePlayCount(s.playCount ?? s.play_count ?? s.plays ?? s.ctr ?? 0);
    const existing = dedupMap.get(key);

    if (!existing) {
      dedupMap.set(key, { ...s, playCount: trackPlays });
    } else {
      const existingPlays = existing.playCount || 0;
      const higherPlays = Math.max(trackPlays, existingPlays);
      const winner = trackPlays >= existingPlays ? s : existing;
      dedupMap.set(key, {
        ...winner,
        audioUrl: winner.audioUrl || existing.audioUrl || s.audioUrl,
        playCount: higherPlays,
      });
    }
  }

  const dedupedSongs = Array.from(dedupMap.values());

  // 2. Score all deduped songs
  const scoredSongs = [];
  for (const song of dedupedSongs) {
    const scoreResult = computeFinalScore(song, rawQuery, context, config);
    if (scoreResult.passedGate) {
      scoredSongs.push({
        ...song,
        searchScore: scoreResult.finalScore,
        scoreBreakdown: scoreResult.scores,
      });
    }
  }

  // 3. Sort by final score + tie-breakers
  scoredSongs.sort(compareItems);

  // 4. Diversity Guard: Avoid one artist dominating the entire top 10 (unless query matches that artist)
  if (!context.matchedArtistName && scoredSongs.length > 5) {
    const maxArtistShare = config.thresholds.maxArtistShareInTopSongs;
    const artistCounts = new Map();
    const topTen = [];
    const deferred = [];

    for (const song of scoredSongs) {
      const art = normalizeText(song.artist || song.primary_artist || "");
      const count = artistCounts.get(art) || 0;
      if (topTen.length < 10 && count >= maxArtistShare) {
        deferred.push(song);
      } else {
        topTen.push(song);
        if (art) artistCounts.set(art, count + 1);
      }
    }

    return [...topTen, ...deferred];
  }

  return scoredSongs;
}

/**
 * Ranks artists: exact match ranks first, followed by aggregate popularity
 * 
 * @param {Array} rawArtists - Artists to rank
 * @param {string} rawQuery - Search query
 * @param {Object} context - Optional context
 * @param {Object} config - Config
 */
export function rankArtists(rawArtists, rawQuery, context = {}, config = SEARCH_RANKING_CONFIG) {
  if (!Array.isArray(rawArtists) || rawArtists.length === 0) return [];
  const trimmed = (rawQuery || "").trim();
  if (!trimmed) return rawArtists;
  const normQuery = normalizeText(trimmed);
  if (!normQuery) return [];

  const scoredArtists = [];
  for (const art of rawArtists) {
    const artName = art.name || art.title || "";
    const normArt = normalizeText(artName);
    const textRes = calculateTextRelevance({ title: artName, artist: artName }, rawQuery, config);

    if (textRes.passedGate) {
      let score = textRes.textScore * 0.65;
      const plays = parsePlayCount(art.ctr ?? art.playCount ?? art.plays ?? 0);
      const popScore = calculatePopularitySignal({ playCount: plays }, config);
      score += popScore * 0.35;

      // Exact artist name match gets top priority
      if (normArt === normQuery) {
        score += 1.0;
      } else if (normArt.startsWith(normQuery)) {
        score += 0.40;
      }

      scoredArtists.push({
        ...art,
        searchScore: score,
        scoreBreakdown: { text: textRes.textScore, pop: popScore },
      });
    }
  }

  scoredArtists.sort(compareItems);
  return scoredArtists;
}

/**
 * Ranks albums: exact album name ranks first, followed by track plays and release recency
 * 
 * @param {Array} rawAlbums - Albums to rank
 * @param {string} rawQuery - Search query
 * @param {Object} context - Optional context
 * @param {Object} config - Config
 */
export function rankAlbums(rawAlbums, rawQuery, context = {}, config = SEARCH_RANKING_CONFIG) {
  if (!Array.isArray(rawAlbums) || rawAlbums.length === 0) return [];
  const trimmed = (rawQuery || "").trim();
  if (!trimmed) return rawAlbums;
  const normQuery = normalizeText(trimmed);
  if (!normQuery) return [];

  const scoredAlbums = [];
  for (const alb of rawAlbums) {
    const albTitle = alb.title || alb.name || "";
    const normAlb = normalizeText(albTitle);
    const textRes = calculateTextRelevance(alb, rawQuery, config);

    if (textRes.passedGate) {
      let score = textRes.textScore * 0.55;
      const plays = parsePlayCount(alb.ctr ?? alb.playCount ?? alb.plays ?? 0);
      const popScore = calculatePopularitySignal({ playCount: plays }, config);
      const recScore = calculateRecencyTrendingSignal(alb, config);
      score += popScore * 0.25 + recScore * 0.20;

      // Exact album name match gets top priority
      if (normAlb === normQuery) {
        score += 1.0;
      } else if (normAlb.startsWith(normQuery)) {
        score += 0.40;
      }

      // Boost album if artist matches query
      if (context.matchedArtistName) {
        const albArt = normalizeText(alb.artist || alb.music || "");
        if (albArt.includes(context.matchedArtistName)) {
          score += 0.25;
        }
      }

      scoredAlbums.push({
        ...alb,
        searchScore: score,
        scoreBreakdown: { text: textRes.textScore, pop: popScore, recency: recScore },
      });
    }
  }

  scoredAlbums.sort(compareItems);
  return scoredAlbums;
}
