import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { SCRIPT_TYPES, PROVIDER_NAMES, REJECTION_REASONS } from "./src/services/lyrics/types.js";
import {
  detectScript,
  detectLanguage,
  transliterateDevanagariToLatin,
  transliterateTamilToLatin,
  transliterateTeluguToLatin,
  transliterateKannadaToLatin,
  transliterateManglishToMalayalam,
  processLyricsLanguageAndScript,
  cleanLyricsString,
} from "./src/services/lyrics/textProcessor.js";
import {
  evaluateCandidateMatch,
  normalizeSongTitle,
  normalizeArtistName,
  checkVersionMismatch,
} from "./src/services/lyrics/songMatcher.js";
import { lyricsService } from "./src/services/lyrics/lyricsService.js";
import { BaseLyricsProvider } from "./src/services/lyrics/providers/baseProvider.js";
import { MusixmatchProvider } from "./src/services/lyrics/providers/musixmatchProvider.js";

describe("Complete Multilingual Multi-Provider Lyrics System Test Suite", () => {
  beforeEach(() => {
    lyricsService.clearCache();
  });

  // ==========================================
  // SUITE 1: Script & Language Processing (Section 5 & 6)
  // ==========================================
  describe("1. Language and Script Requirements", () => {
    it("1.1: Malayalam song in Malayalam script is preserved intact in Malayalam script", () => {
      const malayalamLyrics = "ഇല്ലുമിനാറ്റി കണ്ണിൽ പെട്ടോളെ\nആവേശം പെയ്യുന്ന രാവിൽ";
      const result = processLyricsLanguageAndScript(malayalamLyrics, [{ time: 1.0, text: "ഇല്ലുമിനാറ്റി കണ്ണിൽ പെട്ടോളെ" }], {
        language: "malayalam",
      });

      assert.equal(result.detectedLanguage, "malayalam");
      assert.equal(result.originalScript, SCRIPT_TYPES.MALAYALAM);
      assert.equal(result.displayScript, SCRIPT_TYPES.MALAYALAM);
      assert.ok(result.displayLyrics.includes("ഇല്ലുമിനാറ്റി"), "Malayalam script must be preserved");
      assert.ok(!/[a-zA-Z]/.test(result.displayLyrics.replace(/\n/g, "")), "Malayalam must not be converted into English letters");
    });

    it("1.2: Malayalam song with Romanized/Manglish input is converted into Malayalam script", () => {
      const manglishLyrics = "kalyana kacheri ormakal ormakal";
      const result = processLyricsLanguageAndScript(manglishLyrics, [{ time: 2.5, text: "kalyana kacheri" }], {
        language: "malayalam",
      });

      assert.equal(result.detectedLanguage, "malayalam");
      assert.equal(result.originalScript, SCRIPT_TYPES.LATIN);
      assert.equal(result.displayScript, SCRIPT_TYPES.MALAYALAM);
      // Verify converted text contains Malayalam Unicode codepoints
      const hasMalayalamChar = /[\u0D00-\u0D7F]/.test(result.displayLyrics);
      assert.ok(hasMalayalamChar, "Manglish must be converted to Malayalam script characters");
      assert.equal(result.lines[0].originalText, "kalyana kacheri", "Original text must be preserved");
    });

    it("1.3: Tamil song in Tamil script prefers Romanized Tamil (Latin script)", () => {
      const tamilLyrics = "கண்ணான கண்ணே\nஎன் மீது சாயவா";
      const result = processLyricsLanguageAndScript(tamilLyrics, [{ time: 3.0, text: "கண்ணான கண்ணே" }], {
        language: "tamil",
      });

      assert.equal(result.detectedLanguage, "tamil");
      assert.equal(result.originalScript, SCRIPT_TYPES.TAMIL);
      assert.equal(result.displayScript, SCRIPT_TYPES.LATIN);
      assert.ok(result.displayLyrics.toLowerCase().includes("kannaana"), "Tamil script must convert to readable Romanized Tamil");
    });

    it("1.4: Hindi song in Devanagari script prefers Romanized Hindi (Latin script)", () => {
      const hindiLyrics = "दिल इबादत कर रहा है\nधड़कनें मेरी सुन";
      const result = processLyricsLanguageAndScript(hindiLyrics, [{ time: 1.5, text: "दिल इबादत कर रहा है" }], {
        language: "hindi",
      });

      assert.equal(result.detectedLanguage, "hindi");
      assert.equal(result.originalScript, SCRIPT_TYPES.DEVANAGARI);
      assert.equal(result.displayScript, SCRIPT_TYPES.LATIN);
      assert.ok(result.displayLyrics.toLowerCase().includes("dil ibaadat"), "Devanagari must convert to readable Romanized Hindi");
      assert.equal(result.originalLyrics.includes("दिल"), true, "Original Devanagari must be kept separate");
    });

    it("1.5: Telugu song prefers Romanized Telugu", () => {
      const teluguLyrics = "సామజవరగమన నువ్వు పలుకవే";
      const result = processLyricsLanguageAndScript(teluguLyrics, [{ time: 2.0, text: "సామజవరగమన" }], {
        language: "telugu",
      });

      assert.equal(result.detectedLanguage, "telugu");
      assert.equal(result.originalScript, SCRIPT_TYPES.TELUGU);
      assert.equal(result.displayScript, SCRIPT_TYPES.LATIN);
      assert.ok(/[a-zA-Z]/.test(result.displayLyrics), "Telugu script must be transliterated into Latin letters");
    });

    it("1.6: Kannada song prefers Romanized Kannada", () => {
      const kannadaLyrics = "ಬೆಳಗೆದ್ದು ಯಾರ ಮುಖವ ನಾನು ನೋಡಿದೆ";
      const result = processLyricsLanguageAndScript(kannadaLyrics, [{ time: 1.0, text: "ಬೆಳಗೆದ್ದು" }], {
        language: "kannada",
      });

      assert.equal(result.detectedLanguage, "kannada");
      assert.equal(result.originalScript, SCRIPT_TYPES.KANNADA);
      assert.equal(result.displayScript, SCRIPT_TYPES.LATIN);
      assert.ok(/[a-zA-Z]/.test(result.displayLyrics), "Kannada script must be transliterated into Latin letters");
    });

    it("1.7: English song retains English lyrics without alteration", () => {
      const englishLyrics = "I wanna be your vacuum cleaner\nBreathing in your dust";
      const result = processLyricsLanguageAndScript(englishLyrics, [{ time: 0.5, text: "I wanna be your vacuum cleaner" }], {
        language: "english",
      });

      assert.equal(result.detectedLanguage, "english");
      assert.equal(result.originalScript, SCRIPT_TYPES.LATIN);
      assert.equal(result.displayScript, SCRIPT_TYPES.LATIN);
      assert.equal(result.displayLyrics, englishLyrics);
    });
  });

  // ==========================================
  // SUITE 2: Accurate Song Matching (Section 4)
  // ==========================================
  describe("2. Accurate Song Matching", () => {
    it("2.1: Rejects candidate when duration differs significantly (> 25 seconds)", () => {
      const seed = { title: "Illuminati", artist: "Dabzee", duration: 210 };
      const candidate = { track_name: "Illuminati", artist_name: "Dabzee", duration: 120 }; // 90s radio snippet

      const evalResult = evaluateCandidateMatch(seed, candidate);
      assert.equal(evalResult.isValid, false, "Must reject track with excessive duration discrepancy");
      assert.ok(evalResult.rejectionReason.includes(REJECTION_REASONS.DURATION_MISMATCH));
    });

    it("2.2: Distinguishes between remix and original version", () => {
      const seed = { title: "Kalyani", album: "Original Soundtrack" };
      const remixCand = { track_name: "Kalyani (Remix)", album_name: "EDM Mixes" };

      const check = checkVersionMismatch(seed, remixCand);
      assert.equal(check.mismatch, true, "Must detect remix vs original version mismatch");
      assert.equal(check.reason, REJECTION_REASONS.VERSION_MISMATCH);
    });

    it("2.3: Rejects instrumental track when vocal song is requested", () => {
      const seed = { title: "Aavesham Theme", isInstrumental: false };
      const instCand = { track_name: "Aavesham Theme", isInstrumental: true };

      const check = checkVersionMismatch(seed, instCand);
      assert.equal(check.mismatch, true, "Must not match instrumental to vocal song");
      assert.equal(check.reason, REJECTION_REASONS.INSTRUMENTAL_MISMATCH);
    });

    it("2.4: Accurately distinguishes two different songs with similar titles", () => {
      const seed = { title: "Uyire", artist: "Sid Sriram", album: "Gauthamante Radham", duration: 245 };
      const candidate = { track_name: "Uyire Uyire", artist_name: "Hariharan", album_name: "Bombay", duration: 320 };

      const evalResult = evaluateCandidateMatch(seed, candidate);
      assert.equal(evalResult.isValid, false, "Must reject different songs by different artists despite similar title prefix");
    });
  });

  // ==========================================
  // SUITE 3: Provider Fallback & Error Handling (Section 3, 8 & 9)
  // ==========================================
  describe("3. Multi-Provider Fallback, Caching & Resilience", () => {
    it("3.1: Gracefully handles a song with no lyrics across all providers with negative caching", async () => {
      const result = await lyricsService.getLyrics({
        id: "non-existent-xyz-9999",
        title: "Random Nonexistent Song Title 12345",
        artist: "Unknown Imaginary Artist 6789",
        duration: 180,
      });

      assert.equal(result.success, false);
      assert.equal(result.lines.length, 0);
      assert.ok(result.message.includes("No lyrics available"));

      // Second request immediately returns cached negative result (Cache HIT)
      const cachedResult = await lyricsService.getLyrics({
        id: "non-existent-xyz-9999",
        title: "Random Nonexistent Song Title 12345",
        artist: "Unknown Imaginary Artist 6789",
        duration: 180,
      });

      assert.equal(cachedResult.success, false);
      assert.equal(cachedResult.cacheStatus, "HIT", "Must return HIT from negative cache");
    });

    it("3.2: Musixmatch adapter reports NOT_CONFIGURED when API key is omitted", async () => {
      const originalKey = process.env.MUSIXMATCH_API_KEY;
      delete process.env.MUSIXMATCH_API_KEY;

      const provider = new MusixmatchProvider();
      assert.equal(provider.isConfigured(), false);

      const res = await provider.fetchLyrics({ title: "Test Song", artist: "Test Artist" });
      assert.equal(res.found, false);
      assert.equal(res.status, "NOT_CONFIGURED");
      assert.ok(res.configNote.includes("MUSIXMATCH_API_KEY"));

      if (originalKey) process.env.MUSIXMATCH_API_KEY = originalKey;
    });

    it("3.3: In-flight request deduplication prevents concurrent duplicate outbound requests", async () => {
      const track = {
        id: "test-dedup-track-1",
        title: "Synchronous In Flight Test",
        artist: "Unit Tester",
        duration: 200,
      };

      const p1 = lyricsService.getLyrics(track);
      const p2 = lyricsService.getLyrics(track);

      // p1 and p2 must refer to the exact same in-flight Promise
      assert.equal(p1, p2, "Simultaneous requests for same track must share identical in-flight Promise");
      const [r1, r2] = await Promise.all([p1, p2]);
      assert.equal(r1.title, r2.title);
    });

    it("3.4: Embedded / Mock provider delivers lyrics when online providers are not found", async () => {
      const track = {
        id: "track-midnight-pulse",
        title: "Midnight Pulse",
        artist: "Kavita Shenoy",
        duration: 215,
      };

      const result = await lyricsService.getLyrics(track, { provider: "mock" });
      assert.equal(result.success, true);
      assert.equal(result.provider, PROVIDER_NAMES.MOCK);
      assert.ok(result.lines.length > 0, "Mock provider must deliver lines");
    });
  });
});
