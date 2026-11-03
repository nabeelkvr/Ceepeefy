import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SMART_QUEUE_CONFIG,
  extractSongFeatures,
  scoreCandidate,
  mmrReRank,
  sampleWithControlledRandomness,
  orderQueueAcousticFlow,
  QueueSessionManager,
  normalizeBaseTitle,
  getTrackIdentityKey,
  buildSmartQueue,
  refillSmartQueue,
} from "./src/services/smartQueue/index.js";

// Mock Library representing ~60 diverse tracks across multiple languages, artists, moods, and BPMs
const MOCK_LIBRARY = [
  // --- Malayalam Tracks ---
  // Sushin Shyam (Artist 1) - Energetic/Hip-Hop/Trap
  { id: "mal-1", title: "Illuminati", artist: "Dabzee, Sushin Shyam", album: "Aavesham", language: "malayalam", genre: "hip-hop", mood: "energetic_hype", tempo: 128, year: 2024, play_count: 50000000 },
  { id: "mal-1-remix", title: "Illuminati (Club Remix)", artist: "Dabzee, Sushin Shyam", album: "Aavesham Remixes", language: "malayalam", genre: "hip-hop", mood: "party_dance", tempo: 130, year: 2024, play_count: 500000 },
  { id: "mal-2", title: "Jaada", artist: "Sushin Shyam, Sreenath Bhasi", album: "Aavesham", language: "malayalam", genre: "rap", mood: "energetic_hype", tempo: 125, year: 2024, play_count: 25000000 },
  { id: "mal-3", title: "Armadham", artist: "Sushin Shyam, Pranavam Sasi", album: "Aavesham", language: "malayalam", genre: "folk electronic", mood: "energetic_hype", tempo: 132, year: 2024, play_count: 18000000 },
  { id: "mal-4", title: "Mathapana", artist: "Sushin Shyam", album: "Romancham", language: "malayalam", genre: "electronic", mood: "happy_feel_good", tempo: 118, year: 2023, play_count: 15000000 },
  { id: "mal-5", title: "Aadharanjali", artist: "Sushin Shyam, Madhuvanthi", album: "Romancham", language: "malayalam", genre: "quirky pop", mood: "happy_feel_good", tempo: 112, year: 2023, play_count: 30000000 },
  { id: "mal-6", title: "Cherathukal", artist: "Sushin Shyam, Sithara Krishnakumar", album: "Kumbalangi Nights", language: "malayalam", genre: "acoustic melody", mood: "chill_peaceful", tempo: 85, year: 2019, play_count: 22000000 },

  // Hesham Abdul Wahab (Artist 2) - Romantic / Melodic / Soulful
  { id: "mal-7", title: "Darshana", artist: "Hesham Abdul Wahab, Darshana Rajendran", album: "Hridayam", language: "malayalam", genre: "romantic melody", mood: "love_romance", tempo: 92, year: 2022, play_count: 45000000 },
  { id: "mal-8", title: "Onakka Munthiri", artist: "Hesham Abdul Wahab, Divya Vineeth", album: "Hridayam", language: "malayalam", genre: "feel good melody", mood: "happy_feel_good", tempo: 104, year: 2022, play_count: 12000000 },
  { id: "mal-9", title: "Nagumo", artist: "Hesham Abdul Wahab, Arvind Venugopal", album: "Hridayam", language: "malayalam", genre: "classical fusion", mood: "chill_peaceful", tempo: 88, year: 2022, play_count: 8000000 },
  { id: "mal-10", title: "Kushi Title Song", artist: "Hesham Abdul Wahab", album: "Kushi", language: "malayalam", genre: "romantic melody", mood: "love_romance", tempo: 95, year: 2023, play_count: 9000000 },
  { id: "mal-11", title: "Aradhya", artist: "Hesham Abdul Wahab, Sid Sriram", album: "Kushi", language: "malayalam", genre: "romantic melody", mood: "love_romance", tempo: 90, year: 2023, play_count: 14000000 },

  // Jakes Bejoy (Artist 3) - Dark / Intense / Action
  { id: "mal-12", title: "Mathara", artist: "Jakes Bejoy, Anthony Daasan", album: "King of Kotha", language: "malayalam", genre: "mass rap", mood: "dark_intense", tempo: 135, year: 2023, play_count: 10000000 },
  { id: "mal-13", title: "Kalapakkaara", artist: "Jakes Bejoy, Shreya Ghoshal, Benny Dayal", album: "King of Kotha", language: "malayalam", genre: "party dance", mood: "party_dance", tempo: 128, year: 2023, play_count: 22000000 },
  { id: "mal-14", title: "Ranam Title Track", artist: "Jakes Bejoy, Neeraj Madhav", album: "Ranam", language: "malayalam", genre: "hip-hop", mood: "dark_intense", tempo: 130, year: 2018, play_count: 7000000 },

  // Vidyasagar (Artist 4) - Evergreen Melodies / Soft Nostalgia
  { id: "mal-15", title: "Aaro Viral Neeti", artist: "Vidyasagar, K.J. Yesudas", album: "Pranayavarnangal", language: "malayalam", genre: "evergreen melody", mood: "chill_peaceful", tempo: 82, year: 1998, play_count: 6000000 },
  { id: "mal-16", title: "Oru Rathri Koodi", artist: "Vidyasagar, K.J. Yesudas, Chithra", album: "Summer in Bethlehem", language: "malayalam", genre: "evergreen melody", mood: "sad_emotional", tempo: 76, year: 1998, play_count: 8500000 },
  { id: "mal-17", title: "Enthe Innum Vanneela", artist: "Vidyasagar, P. Jayachandran, Chithra", album: "Gramaphone", language: "malayalam", genre: "evergreen melody", mood: "sad_emotional", tempo: 74, year: 2002, play_count: 5000000 },

  // Independent Malayalam Artists
  { id: "mal-18", title: "Katha", artist: "When Chai Met Toast", album: "Joy of Little Things", language: "malayalam", genre: "indie acoustic", mood: "happy_feel_good", tempo: 108, year: 2021, play_count: 3500000 },
  { id: "mal-19", title: "Yellow Think", artist: "When Chai Met Toast", album: "Believe", language: "malayalam", genre: "indie folk", mood: "chill_peaceful", tempo: 96, year: 2020, play_count: 2800000 },
  { id: "mal-20", title: "Manavalan Thug", artist: "SA", album: "Thallumaala", language: "malayalam", genre: "hip-hop", mood: "energetic_hype", tempo: 126, year: 2022, play_count: 16000000 },

  // --- Tamil Tracks ---
  { id: "tam-1", title: "Hukum", artist: "Anirudh Ravichander", album: "Jailer", language: "tamil", genre: "mass energetic", mood: "energetic_hype", tempo: 130, year: 2023, play_count: 70000000 },
  { id: "tam-2", title: "Kaavaalaa", artist: "Anirudh Ravichander, Shilpa Rao", album: "Jailer", language: "tamil", genre: "dance pop", mood: "party_dance", tempo: 124, year: 2023, play_count: 85000000 },
  { id: "tam-3", title: "Badass", artist: "Anirudh Ravichander", album: "Leo", language: "tamil", genre: "rock fusion", mood: "energetic_hype", tempo: 134, year: 2023, play_count: 65000000 },
  { id: "tam-4", title: "Naa Ready", artist: "Anirudh Ravichander, Thalapathy Vijay", album: "Leo", language: "tamil", genre: "party dance", mood: "party_dance", tempo: 126, year: 2023, play_count: 90000000 },
  { id: "tam-5", title: "Kadhale Kadhale", artist: "Govind Vasantha, Chinmayi", album: "96", language: "tamil", genre: "melodic acoustic", mood: "sad_emotional", tempo: 72, year: 2018, play_count: 40000000 },
  { id: "tam-6", title: "The Life of Ram", artist: "Govind Vasantha, Pradeep Kumar", album: "96", language: "tamil", genre: "soulful indie", mood: "chill_peaceful", tempo: 86, year: 2018, play_count: 35000000 },

  // --- Hindi Tracks ---
  { id: "hin-1", title: "Apna Bana Le", artist: "Arijit Singh, Sachin-Jigar", album: "Bhediya", language: "hindi", genre: "romantic melody", mood: "love_romance", tempo: 94, year: 2022, play_count: 120000000 },
  { id: "hin-2", title: "Kesariya", artist: "Arijit Singh, Pritam", album: "Brahmastra", language: "hindi", genre: "romantic pop", mood: "love_romance", tempo: 96, year: 2022, play_count: 150000000 },
  { id: "hin-3", title: "Tum Hi Ho", artist: "Arijit Singh, Mithoon", album: "Aashiqui 2", language: "hindi", genre: "sad romantic", mood: "sad_emotional", tempo: 80, year: 2013, play_count: 200000000 },
  { id: "hin-4", title: "Chaleya", artist: "Arijit Singh, Anirudh Ravichander", album: "Jawan", language: "hindi", genre: "dance pop", mood: "happy_feel_good", tempo: 114, year: 2023, play_count: 95000000 },

  // --- English Tracks ---
  { id: "eng-1", title: "Blinding Lights", artist: "The Weeknd", album: "After Hours", language: "english", genre: "synthwave pop", mood: "energetic_hype", tempo: 171, year: 2020, play_count: 3500000000 },
  { id: "eng-2", title: "Save Your Tears", artist: "The Weeknd", album: "After Hours", language: "english", genre: "synth pop", mood: "happy_feel_good", tempo: 118, year: 2020, play_count: 1500000000 },
  { id: "eng-3", title: "Starboy", artist: "The Weeknd, Daft Punk", album: "Starboy", language: "english", genre: "r&b electro", mood: "dark_intense", tempo: 186, year: 2016, play_count: 2800000000 },
  { id: "eng-4", title: "Someone Like You", artist: "Adele", album: "21", language: "english", genre: "ballad piano", mood: "sad_emotional", tempo: 68, year: 2011, play_count: 1800000000 },
];

