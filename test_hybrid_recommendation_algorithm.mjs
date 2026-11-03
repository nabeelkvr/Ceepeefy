import test from "node:test";
import assert from "node:assert/strict";

import {
  RECOMMENDATION_CONFIG,
  buildTasteProfile,
  calculateTimeDecay,
  computeCosineSimilarity,
  calculateContentScore,
  calculateRecencyScore,
  calculatePopularityScore,
  calculateExplorationBonus,
  calculateSkipPenalty,
  scoreCandidateTrack,
  filterExclusions,
  selectDiverseRecommendations,
  selectColdStartRecommendations,
  getRecommendations,
  invalidateRecommendationCache,
} from "./src/services/recommendationEngine/index.js";

test("1. Time decay follows 14-day half-life exponential formula", () => {
  const decay0 = calculateTimeDecay(0, 14);
  const decay14 = calculateTimeDecay(14, 14);
  const decay28 = calculateTimeDecay(28, 14);

  assert.equal(decay0, 1.0, "Day 0 should have decay factor 1.0");
  assert.ok(Math.abs(decay14 - 0.5) < 0.001, "Day 14 should have decay factor ~0.5");
  assert.ok(Math.abs(decay28 - 0.25) < 0.001, "Day 28 should have decay factor ~0.25");
});

test("2. Taste Profile builder weights events correctly (likes=3, full=2, partial=1, skip=-2)", () => {
  const now = Date.now();
  const mockRecents = [
    { track: { id: "song-1", artist: "Arijit Singh", genre: "Romantic" }, completed: true, timestamp: now },
    { track: { id: "song-2", artist: "Shreya Ghoshal", genre: "Classical" }, completed: false, timestamp: now },
  ];
  const mockLikes = [
    { id: "song-3", artist: "Arijit Singh", genre: "Romantic", timestamp: now },
  ];
  const mockSkips = [
    { id: "song-4", artist: "Bad Artist", genre: "Noise", timestamp: now },
  ];

  const profile = buildTasteProfile({
    recentlyPlayed: mockRecents,
    likedTracks: mockLikes,
    skips: mockSkips,
  }, now);

  assert.ok(profile.hasHistory, "User should have history");
  const arijitWeight = profile.artistProfile.weights.get("arijit singh") || 0;
  // Arijit has 1 full play (2.0) + 1 like (3.0) = 5.0
  assert.ok(arijitWeight >= 4.9, `Arijit weight should be ~5.0, got ${arijitWeight}`);

  const shreyaWeight = profile.artistProfile.weights.get("shreya ghoshal") || 0;
  // Shreya has 1 partial play (1.0)
  assert.ok(shreyaWeight >= 0.9 && shreyaWeight <= 1.1, `Shreya weight should be ~1.0, got ${shreyaWeight}`);

  assert.ok(profile.skippedIds.has("song-4"), "Song 4 should be in skippedIds");
});

test("3. Cosine similarity calculates correctly between vectors", () => {
  const vecA = new Map([["pop", 1], ["rock", 0]]);
  const vecB = new Map([["pop", 1], ["rock", 0]]);
  const vecC = new Map([["pop", 0], ["rock", 1]]);

  const simIdentical = computeCosineSimilarity(vecA, vecB);
  const simOrthogonal = computeCosineSimilarity(vecA, vecC);

  assert.equal(simIdentical, 1.0, "Identical vectors must have cosine similarity 1.0");
  assert.equal(simOrthogonal, 0.0, "Orthogonal vectors must have cosine similarity 0.0");
});

