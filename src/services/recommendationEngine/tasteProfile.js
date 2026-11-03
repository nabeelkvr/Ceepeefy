/**
 * User Taste Profile Builder with 14-Day Exponential Time Decay
 */

import { RECOMMENDATION_CONFIG } from "./config.js";
import { cleanStr, extractArtists, normalizeMovieAlbum } from "../../utils/recommendationEngine.js";
import { classifySongDetailed } from "../../utils/songClassifier.js";

/**
 * Calculates exponential time decay factor based on age in days.
 * Formula: exp(-ln(2) * ageDays / halfLifeDays)
 */
export function calculateTimeDecay(ageDays, halfLifeDays = RECOMMENDATION_CONFIG.decayHalfLifeDays) {
  if (ageDays <= 0) return 1.0;
  return Math.exp((-Math.LN2 * ageDays) / halfLifeDays);
}

/**
 * Builds a multi-dimensional user taste profile from history, likes, playlists, and skips.
 *
 * @param {object} userData
 * @param {Array<object>} userData.recentlyPlayed - Array of played track objects
 * @param {Array<object|string>} userData.likedTracks - Array of liked track objects or IDs
 * @param {Array<object>} userData.customPlaylists - User's custom playlists with tracks
 * @param {Array<object|string>} userData.skips - Skipped track events or IDs
 * @param {number} [nowTimestamp=Date.now()]
 * @returns {object} Normalized taste profile
 */
export function buildTasteProfile(userData = {}, nowTimestamp = Date.now()) {
  const {
    recentlyPlayed = [],
    likedTracks = [],
    customPlaylists = [],
    skips = [],
  } = userData;

  const artistWeights = new Map();
  const genreWeights = new Map();
  const moodWeights = new Map();
  const tempoWeights = { slow: 0, medium: 0, fast: 0 };
  const languageWeights = new Map();

  const playedIdsIn24h = new Set();
  const allPlayedIds = new Set();
  const likedIds = new Set();
  const skippedIds = new Set();
  const skippedArtists = new Map();
  const mostRecentArtists = [];

  const msInDay = 24 * 60 * 60 * 1000;

  // Helper to add weighted features into the profile
  const recordEvent = (track, baseWeight, eventAgeDays) => {
    if (!track) return;
    const tid = String(track.id || track.trackId || "");
    if (!tid) return;

    const decay = calculateTimeDecay(eventAgeDays);
    const weight = baseWeight * decay;

    // Artists
    const artists = extractArtists(track);
    artists.forEach((art) => {
      const cur = artistWeights.get(art) || 0;
      artistWeights.set(art, cur + weight);
    });

    // Classification (Mood, Genre, Language, Tempo/Energy)
    const classified = classifySongDetailed(track);

    // Genre
    const genre = (track.genre || classified?.genre || "").toLowerCase().trim();
    if (genre) {
      const cur = genreWeights.get(genre) || 0;
      genreWeights.set(genre, cur + weight);
    }

    // Mood
    const mood = (classified?.mood || track.mood || "").toLowerCase().trim();
    if (mood) {
      const cur = moodWeights.get(mood) || 0;
      moodWeights.set(mood, cur + weight);
    }

    // Tempo / Energy
    const energy = classified?.energy || (track.tempo > 125 ? 5 : track.tempo < 85 ? 2 : 3);
    if (energy <= 2) tempoWeights.slow += weight;
    else if (energy >= 5) tempoWeights.fast += weight;
    else tempoWeights.medium += weight;

    // Language
    const lang = (classified?.language || track.language || "").toLowerCase().trim();
    if (lang) {
      const cur = languageWeights.get(lang) || 0;
      languageWeights.set(lang, cur + weight);
    }
  };

  // 1. Process play history
  recentlyPlayed.forEach((item, idx) => {
    const track = item.track || item;
    const tid = String(track.id || track.trackId || "");
    if (!tid) return;

    allPlayedIds.add(tid);

    const playedAt = item.playedAt || item.timestamp || item.lastPlayedAt;
    let ageDays = 0;
    if (playedAt) {
      const timeDiff = nowTimestamp - new Date(playedAt).getTime();
      ageDays = Math.max(0, timeDiff / msInDay);
      if (timeDiff <= 24 * 60 * 60 * 1000) {
        playedIdsIn24h.add(tid);
      }
    } else {
      // Inferred age based on position in recents array
      ageDays = idx * 0.25;
      if (idx < 5) playedIdsIn24h.add(tid);
    }

    // Collect artists from the most recent 3 items for recency bonus
    if (idx < 3) {
      const recentArts = extractArtists(track);
      recentArts.forEach((art) => {
        if (!mostRecentArtists.includes(art)) mostRecentArtists.push(art);
      });
    }

    const isFullPlay = item.completed !== false && item.fullPlay !== false;
    const eventWeight = isFullPlay
      ? RECOMMENDATION_CONFIG.eventWeights.fullPlay
      : RECOMMENDATION_CONFIG.eventWeights.partialPlay;

    recordEvent(track, eventWeight, ageDays);
  });

  // 2. Process likes (+3 weight)
  likedTracks.forEach((item) => {
    const track = typeof item === "object" ? item : { id: item };
    const tid = String(track.id || track.trackId || "");
    if (tid) likedIds.add(tid);

    const likedAt = item.likedAt || item.timestamp;
    const ageDays = likedAt ? Math.max(0, (nowTimestamp - new Date(likedAt).getTime()) / msInDay) : 2;
    recordEvent(track, RECOMMENDATION_CONFIG.eventWeights.like, ageDays);
  });

  // 3. Process custom playlists (+2 weight)
  customPlaylists.forEach((playlist) => {
    const tracks = playlist.tracks || [];
    const ageDays = playlist.updatedAt
      ? Math.max(0, (nowTimestamp - new Date(playlist.updatedAt).getTime()) / msInDay)
      : 5;

    tracks.forEach((track) => {
      recordEvent(track, RECOMMENDATION_CONFIG.eventWeights.playlistAdd, ageDays);
    });
  });

  // 4. Process skips (-2 weight & penalty tracking)
  skips.forEach((item) => {
    const track = typeof item === "object" ? item : { id: item };
    const tid = String(track.id || track.trackId || "");
    if (tid) skippedIds.add(tid);

    const arts = extractArtists(track);
    arts.forEach((art) => {
      skippedArtists.set(art, (skippedArtists.get(art) || 0) + 1);
    });

    const ageDays = item.timestamp ? Math.max(0, (nowTimestamp - new Date(item.timestamp).getTime()) / msInDay) : 0.5;
    recordEvent(track, RECOMMENDATION_CONFIG.eventWeights.skip, ageDays);
  });

  // Helper to normalize a Map of weights into [0, 1] relative proportions
  const normalizeMap = (map) => {
    let sum = 0;
    map.forEach((val) => {
      if (val > 0) sum += val;
    });
    const normalized = new Map();
    if (sum > 0) {
      map.forEach((val, key) => {
        if (val > 0) normalized.set(key, val / sum);
      });
    }
    return { weights: map, proportions: normalized, sum };
  };

  const hasHistory = allPlayedIds.size > 0 || likedIds.size > 0;

  return {
    hasHistory,
    artistProfile: normalizeMap(artistWeights),
    genreProfile: normalizeMap(genreWeights),
    moodProfile: normalizeMap(moodWeights),
    tempoWeights,
    languageProfile: normalizeMap(languageWeights),
    playedIdsIn24h,
    allPlayedIds,
    likedIds,
    skippedIds,
    skippedArtists,
    mostRecentArtists,
  };
}