describe("Smart Spotify-Style Autoplay Queue Test Suite", () => {
  // =========================================================================
  // REQUIREMENT (a): NO REPEATS & DEDUPLICATION
  // =========================================================================
  describe("(a) No repeats, no current song, no duplicates, remix filtering", () => {
    it("never includes the seed song in its own queue", () => {
      const seed = MOCK_LIBRARY[0]; // "Illuminati"
      const sessionManager = new QueueSessionManager();
      sessionManager.setCurrentTrack(seed);

      const { queue } = buildSmartQueue(seed, MOCK_LIBRARY, { sessionManager, targetQueueSize: 10 });
      assert.ok(queue.length > 0, "Queue should not be empty");
      const hasSeed = queue.some((t) => t.id === seed.id || normalizeBaseTitle(t.title) === normalizeBaseTitle(seed.title));
      assert.equal(hasSeed, false, "Seed song must not appear in the generated queue");
    });

    it("filters out remix duplicates with identical normalized title and artist", () => {
      const seed = MOCK_LIBRARY[1]; // Illuminati Club Remix
      const sessionManager = new QueueSessionManager();
      sessionManager.setCurrentTrack(seed);

      const { queue } = buildSmartQueue(seed, MOCK_LIBRARY, { sessionManager, targetQueueSize: 10 });
      // "Illuminati" original or remix should be filtered out
      const hasIlluminati = queue.some((t) => normalizeBaseTitle(t.title) === "illuminati");
      assert.equal(hasIlluminati, false, "Remix variation of seed must be filtered out as duplicate");
    });

    it("never queues a song already in current session history or active queue", () => {
      const seed = MOCK_LIBRARY[6]; // Cherathukal
      const sessionManager = new QueueSessionManager();
      sessionManager.setCurrentTrack(seed);

      // Pretend "Darshana" was already played earlier in session
      const alreadyPlayed = MOCK_LIBRARY.find((t) => t.id === "mal-7");
      sessionManager.recordPlaybackFinished(alreadyPlayed, 180);

      // Pretend "Jaada" is in the manual queue
      const manualSong = MOCK_LIBRARY.find((t) => t.id === "mal-2");
      sessionManager.addToManualQueue(manualSong);

      const { queue } = buildSmartQueue(seed, MOCK_LIBRARY, { sessionManager, targetQueueSize: 8 });
      const hasPlayed = queue.some((t) => t.id === "mal-7");
      const hasManual = queue.some((t) => t.id === "mal-2");

      assert.equal(hasPlayed, false, "Song played earlier in session must not be queued");
      assert.equal(hasManual, false, "Song already in manual queue must not be queued in auto queue");
    });
  });

  // =========================================================================
  // REQUIREMENT (b): DIFFERENT SEEDS GIVE DIFFERENT QUEUES IN SAME LANGUAGE
  // =========================================================================
  describe("(b) Different seed songs in the same language produce distinct queues", () => {
    it("two different Malayalam seeds (energetic trap vs soft acoustic) give clearly different queues", () => {
      const energeticSeed = MOCK_LIBRARY.find((t) => t.id === "mal-1"); // Illuminati (Energetic Trap, Sushin)
      const acousticSeed = MOCK_LIBRARY.find((t) => t.id === "mal-16"); // Oru Rathri Koodi (Evergreen Sad, Vidyasagar)

      const sm1 = new QueueSessionManager();
      sm1.setCurrentTrack(energeticSeed);
      const queue1 = buildSmartQueue(energeticSeed, MOCK_LIBRARY, { sessionManager: sm1, targetQueueSize: 6 }).queue;

      const sm2 = new QueueSessionManager();
      sm2.setCurrentTrack(acousticSeed);
      const queue2 = buildSmartQueue(acousticSeed, MOCK_LIBRARY, { sessionManager: sm2, targetQueueSize: 6 }).queue;

      assert.ok(queue1.length >= 4, "Queue 1 should have tracks");
      assert.ok(queue2.length >= 4, "Queue 2 should have tracks");

      const ids1 = queue1.map((t) => t.id);
      const ids2 = queue2.map((t) => t.id);

      // Energetic queue should feature fast/hype tracks
      assert.ok(ids1.includes("mal-2") || ids1.includes("mal-3") || ids1.includes("mal-20"), "Energetic seed should queue high-energy tracks");

      // Acoustic sad queue should feature soft Vidyasagar / acoustic melodies
      assert.ok(ids2.includes("mal-15") || ids2.includes("mal-17") || ids2.includes("mal-6"), "Sad melody seed should queue acoustic/soft tracks");

      // Top tracks must be distinctly different
      assert.notEqual(ids1[0], ids2[0], "Top recommendation of energetic vs sad seed must not be the same");
    });
  });

  // =========================================================================
  // REQUIREMENT (c): SAME LANGUAGE RESPECTED & STEP-BY-STEP RELAXATION
  // =========================================================================
  describe("(c) Language constraint is strictly respected, with step-by-step relaxation", () => {
    it("Tamil seed produces exclusively Tamil tracks when sufficient tracks exist", () => {
      const tamilSeed = MOCK_LIBRARY.find((t) => t.id === "tam-1"); // Hukum
      const sm = new QueueSessionManager();
      sm.setCurrentTrack(tamilSeed);

      const { queue, relaxationStatus } = buildSmartQueue(tamilSeed, MOCK_LIBRARY, { sessionManager: sm, targetQueueSize: 5 });
      assert.ok(queue.length > 0);
      assert.equal(relaxationStatus.level, "strict", "Should maintain strict language mode");

      for (const track of queue) {
        assert.equal(track.language, "tamil", `Track "${track.title}" should be Tamil`);
      }
    });

    it("relaxes step-by-step to related languages when library is small and reports event", () => {
      // Mock tiny catalog with only 1 Hindi track and a few Punjabi tracks
      const tinyCatalog = [
        { id: "h-1", title: "Tiny Hindi Seed", artist: "Singer", language: "hindi", genre: "pop", mood: "happy_feel_good", tempo: 110, year: 2023, play_count: 1000 },
        { id: "p-1", title: "Punjabi Song 1", artist: "Singer P1", language: "punjabi", genre: "folk", mood: "happy_feel_good", tempo: 115, year: 2023, play_count: 2000 },
        { id: "p-2", title: "Punjabi Song 2", artist: "Singer P2", language: "punjabi", genre: "pop", mood: "happy_feel_good", tempo: 112, year: 2023, play_count: 3000 },
      ];

      const seed = tinyCatalog[0];
      const sm = new QueueSessionManager();
      sm.setCurrentTrack(seed);

      let relaxationLogged = null;
      const { queue, relaxationStatus } = buildSmartQueue(seed, tinyCatalog, {
        sessionManager: sm,
        targetQueueSize: 3,
        onRuleRelaxed: (status) => {
          relaxationLogged = status;
        },
      });

      assert.equal(relaxationStatus.isRelaxed, true, "Should report relaxation");
      assert.equal(relaxationStatus.level, "related", "Should relax to related language (Punjabi for Hindi)");
      assert.ok(queue.some((t) => t.language === "punjabi"), "Queue should contain related language track");
    });
  });

  // =========================================================================
  // REQUIREMENT (d): ARTIST LIMITS ARE STRICTLY RESPECTED
  // =========================================================================
  describe("(d) Artist diversity limits (Max 2 per 10 songs, no back-to-back > 2)", () => {
    it("respects max 2 songs of the same artist in any 10-song window", () => {
      const seed = MOCK_LIBRARY.find((t) => t.id === "mal-1"); // Sushin Shyam
      const sm = new QueueSessionManager();
      sm.setCurrentTrack(seed);

      // Sushin has 5 other tracks in MOCK_LIBRARY
      const { queue } = buildSmartQueue(seed, MOCK_LIBRARY, { sessionManager: sm, targetQueueSize: 10 });

      // Count Sushin occurrences in the 10-song queue
      const sushinCount = queue.filter((t) => {
        const feat = extractSongFeatures(t);
        return feat.primaryArtist.includes("sushin") || feat.allArtists.some((a) => a.includes("sushin"));
      }).length;

      assert.ok(sushinCount <= 2, `Sushin Shyam should appear at most 2 times in 10 songs, got: ${sushinCount}`);
    });

    it("never places the same artist back-to-back more than twice", () => {
      const seed = MOCK_LIBRARY.find((t) => t.id === "tam-1"); // Anirudh
      const sm = new QueueSessionManager();
      sm.setCurrentTrack(seed);

      const { queue } = buildSmartQueue(seed, MOCK_LIBRARY, { sessionManager: sm, targetQueueSize: 5 });

      for (let i = 2; i < queue.length; i++) {
        const a1 = extractSongFeatures(queue[i - 2]).primaryArtist;
        const a2 = extractSongFeatures(queue[i - 1]).primaryArtist;
        const a3 = extractSongFeatures(queue[i]).primaryArtist;

        const consecutiveThree = a1 === a2 && a2 === a3 && a1 !== "";
        assert.equal(consecutiveThree, false, `Found 3 consecutive tracks by the same artist "${a1}" at index ${i}`);
      }
    });
  });

  // =========================================================================
  // REQUIREMENT (e): SKIPPED SONGS UNDER 30 SECONDS
  // =========================================================================
  describe("(e) Skipped songs under 30s are blacklisted & dampen similar tracks", () => {
    it("quick-skipped song is never queued again in this session", () => {
      const sm = new QueueSessionManager();
      const songToSkip = MOCK_LIBRARY.find((t) => t.id === "mal-2"); // Jaada
      // User skipped after 12 seconds
      sm.recordPlaybackFinished(songToSkip, 12);

      assert.equal(sm.quickSkippedTrackIds.has("mal-2"), true);
      assert.equal(sm.isExcluded(songToSkip), true, "Quick skipped song must be excluded");

      const seed = MOCK_LIBRARY.find((t) => t.id === "mal-1");
      const { queue } = buildSmartQueue(seed, MOCK_LIBRARY, { sessionManager: sm, targetQueueSize: 8 });
      const hasSkipped = queue.some((t) => t.id === "mal-2");
      assert.equal(hasSkipped, false, "Quick-skipped song must not appear in the generated queue");
    });

    it("quick-skipping a hype rap song dampens scores of similar rap songs", () => {
      const seed = MOCK_LIBRARY.find((t) => t.id === "mal-1");
      const cand = MOCK_LIBRARY.find((t) => t.id === "mal-3"); // Armadham (same artist & energetic mood)

      const normalScore = scoreCandidate(cand, seed, {}, SMART_QUEUE_CONFIG).score;

      const sm = new QueueSessionManager();
      sm.recordQuickSkip(seed); // Skip Sushin energetic song
      const dampenedScore = scoreCandidate(cand, seed, { skippedProfiles: sm.quickSkippedProfiles }, SMART_QUEUE_CONFIG).score;

      assert.ok(dampenedScore < normalScore, `Dampened score (${dampenedScore}) should be strictly lower than normal score (${normalScore})`);
    });
  });

  // =========================================================================
  // REQUIREMENT (f): REFILL & FLOW ORDERING
  // =========================================================================
  describe("(f) Refill when < 5 remain & Acoustic Flow Ordering", () => {
    it("auto-refills queue using the last played song as seed when fewer than 5 remain", () => {
      const sm = new QueueSessionManager();
      const lastPlayed = MOCK_LIBRARY.find((t) => t.id === "mal-7"); // Darshana
      const currentQueue = [MOCK_LIBRARY.find((t) => t.id === "mal-8")]; // 1 song remaining

      const result = refillSmartQueue(lastPlayed, currentQueue, MOCK_LIBRARY, sm, { targetQueueSize: 10 });
      assert.equal(result.refilled, true);
      assert.ok(result.queue.length >= 8, `Queue should be refilled to around target size, got: ${result.queue.length}`);
    });

    it("acoustic flow ordering sequences tracks without sudden tempo or mood whiplash", () => {
      const seed = MOCK_LIBRARY.find((t) => t.id === "mal-1"); // Illuminati (128 BPM, Energetic)
      const unorderedCandidates = [
        MOCK_LIBRARY.find((t) => t.id === "mal-16"), // 76 BPM Sad
        MOCK_LIBRARY.find((t) => t.id === "mal-2"),  // 125 BPM Energetic
        MOCK_LIBRARY.find((t) => t.id === "mal-4"),  // 118 BPM Happy
        MOCK_LIBRARY.find((t) => t.id === "mal-7"),  // 92 BPM Romantic
      ];

      const flowOrdered = orderQueueAcousticFlow(unorderedCandidates, seed, SMART_QUEUE_CONFIG);
      assert.equal(flowOrdered.length, 4);

      // The first track after 128 BPM Energetic should be 125 BPM Energetic (Jaada), not 76 BPM Sad (Oru Rathri Koodi)
      assert.equal(flowOrdered[0].id, "mal-2", "First track should match BPM and mood closest to seed");
    });
  });
});

