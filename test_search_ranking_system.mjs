import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SEARCH_RANKING_CONFIG,
  normalizeText,
  tokenizeText,
  levenshteinDistance,
  isTypoMatch,
  calculateTextRelevance,
  calculatePopularitySignal,
  rankSongs,
  rankArtists,
  rankAlbums,
  rankAllSearchEntities,
} from "./src/services/searchRanking/index.js";

describe("Spotify-Style Search Ranking Engine Test Suite", () => {
  // =========================================================================
  // 1. EXACT MATCH BEATS POPULAR PARTIAL MATCH
  // =========================================================================
  describe("1. Exact Match Beats Popular Partial Match", () => {
    it("an exact title match with lower plays beats a partial match with massive plays", () => {
      const candidates = [
        {
          id: "song-partial-hit",
          title: "Hukum Club Mega Remix Anthem",
          artist: "DJ Massive",
          playCount: 100000000, // 100M plays
          year: 2024,
        },
        {
          id: "song-exact-official",
          title: "Hukum",
          artist: "Anirudh Ravichander",
          playCount: 5000000, // 5M plays
          year: 2023,
        },
      ];

      const ranked = rankSongs(candidates, "hukum");
      assert.equal(ranked.length, 2);
      assert.equal(
        ranked[0].id,
        "song-exact-official",
        "Exact title match 'Hukum' must rank #1 over partial remix with 100M plays"
      );
    });

    it("relevance gate drops completely irrelevant items regardless of huge popularity", () => {
      const candidates = [
        {
          id: "unrelated-mega-hit",
          title: "Blinding Lights",
          artist: "The Weeknd",
          playCount: 3000000000, // 3 Billion plays
        },
        {
          id: "matching-indie",
          title: "Cherathukal",
          artist: "Sushin Shyam",
          playCount: 50000,
        },
      ];

      const ranked = rankSongs(candidates, "cherathukal");
      assert.equal(ranked.length, 1);
      assert.equal(ranked[0].id, "matching-indie");
    });
  });

  // =========================================================================
  // 2. POPULAR ORIGINAL BEATS REMIX (UNLESS EXPLICITLY QUERIED)
  // =========================================================================
  describe("2. Original vs Remix Ranking", () => {
    it("ranks the official original version first when searching a song name without 'remix'", () => {
      const candidates = [
        {
          id: "song-remix",
          title: "Illuminati (Remix)",
          artist: "Dabzee, Sushin Shyam",
          playCount: 20000000,
          year: 2024,
        },
        {
          id: "song-original",
          title: "Illuminati",
          artist: "Dabzee, Sushin Shyam",
          playCount: 25000000,
          year: 2024,
        },
        {
          id: "song-karaoke",
          title: "Illuminati - Karaoke Version",
          artist: "Unknown",
          playCount: 500000,
          year: 2024,
        },
      ];

      const ranked = rankSongs(candidates, "illuminati");
      assert.equal(ranked[0].id, "song-original", "Original Illuminati must rank above remix and karaoke");
      assert.equal(ranked[1].id, "song-remix", "Remix should rank above karaoke");
    });

    it("prioritizes remix when the user explicitly includes 'remix' in the query", () => {
      const candidates = [
        {
          id: "song-original",
          title: "Illuminati",
          artist: "Dabzee, Sushin Shyam",
          playCount: 50000000,
        },
        {
          id: "song-remix",
          title: "Illuminati (Club Remix)",
          artist: "Dabzee, Sushin Shyam",
          playCount: 2000000,
        },
      ];

      const ranked = rankSongs(candidates, "illuminati remix");
      assert.equal(
        ranked[0].id,
        "song-remix",
        "When query explicitly contains 'remix', remix must rank first"
      );
    });
  });

  // =========================================================================
  // 3. TYPO TOLERANCE & PREFIX TYPING
  // =========================================================================
  describe("3. Typo Tolerance and Prefix Matching", () => {
    it("matches words with 1 edit typo for short/medium words (e.g. 'hukm' -> 'Hukum')", () => {
      const candidates = [
        { id: "s-1", title: "Hukum", artist: "Anirudh", playCount: 5000000 },
        { id: "s-2", title: "Something Else", artist: "Other", playCount: 1000 },
      ];

      const ranked = rankSongs(candidates, "hukm");
      assert.equal(ranked.length, 1);
      assert.equal(ranked[0].id, "s-1");
    });

    it("matches words with 2 edit typos for longer words (e.g. 'kesariyaa' or 'kesaraya')", () => {
      const candidates = [
        { id: "s-kesariya", title: "Kesariya", artist: "Arijit Singh", playCount: 10000000 },
      ];

      const typoCheck = isTypoMatch("kesariyaa", "kesariya", SEARCH_RANKING_CONFIG);
      assert.equal(typoCheck.matches, true);

      const ranked = rankSongs(candidates, "kesariyaa");
      assert.equal(ranked.length, 1);
      assert.equal(ranked[0].id, "s-kesariya");
    });

    it("supports prefix matching while typing (e.g. 'illu' matches 'Illuminati')", () => {
      const candidates = [
        { id: "s-illu", title: "Illuminati", artist: "Dabzee", playCount: 10000000 },
        { id: "s-other", title: "Believer", artist: "Imagine Dragons", playCount: 20000000 },
      ];

      const ranked = rankSongs(candidates, "illu");
      assert.equal(ranked.length, 1);
      assert.equal(ranked[0].id, "s-illu");
    });
  });

  // =========================================================================
  // 4. ARTIST QUERY RETURNS ARTIST FIRST + TOP SONGS BOOSTED
  // =========================================================================
  describe("4. Artist Query Entity Behavior", () => {
    it("exact artist match ranks artist first and boosts their popular songs", () => {
      const rawCatalog = {
        artists: [
          { id: "art-anirudh", name: "Anirudh Ravichander", ctr: 9000000 },
          { id: "art-ani-other", name: "Ani DiFranco", ctr: 50000 },
        ],
        songs: [
          { id: "song-1", title: "Random Track mentioning Anirudh in lyrics", artist: "Other Artist", playCount: 10000 },
          { id: "song-2", title: "Hukum", artist: "Anirudh Ravichander", playCount: 80000000 },
          { id: "song-3", title: "Badass", artist: "Anirudh Ravichander", playCount: 60000000 },
        ],
        albums: [
          { id: "alb-jailer", title: "Jailer", artist: "Anirudh Ravichander", ctr: 5000000 },
        ],
      };

      const result = rankAllSearchEntities(rawCatalog, "Anirudh Ravichander");

      // 1. TopMatch must be the exact artist
      assert.equal(result.topMatch?.type, "artist");
      assert.equal(result.topMatch?.id, "art-anirudh");

      // 2. Artists section must have Anirudh Ravichander at index 0
      assert.equal(result.artists[0].id, "art-anirudh");

      // 3. Songs by Anirudh should be prioritized over songs by other artists that merely mention him
      assert.equal(result.songs[0].id, "song-2", "Hukum should rank #1 song");
      assert.equal(result.songs[1].id, "song-3", "Badass should rank #2 song");
    });
  });

  // =========================================================================
  // 5. ALBUM EXACT MATCH
  // =========================================================================
  describe("5. Album Exact Match Behavior", () => {
    it("exact album match ranks album #1 in albums and becomes topMatch when query targets album", () => {
      const rawCatalog = {
        albums: [
          { id: "alb-aavesham", title: "Aavesham", artist: "Sushin Shyam", ctr: 1000000 },
          { id: "alb-aavesham-bgm", title: "Aavesham Original Score", artist: "Sushin Shyam", ctr: 200000 },
        ],
        songs: [
          { id: "song-jaada", title: "Jaada", album: "Aavesham", artist: "Sushin Shyam", playCount: 20000000 },
        ],
        artists: [],
      };

      const result = rankAllSearchEntities(rawCatalog, "Aavesham");
      assert.equal(result.albums[0].id, "alb-aavesham", "Exact album match must be first in albums");
      assert.equal(result.topMatch?.id, "alb-aavesham", "Exact album query should make album topMatch");
    });
  });

  // =========================================================================
  // 6. EMPTY & SPECIAL CHARACTER QUERIES
  // =========================================================================
  describe("6. Empty & Special Character Edge Cases", () => {
    it("handles empty query, spaces, and special symbols safely without throwing", () => {
      const candidates = [
        { id: "s-1", title: "Amsham", artist: "Sushin Shyam", playCount: 500000 },
      ];

      assert.deepEqual(rankSongs(candidates, ""), candidates);
      assert.deepEqual(rankSongs(candidates, "   "), candidates);

      const specialRes = rankSongs(candidates, "!@#$%^&*()");
      assert.equal(specialRes.length, 0, "Nonsense special character query should return 0 results");
    });
  });

  // =========================================================================
  // 7. NON-ENGLISH & MULTILINGUAL NORMALIZATION
  // =========================================================================
  describe("7. Non-English & Multilingual Queries", () => {
    it("normalizes diacritics and accented characters (NFKC/NFKD)", () => {
      assert.equal(normalizeText("Kalyāṇi"), "kalyani");
      assert.equal(normalizeText("Déjà Vu"), "deja vu");
      assert.equal(normalizeText("Beyoncé"), "beyonce");

      const candidates = [
        { id: "s-kalyani", title: "Kalyāṇi", artist: "Singer", playCount: 10000 },
      ];

      const ranked = rankSongs(candidates, "kalyani");
      assert.equal(ranked.length, 1);
      assert.equal(ranked[0].id, "s-kalyani");
    });

    it("handles Malayalam, Tamil, Hindi, and regional scripts through alias and transliteration", () => {
      const candidates = [
        {
          id: "s-amsham",
          title: "Amsham",
          alias: "അംശം",
          artist: "Sushin Shyam",
          playCount: 1000000,
        },
      ];

      const ranked = rankSongs(candidates, "Amsham");
      assert.equal(ranked.length, 1);
      assert.equal(ranked[0].id, "s-amsham");
    });
  });

  // =========================================================================
  // 8. DEBUG LOGGING FLAG
  // =========================================================================
  describe("8. Debug Flag", () => {
    it("executes cleanly with debugRanking turned on without breaking score outputs", () => {
      const customConfig = { ...SEARCH_RANKING_CONFIG, debugRanking: true };
      const candidates = [
        { id: "s-1", title: "Hukum", artist: "Anirudh", playCount: 50000000, year: 2023 },
      ];

      const ranked = rankSongs(candidates, "Hukum", {}, customConfig);
      assert.equal(ranked.length, 1);
      assert.ok(ranked[0].searchScore > 0.8, "Search score should be high for exact match");
    });
  });
});
