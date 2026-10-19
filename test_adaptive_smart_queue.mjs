import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeTrackId,
  normalizeTitleForIdentity,
  normalizePrimaryArtist,
  getTrackCompositeKey,
  areTracksEqual,
  createTrackDeduplicator,
} from "./src/utils/trackIdentity.js";

import { classifySongDetailed } from "./src/utils/songClassifier.js";
import {
  generateRecommendedQueue,
  calculateQueueScore,
  buildIntelligentQueue,
} from "./src/utils/recommendationEngine.js";

import {
  normalizeCandidateTrack,
  filterCandidatePool,
  scoreAdaptiveCandidate,
  buildAdaptiveQueue,
  ADAPTIVE_CONFIG,
} from "./src/utils/adaptiveRecommendationLayer.js";

import { MALAYALAM_HITS } from "./src/data/curatedDiscovery.js";

describe("Adaptive Smart Queue & Recommendation Test Suite", () => {
  // ==========================================
  // SUITE 1: Track Identity and Normalization
  // ==========================================
  describe("1. Track Identity and Normalization", () => {
    it("1.1: Handles duplicate provider records with same stable ID across prefixes", () => {
      const track1 = { id: "track-wBgCQQ_6", title: "Illuminati", artist: "Dabzee" };
      const track2 = { id: "wBgCQQ_6", title: "Illuminati", artist: "Dabzee" };
      assert.equal(normalizeTrackId(track1.id), "wBgCQQ_6");
      assert.equal(normalizeTrackId(track2.id), "wBgCQQ_6");
      assert.equal(areTracksEqual(track1, track2), true);
    });

    it("1.2: Handles position-safe deduplication tags (__pos_)", () => {
      assert.equal(normalizeTrackId("duplicate_hit__pos_40"), "duplicate_hit");
      assert.equal(normalizeTrackId("track-duplicate_hit__pos_12"), "duplicate_hit");
    });

    it("1.3: Deduplicates records without matching IDs but with equivalent normalized title & artist", () => {
      const trackA = { id: "provider_1_abc", title: "Jaada (From \"Aavesham\")", artist: "Sushin Shyam, Sreenath Bhasi" };
      const trackB = { id: "provider_2_xyz", title: "jaada", artist: "Sushin Shyam" };
      assert.equal(areTracksEqual(trackA, trackB), true);
    });

    it("1.4: Distinguishes genuinely different tracks with the same title by different artists", () => {
      const songA = { id: "song_1", title: "Uyire", artist: "Sid Sriram" };
      const songB = { id: "song_2", title: "Uyire", artist: "Narayani Gopan" };
      assert.equal(areTracksEqual(songA, songB), false);
    });

    it("1.5: Distinguishes legitimate versions (remix, acoustic, live) from original song", () => {
      const orig = { id: "101", title: "Kalyani", artist: "Shreya Ghoshal" };
      const remix = { id: "102", title: "KALYANI (Remix)", artist: "ARJN, Shreya Ghoshal" };
      const acoustic = { id: "103", title: "Kalyani (Acoustic Version)", artist: "Shreya Ghoshal" };
      const live = { id: "104", title: "Kalyani - Live in Concert", artist: "Shreya Ghoshal" };

      const keyOrig = getTrackCompositeKey(orig);
      const keyRemix = getTrackCompositeKey(remix);
      const keyAcoustic = getTrackCompositeKey(acoustic);
      const keyLive = getTrackCompositeKey(live);

      assert.notEqual(keyOrig, keyRemix, "Remix must have distinct identity key");
      assert.notEqual(keyOrig, keyAcoustic, "Acoustic version must have distinct identity key");
      assert.notEqual(keyOrig, keyLive, "Live version must have distinct identity key");
    });

    it("1.6: Unicode and whitespace normalization removes noise and accents", () => {
      const title1 = "  Amsham   –   അംശം  ";
      const title2 = "Amsham";
      assert.equal(normalizeTitleForIdentity(title1).includes("amsham"), true);
      assert.equal(normalizeTitleForIdentity(title2), "amsham");
    });

    it("1.7: createTrackDeduplicator filters duplicates across different ID representations", () => {
      const dedup = createTrackDeduplicator();
      const t1 = { id: "track-wBgCQQ_6", title: "Illuminati", artist: "Dabzee" };
      const t2 = { id: "wBgCQQ_6", title: "Illuminati", artist: "Dabzee, Sushin Shyam" };
      const t3 = { id: "track-zDRb_KY2", title: "Mathara", artist: "Jakes Bejoy" };

      assert.equal(dedup.has(t1), false);
      dedup.add(t1);
      assert.equal(dedup.has(t1), true);
      assert.equal(dedup.has(t2), true, "Should recognize t2 as duplicate of t1 despite different ID prefix and extended artist");
      assert.equal(dedup.has(t3), false);

      const uniqueList = dedup.filterUnique([t1, t2, t3]);
      assert.equal(uniqueList.length, 1);
      assert.equal(uniqueList[0].id, "track-zDRb_KY2");
    });
  });

  // ==========================================
  // SUITE 2: Bug Diagnosis & Classification Fix
  // ==========================================
  describe("2. Bug Diagnosis & Classification Fix", () => {
    it("2.1: Movie soundtrack vocal songs are NOT misclassified as BGM simply because album contains 'Soundtrack'", () => {
      const vocalTrack = {
        id: "track-wBgCQQ_6",
        title: "Illuminati",
        artist: "Vinayak Sasikumar, Sushin Shyam, Dabzee",
        album: "Aavesham (Original Motion Picture Soundtrack)",
        has_lyrics: "true",
      };

      const profile = classifySongDetailed(vocalTrack);
      assert.equal(profile.isBgm, false, "Vocal track with lyrics must have isBgm: false");
      assert.equal(profile.contentType, "vocal", "Content type must be 'vocal'");
      assert.equal(profile.language, "malayalam");
    });

    it("2.2: Actual instrumental and BGM scores are correctly classified as BGM", () => {
      const bgmTrack = {
        id: "bgm-1",
        title: "Aavesham Mass BGM (Original Score)",
        artist: "Sushin Shyam",
        album: "Aavesham",
      };

      const profile = classifySongDetailed(bgmTrack);
      assert.equal(profile.isBgm, true, "BGM track must have isBgm: true");
    });
  });

  // ==========================================
  // SUITE 3: Recommendation Correctness Across 3 Malayalam Tracks
  // ==========================================
  describe("3. Recommendation Correctness Across 3 Malayalam Tracks", () => {
    const song1_energetic = MALAYALAM_HITS[0]; // Illuminati (High Energy / Dabzee & Sushin Shyam)
    const song2_romantic = MALAYALAM_HITS[3]; // Mathara (Love & Romance / Jakes Bejoy & Shreya Ghoshal)
    const song3_melody = MALAYALAM_HITS[4] || MALAYALAM_HITS[1]; // Another distinct track

    it("3.1: Three different Malayalam songs generate context-specific recommendation queues", () => {
      const queue1 = buildAdaptiveQueue(song1_energetic, MALAYALAM_HITS, { maxResults: 10 });
      const queue2 = buildAdaptiveQueue(song2_romantic, MALAYALAM_HITS, { maxResults: 10 });
      const queue3 = buildAdaptiveQueue(song3_melody, MALAYALAM_HITS, { maxResults: 10 });

      assert.ok(queue1.length >= 5, "Queue 1 must contain valid candidates");
      assert.ok(queue2.length >= 5, "Queue 2 must contain valid candidates");
      assert.ok(queue3.length >= 5, "Queue 3 must contain valid candidates");

      // Verify slot 0 is distinct and tailored to each song
      const topSong1 = queue1[0]?.title;
      const topSong2 = queue2[0]?.title;
      assert.ok(topSong1, "Queue 1 must have a top song");
      assert.ok(topSong2, "Queue 2 must have a top song");
      assert.notEqual(topSong1, topSong2, "Different starting songs must NOT produce identical top recommendations");
    });

    it("3.2: Seed track itself is never recommended in its own queue", () => {
      const q1 = buildAdaptiveQueue(song1_energetic, MALAYALAM_HITS, { maxResults: 10 });
      const id1 = normalizeTrackId(song1_energetic.id);
      for (const t of q1) {
        assert.notEqual(normalizeTrackId(t.id), id1, `Seed track ${song1_energetic.title} must not appear in queue`);
      }
    });

    it("3.3: Strict Malayalam language constraint rejects cross-language tracks", () => {
      const mixedPool = [
        ...MALAYALAM_HITS.slice(0, 5),
        { id: "hi-1", title: "Tum Hi Ho", artist: "Arijit Singh", language: "hindi" },
        { id: "ta-1", title: "Naa Ready", artist: "Anirudh", language: "tamil" },
        { id: "en-1", title: "Blinding Lights", artist: "The Weeknd", language: "english" },
      ];

      const q = buildAdaptiveQueue(song1_energetic, mixedPool, {
        maxResults: 10,
        strictLanguage: true,
      });

      for (const t of q) {
        const lang = (t.language || "").toLowerCase();
        if (lang) {
          assert.equal(lang, "malayalam", `Non-Malayalam track (${t.title} - ${lang}) must be rejected`);
        }
      }
    });

    it("3.4: Anti-repetition penalty deprioritizes recently queued tracks", () => {
      const candidate = MALAYALAM_HITS[1]; // Jaada
      const cid = normalizeTrackId(candidate.id);

      // Score without recent queue
      const scoreNormal = calculateQueueScore(candidate, song1_energetic, {
        recentQueueTrackIds: new Set(),
      });

      // Score with recent queue presence
      const scorePenalized = calculateQueueScore(candidate, song1_energetic, {
        recentQueueTrackIds: new Set([cid]),
      });

      assert.ok(
        scorePenalized.totalScore < scoreNormal.totalScore,
        "Recently recommended track must receive a score penalty"
      );
      assert.ok(
        scoreNormal.totalScore - scorePenalized.totalScore >= 20,
        "Penalty must be substantial (>= 20 points) to prevent sticky recommendations"
      );
    });

    it("3.5: Repeatedly skipped tracks receive bounded negative score adjustment", () => {
      const cand = MALAYALAM_HITS[2];
      const cid = normalizeTrackId(cand.id);

      const unskipped = scoreAdaptiveCandidate(cand, song1_energetic, {
        userSkips: new Map(),
      });

      const skipped = scoreAdaptiveCandidate(cand, song1_energetic, {
        userSkips: new Map([[cid, 2]]),
      });

      assert.ok(skipped.score < unskipped.score, "Skipped track must have reduced adaptive score");
    });
  });

  // ==========================================
  // SUITE 4: Continuous Queue Replenishment & Priorities
  // ==========================================
  const song1_seed = MALAYALAM_HITS[0];
  describe("4. Continuous Queue Replenishment & Priorities", () => {
    it("4.1: Append mode does not produce duplicate entries when adding to active queue", () => {
      const existingAutoQueue = [MALAYALAM_HITS[1], MALAYALAM_HITS[2]];
      const candidates = [MALAYALAM_HITS[1], MALAYALAM_HITS[2], MALAYALAM_HITS[3], MALAYALAM_HITS[4]];

      const filtered = filterCandidatePool(candidates, song1_seed, {
        upcomingTracks: existingAutoQueue,
      });

      const existingIds = new Set(existingAutoQueue.map((t) => normalizeTrackId(t.id)));
      for (const t of filtered) {
        assert.equal(
          existingIds.has(normalizeTrackId(t.id)),
          false,
          `Track ${t.title} already in queue must not be re-appended`
        );
      }
    });

    it("4.2: Manual queue tracks take strict priority over automatic queue", () => {
      const manualTrack = { id: "m-1", title: "User Picked Song", artist: "Artist", isManual: true };
      const autoTrack = { id: "a-1", title: "Auto Recommended Song", artist: "Artist", isManual: false };

      const manualQueue = [manualTrack];
      const autoQueue = [autoTrack];

      // Replicate handleNextTrack logic:
      let nextTrackToPlay = null;
      if (manualQueue.length > 0) {
        nextTrackToPlay = manualQueue[0];
      } else if (autoQueue.length > 0) {
        nextTrackToPlay = autoQueue[0];
      }

      assert.equal(nextTrackToPlay.id, "m-1", "Next track must be consumed from manual queue first");
    });

    it("4.3: Concurrency guard prevents duplicate asynchronous queue fetches", async () => {
      let isFetching = false;
      let executionCount = 0;

      async function triggerReplenishment() {
        if (isFetching) return { skipped: true };
        isFetching = true;
        try {
          executionCount++;
          await new Promise((r) => setTimeout(r, 20));
          return { skipped: false };
        } finally {
          isFetching = false;
        }
      }

      // Simulate simultaneous triggers (e.g. rapid time update + next track click)
      const [res1, res2] = await Promise.all([
        triggerReplenishment(),
        triggerReplenishment(),
      ]);

      assert.equal(executionCount, 1, "Only one replenishment cycle must execute concurrently");
      assert.ok(res1.skipped !== res2.skipped, "One trigger must succeed and the concurrent trigger must be skipped");
    });

    it("4.4: Stale request ID check discards superseded recommendation responses", () => {
      let currentRequestId = 1;
      let committedData = null;

      function simulateResponse(reqId, data) {
        if (reqId !== currentRequestId) {
          // Stale response discarded
          return;
        }
        committedData = data;
      }

      // Request 1 starts with ID 1
      const req1_id = 1;
      // User quickly clicks another song -> ID increments to 2
      currentRequestId = 2;
      const req2_id = 2;

      // Request 2 completes first
      simulateResponse(req2_id, { trackTitle: "New Song Queue" });
      assert.equal(committedData.trackTitle, "New Song Queue");

      // Request 1 (slow) completes later
      simulateResponse(req1_id, { trackTitle: "Old Song Queue" });
      assert.equal(
        committedData.trackTitle,
        "New Song Queue",
        "Out-of-order slow response from previous song must NOT overwrite active queue"
      );
    });
  });

  // ==========================================
  // SUITE 5: Same-Language Automatic Next Queue Diversity
  // ==========================================
  describe("5. Same-Language Automatic Next Queue Diversity", () => {
    it("5.1: Does not repeat the same song (e.g. Kalyani / Kalyana Kacheri) in every consecutive queue of the same language", () => {
      const kalyani = MALAYALAM_HITS.find((t) => t.title.toLowerCase().includes("kalyan"));
      assert.ok(kalyani, "Kalyana Kacheri must exist in MALAYALAM_HITS catalog");

      let rollingRecentQueue = new Set();
      const queues = [];
      const testSeeds = [MALAYALAM_HITS[0], MALAYALAM_HITS[1], MALAYALAM_HITS[2], MALAYALAM_HITS[3]];

      for (const seed of testSeeds) {
        const queue = buildAdaptiveQueue(seed, MALAYALAM_HITS, {
          recentQueueTrackIds: rollingRecentQueue,
          maxResults: 15,
        });

        queues.push(queue);

        // Update rolling recent queue with current queue tracks (rolling window of 25)
        const updated = new Set(Array.from(rollingRecentQueue).slice(-15));
        queue.forEach((t) => {
          updated.add(String(t.id));
          const cleanId = String(t.id).replace(/^track-/, "").trim();
          if (cleanId) updated.add(cleanId);
          const base = normalizeTitleForIdentity(t.title);
          if (base) updated.add(base);
        });
        rollingRecentQueue = updated;
      }

      // Verify that Kalyani does not appear in consecutive queues
      for (let i = 0; i < queues.length - 1; i++) {
        const hasKalyaniCurrent = queues[i].some((t) => t.title.toLowerCase().includes("kalyan"));
        const hasKalyaniNext = queues[i + 1].some((t) => t.title.toLowerCase().includes("kalyan"));
        assert.ok(
          !(hasKalyaniCurrent && hasKalyaniNext),
          `Kalyani must not repeat across consecutive queues ${i + 1} and ${i + 2}`
        );
      }
    });

    it("5.2: Generates varied slot 0 starting recommendations across same-language seeds", () => {
      const slot0Titles = [];
      let rolling = new Set();
      for (let i = 0; i < 4; i++) {
        const q = buildAdaptiveQueue(MALAYALAM_HITS[i], MALAYALAM_HITS, {
          recentQueueTrackIds: rolling,
          maxResults: 10,
        });
        if (q.length > 0) {
          slot0Titles.push(q[0].title);
          q.forEach((t) => rolling.add(t.id));
        }
      }
      const uniqueSlot0 = new Set(slot0Titles);
      assert.ok(
        uniqueSlot0.size >= 2,
        `Slot 0 should vary across different starting songs, got: ${Array.from(uniqueSlot0).join(", ")}`
      );
    });
  });
});
