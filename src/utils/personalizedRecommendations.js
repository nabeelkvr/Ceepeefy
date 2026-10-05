/**
 * Ceepify — Dynamic Personalized Recommendation Ranking Engine
 * 
 * Computes recommendation scores based on user listening behavior:
 * 1. Frequently played songs & artists
 * 2. Songs from artists the user listens to frequently
 * 3. Songs from movies/albums the user frequently listens to
 * 4. Language preference matching (e.g. Malayalam, Hindi, English)
 * 5. Genre and mood affinity
 * 6. Songs related to recently played songs
 * 7. 15–25% exploration of new/unplayed songs
 * 8. Controlled variation on refresh
 * 9. Fallback to popular curated songs for new users
 */

import {
  cleanStr,
  normalizeMovieAlbum,
  extractArtists,
  extractMovieName,
  extractLanguage,
  classifySongMood,
  calculatePopularityScore,
} from "./recommendationEngine";

import {
  NOCTURNE_TRACKS,
} from "../data/nocturneData";
import {
  MALAYALAM_HITS,
  MADE_FOR_YOU_TRACKS,
  CHILL_RELAX_TRACKS,
} from "../data/curatedDiscovery";
import { CURATED_GENRES } from "../data/genreData";

/**
 * Builds the comprehensive candidate pool combining all catalog sources
 */
export function getAllCandidatePool() {
  const map = new Map();

  const add = (track) => {
    if (!track || !track.id) return;
    const tid = String(track.id);
    if (!map.has(tid)) {
      map.set(tid, {
        ...track,
        id: tid,
        title: track.title || track.name || "Unknown Track",
        artist: track.artist || track.primary_artist || "Various Artists",
        album: track.album || track.movie || "",
        coverUrl:
          track.coverUrl ||
          track.thumbnail ||
          track.image ||
          (Array.isArray(track.image) && track.image[track.image.length - 1]?.url) ||
          null,
      });
    }
  };

  MADE_FOR_YOU_TRACKS.forEach(add);
  MALAYALAM_HITS.forEach(add);
  CHILL_RELAX_TRACKS.forEach(add);
  NOCTURNE_TRACKS.forEach(add);

  for (const g of CURATED_GENRES) {
    if (Array.isArray(g.tracks)) {
      g.tracks.forEach((t) => add({ ...t, genre: g.name }));
    }
  }

  return Array.from(map.values());
}

/**
 * Pseudo-random generator seeded by string + seed number for deterministic variation
 */