test("4. Hybrid scoring redistributes weight (0.65 content) when collaborative signals are missing", () => {
  const candidate = {
    id: "cand-1",
    title: "Tum Hi Ho",
    artist: "Arijit Singh",
    genre: "Romantic",
    playCount: 100000,
  };

  const profile = buildTasteProfile({
    recentlyPlayed: [
      { track: { id: "s1", artist: "Arijit Singh", genre: "Romantic" }, completed: true }
    ],
  });

  const scoredWithoutCollab = scoreCandidateTrack(candidate, profile, { collaborativeSignals: null });
  assert.ok(scoredWithoutCollab.score > 0, "Candidate should have positive score");
  assert.equal(scoredWithoutCollab.breakdown.collaborativeScore, 0, "Collab score should be 0");

  const mockCollab = { getScore: (track) => 0.8 };
  const scoredWithCollab = scoreCandidateTrack(candidate, profile, { collaborativeSignals: mockCollab });
  assert.equal(scoredWithCollab.breakdown.collaborativeScore, 0.8, "Collab score should be 0.8");
});

test("5. Skip penalty eliminates or heavily penalizes skipped songs", () => {
  const normalCandidate = { id: "normal-1", title: "Good Song", artist: "Good Artist" };
  const skippedCandidate = { id: "skip-1", title: "Skipped Song", artist: "Skipped Artist" };

  const profile = buildTasteProfile({
    recentlyPlayed: [{ track: { id: "s1", artist: "Good Artist" } }],
    skips: [{ id: "skip-1", artist: "Skipped Artist" }],
  });

  const normalScored = scoreCandidateTrack(normalCandidate, profile);
  const skippedScored = scoreCandidateTrack(skippedCandidate, profile);

  assert.equal(skippedScored.breakdown.skipPenalty, 1.0, "Skipped song must have skip penalty 1.0");
  assert.ok(normalScored.score > skippedScored.score, "Normal song score must be higher than skipped");
});

test("6. Diversity constraints enforce maximum 2 songs per artist", () => {
  const scoredItems = [
    { track: { id: "1", title: "Track 1", artist: "The Weeknd", genre: "Pop" }, score: 0.95 },
    { track: { id: "2", title: "Track 2", artist: "The Weeknd", genre: "Pop" }, score: 0.94 },
    { track: { id: "3", title: "Track 3", artist: "The Weeknd", genre: "Pop" }, score: 0.93 }, // 3rd must be blocked
    { track: { id: "4", title: "Track 4", artist: "Dua Lipa", genre: "Pop" }, score: 0.90 },
    { track: { id: "5", title: "Track 5", artist: "Taylor Swift", genre: "Country" }, score: 0.88 },
    { track: { id: "6", title: "Track 6", artist: "Post Malone", genre: "Hip-Hop" }, score: 0.85 },
    { track: { id: "7", title: "Track 7", artist: "Ed Sheeran", genre: "Acoustic" }, score: 0.80 },
    { track: { id: "8", title: "Track 8", artist: "Bruno Mars", genre: "Funk" }, score: 0.78 },
    { track: { id: "9", title: "Track 9", artist: "Billie Eilish", genre: "Alt" }, score: 0.75 },
    { track: { id: "10", title: "Track 10", artist: "Olivia Rodrigo", genre: "Pop" }, score: 0.70 },
  ];

  const selected = selectDiverseRecommendations(scoredItems, 8);
  const weekndTracks = selected.filter((t) => (t.artist || "").toLowerCase().includes("weeknd"));

  assert.ok(weekndTracks.length <= 2, `Should have at most 2 Weeknd songs, got ${weekndTracks.length}`);
  assert.equal(selected.length, 8, "Should select 8 songs total");
});

test("7. Exclusion filtering drops songs played in the last 24h & liked songs", () => {
  const candidatePool = [
    { id: "song-recent-24h", title: "Played Recently", artist: "Artist A" },
    { id: "song-liked", title: "Liked Song", artist: "Artist B" },
    { id: "song-fresh-1", title: "Fresh Song 1", artist: "Artist C" },
    { id: "song-fresh-2", title: "Fresh Song 2", artist: "Artist D" },
    { id: "song-fresh-3", title: "Fresh Song 3", artist: "Artist E" },
    { id: "song-fresh-4", title: "Fresh Song 4", artist: "Artist F" },
    { id: "song-fresh-5", title: "Fresh Song 5", artist: "Artist G" },
    { id: "song-fresh-6", title: "Fresh Song 6", artist: "Artist H" },
    { id: "song-fresh-7", title: "Fresh Song 7", artist: "Artist I" },
    { id: "song-fresh-8", title: "Fresh Song 8", artist: "Artist J" },
  ];

  const tasteProfile = {
    playedIdsIn24h: new Set(["song-recent-24h"]),
    likedIds: new Set(["song-liked"]),
    skippedIds: new Set(),
  };

  const eligible = filterExclusions(candidatePool, tasteProfile, 4);
  const eligibleIds = eligible.map((t) => t.id);

  assert.ok(!eligibleIds.includes("song-recent-24h"), "Must exclude 24h played song");
  assert.ok(!eligibleIds.includes("song-liked"), "Must exclude liked song when pool is large");
  assert.ok(eligibleIds.includes("song-fresh-1"), "Fresh song must be included");
});