function seededRandom(str, seed = 0) {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Computes personalized recommendations tailored to the user's history
 *
 * @param {Array<object>} recentlyPlayedTracks - User's play history
 * @param {object} [options]
 * @param {Array<object>} [options.candidatePool] - Optional custom pool
 * @param {Set<string>} [options.likedSongIds] - User's liked song IDs
 * @param {Set<string>} [options.skippedIds] - Set of skipped tracks
 * @param {number} [options.limit=12] - Number of recommendations to return
 * @param {number} [options.refreshSeed=0] - Seed for controlled variation on refresh
 * @returns {Array<object>} Ranked recommendations
 */
export function getPersonalizedRecommendations(recentlyPlayedTracks = [], options = {}) {
  const {
    candidatePool = getAllCandidatePool(),
    likedSongIds = new Set(),
    skippedIds = new Set(),
    limit = 12,
    refreshSeed = 0,
  } = options;

  const validRecents = Array.isArray(recentlyPlayedTracks)
    ? recentlyPlayedTracks.filter(Boolean)
    : [];

  // 1. Build listening profile from user history
  const artistCounts = new Map();
  const albumCounts = new Map();
  const languageCounts = new Map();
  const genreCounts = new Map();
  const moodCounts = new Map();
  const playedSongIds = new Set();
  const recentSongIds = [];

  // Track frequency and recency
  validRecents.forEach((track, idx) => {
    const tid = String(track.id);
    playedSongIds.add(tid);
    if (idx < 10) recentSongIds.push(tid);

    // Artists
    const artists = extractArtists(track);
    artists.forEach((art) => {
      const current = artistCounts.get(art) || 0;
      // More recent plays carry higher weight
      const recencyWeight = Math.max(1, 5 - idx * 0.4);
      artistCounts.set(art, current + recencyWeight);
    });

    // Album / Movie
    const movie = extractMovieName(track);
    const album = normalizeMovieAlbum(track.album || "");
    const workKey = movie || album;
    if (workKey) {
      albumCounts.set(workKey, (albumCounts.get(workKey) || 0) + 1);
    }

    // Language
    const lang = extractLanguage(track);
    if (lang) {
      languageCounts.set(lang, (languageCounts.get(lang) || 0) + 1);
    } else {
      // Inferred language from Malayalam hits
      const isMalayalam =
        (track.genre || "").toLowerCase().includes("malayalam") ||
        (track.title || "").includes("Malayalam") ||
        (track.album || "").includes("Malayalam");
      if (isMalayalam) {
        languageCounts.set("malayalam", (languageCounts.get("malayalam") || 0) + 2);
      }
    }

    // Genre & Mood
    if (track.genre) {
      const g = cleanStr(track.genre);
      if (g) genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
    }
    const mood = classifySongMood(track);
    if (mood?.primary) {
      moodCounts.set(mood.primary, (moodCounts.get(mood.primary) || 0) + 1);
    }
  });

  const hasHistory = validRecents.length > 0;
  const mostRecentTrack = validRecents[0] || null;
  const mostRecentArtists = mostRecentTrack ? extractArtists(mostRecentTrack) : [];
  const mostRecentAlbum = mostRecentTrack ? normalizeMovieAlbum(mostRecentTrack.album || "") : "";
  const mostRecentMovie = mostRecentTrack ? extractMovieName(mostRecentTrack) : "";

  // 2. Score every candidate track
  const scoredCandidates = candidatePool.map((candidate) => {
    const tid = String(candidate.id);
    let score = 0;

    // Base popularity score (normalized 0 to 30)
    const basePopularity = Math.min(30, calculatePopularityScore(candidate) * 0.3);
    score += basePopularity;

    if (hasHistory) {
      const candArtists = extractArtists(candidate);
      const candMovie = extractMovieName(candidate);
      const candAlbum = normalizeMovieAlbum(candidate.album || "");
      const candLang = extractLanguage(candidate);
      const candMood = classifySongMood(candidate);
      const candGenre = cleanStr(candidate.genre || "");

      // A. Artist Match
      let artistScore = 0;
      candArtists.forEach((art) => {
        if (artistCounts.has(art)) {
          artistScore += Math.min(45, (artistCounts.get(art) || 0) * 8);
        }
        if (mostRecentArtists.includes(art)) {
          artistScore += 25; // Bonus for artist matching the most recently played song
        }
      });
      score += Math.min(65, artistScore);

      // B. Movie / Album Companion Match
      if (candMovie && (albumCounts.has(candMovie) || candMovie === mostRecentMovie)) {
        score += candMovie === mostRecentMovie ? 40 : 25;
      } else if (candAlbum && (albumCounts.has(candAlbum) || candAlbum === mostRecentAlbum)) {
        score += candAlbum === mostRecentAlbum ? 35 : 20;
      }

      // C. Language Alignment
      if (candLang && languageCounts.has(candLang)) {
        score += Math.min(30, (languageCounts.get(candLang) || 0) * 8);
      } else if ((candidate.genre || "").toLowerCase().includes("malayalam") && languageCounts.has("malayalam")) {
        score += 25;
      }

      // D. Mood & Genre Affinity
      if (candMood?.primary && moodCounts.has(candMood.primary)) {
        score += Math.min(20, (moodCounts.get(candMood.primary) || 0) * 5);
      }
      if (candGenre && genreCounts.has(candGenre)) {
        score += Math.min(20, (genreCounts.get(candGenre) || 0) * 5);
      }

      // E. Liked songs affinity
      if (likedSongIds.has(tid)) {
        score += 25;
      }

      // F. Penalize immediate repeats / skips
      if (skippedIds.has(tid)) {
        score -= 80; // Strong negative score for frequently skipped songs
      }
      if (recentSongIds.slice(0, 3).includes(tid)) {
        score -= 30; // Reduce score slightly for songs played in the last 3 turns
      } else if (playedSongIds.has(tid)) {
        score -= 10; // Slight penalty to encourage freshness
      } else {
        // G. Exploration score (unplayed track matching preferences)
        score += 18;
      }
    } else {
      // New / Empty user state: prioritize high quality popular curated hits
      if (candidate.badge === "Master" || candidate.badge === "Dolby Atmos") {
        score += 15;
      }
      if (candidate.playCount || candidate.play_count) {
        score += 10;
      }
    }

    // Dynamic variation based on refresh seed (ensures top items refresh and rotate on every click)
    if (refreshSeed > 0) {
      const seedNoise = seededRandom(`${tid}_v${refreshSeed}`, refreshSeed * 9973);
      const variation = (seedNoise - 0.5) * 90;
      score += variation;
    } else {
      const initialVariation = (seededRandom(tid, 42) - 0.5) * 10;
      score += initialVariation;
    }

    return {
      track: candidate,
      score,
      isExploration: !playedSongIds.has(tid),
    };
  });

  // Sort descending by calculated score
  scoredCandidates.sort((a, b) => b.score - a.score);

  // 3. Selection with Diversity & De-duplication Constraints
  const selected = [];
  const selectedIds = new Set();
  const artistRepetitions = new Map();
  const albumRepetitions = new Map();

  for (const item of scoredCandidates) {
    if (selected.length >= limit) break;
    const { track } = item;
    const tid = String(track.id);

    if (selectedIds.has(tid)) continue;

    // Check artist diversity: limit to max 2 songs from the same artist
    const primaryArtist = cleanStr(track.artist || track.primary_artist || "").split(",")[0].trim();
    const artistCount = artistRepetitions.get(primaryArtist) || 0;
    if (primaryArtist && artistCount >= 2 && scoredCandidates.length > limit * 2) {
      continue;
    }

    // Check album/movie diversity: limit to max 2 songs from the same album
    const albumKey = normalizeMovieAlbum(track.album || "");
    const albumCount = albumRepetitions.get(albumKey) || 0;
    if (albumKey && albumCount >= 2 && scoredCandidates.length > limit * 2) {
      continue;
    }

    selected.push(track);
    selectedIds.add(tid);
    if (primaryArtist) artistRepetitions.set(primaryArtist, artistCount + 1);
    if (albumKey) albumRepetitions.set(albumKey, albumCount + 1);
  }

  // If pool was constrained, fill remaining without repetition cap
  if (selected.length < limit) {
    for (const item of scoredCandidates) {
      if (selected.length >= limit) break;
      const tid = String(item.track.id);
      if (!selectedIds.has(tid)) {
        selected.push(item.track);
        selectedIds.add(tid);
      }
    }
  }

  return selected;
}