test("8. Cold start returns curated, diverse recommendations for users with no history", () => {
  const candidatePool = [
    { id: "p1", title: "Pop Hit 1", artist: "Pop Star 1", genre: "Pop", badge: "Master" },
    { id: "p2", title: "Pop Hit 2", artist: "Pop Star 2", genre: "Pop" },
    { id: "m1", title: "Malayalam Hit 1", artist: "Sushin Shyam", genre: "Malayalam" },
    { id: "m2", title: "Malayalam Hit 2", artist: "Jakes Bejoy", genre: "Malayalam" },
    { id: "c1", title: "Chill Hit 1", artist: "Chill Artist 1", genre: "Chill" },
    { id: "c2", title: "Chill Hit 2", artist: "Chill Artist 2", genre: "Chill" },
    { id: "h1", title: "HipHop 1", artist: "Rapper 1", genre: "Hip-Hop" },
    { id: "h2", title: "HipHop 2", artist: "Rapper 2", genre: "Hip-Hop" },
  ];

  const coldStart = selectColdStartRecommendations(candidatePool, 6, 0);
  assert.equal(coldStart.length, 6, "Should return 6 items for cold start");
  const genres = new Set(coldStart.map((t) => (t.genre || "").toLowerCase()));
  assert.ok(genres.size >= 3, `Should cover at least 3 distinct genres, got ${genres.size}`);
});

test("9. Refresh rotation seed produces distinct variations without breaking relevance", () => {
  const optionsSeed0 = {
    recentlyPlayed: [{ track: { id: "s1", artist: "Pritam", genre: "Romantic" } }],
    seed: 0,
    bypassCache: true,
  };
  const optionsSeed1 = {
    recentlyPlayed: [{ track: { id: "s1", artist: "Pritam", genre: "Romantic" } }],
    seed: 1,
    bypassCache: true,
  };

  const res0 = getRecommendations("test-user", 8, optionsSeed0);
  const res1 = getRecommendations("test-user", 8, optionsSeed1);

  assert.equal(res0.length, 8, "Result 0 should have 8 recommendations");
  assert.equal(res1.length, 8, "Result 1 should have 8 recommendations");

  const titles0 = res0.map((t) => t.title).join("|");
  const titles1 = res1.map((t) => t.title).join("|");

  assert.notEqual(titles0, titles1, "Different refresh seeds must rotate the recommendation order");
});

test("10. In-memory cache caches results and can be invalidated per user", () => {
  invalidateRecommendationCache();

  const user = "test-caching-user";
  const options = {
    recentlyPlayed: [{ track: { id: "s1", artist: "Solaris", genre: "Electronic" } }],
    seed: 42,
  };

  const firstCall = getRecommendations(user, 8, options);
  const secondCall = getRecommendations(user, 8, options);

  assert.equal(firstCall, secondCall, "Second call must return identical cached array reference");

  // Invalidate cache
  invalidateRecommendationCache(user);
  const thirdCall = getRecommendations(user, 8, options);
  assert.notEqual(firstCall, thirdCall, "After invalidation, new array reference must be computed");
  assert.deepEqual(firstCall.map(t => t.id), thirdCall.map(t => t.id), "IDs should match the deterministic scoring");
});

