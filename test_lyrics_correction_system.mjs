import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  lyricsCorrectionService,
  normalizeMalayalamUnicode,
  applyMalayalamRuleCorrections,
  calculateStringSimilarity,
} from "./src/services/lyrics/lyricsCorrectionService.js";
import { lyricsService } from "./src/services/lyrics/lyricsService.js";
import { VERIFICATION_STATUS } from "./src/services/lyrics/types.js";

describe("Lyrics Validation & Malayalam Correction Pipeline Test Suite", () => {
  // =========================================================================
  // 1. REGRESSION TEST: "Ya Rabbe" from Kadina Kadoramee Andakadaham
  // =========================================================================
  describe("1. Ya Rabbe Regression & Verification Test", () => {
    it("1.1: Recovers, verifies, and corrects the exact broken lyrics from screenshot", () => {
      // The exact broken lines displayed in the user screenshot
      const brokenIncomingLines = [
        { time: 31.31, text: "യ രബ്ബെ ഒരുവെല സണ്ടെഹിയൈ", originalText: "Ya rabbe oruvela sandehiyai" },
        { time: 36.57, text: "ഈ ഞനും വെദന താണ്ടുകയൽ-ആൽ-അകലെ-അകലെ", originalText: "Ee njanum vedana thaandukayal-aal-akale-akale" },
        { time: 46.59, text: "മഞൂരിയ തനുനീരും കന്നിമഴ തന്നീരും", originalText: "Manjooriya thanuneerum kannimazha thanneerum" },
        { time: 51.79, text: "രബ്ബെ നീയുതിരരു നരു വാസനെയും മെല്കുലിരനൈ", originalText: "Rabbe neeyuthiraru naru vaasaneyum melkuliranai" },
        { time: 59.79, text: "കതു, കതു കതകിൽ തങി", originalText: "Kathu, kathu kathakil thangi" },
        { time: 64.52, text: "പ്രിയമെരും ഇവരിൽ ഞൻ ദുഅ'കൽ ചൊല്ലി", originalText: "Priyamerum ivaril njan dua'kal cholli" },
        { time: 69.93, text: "ചൊര്ന്ൻ, ചൊര്ന്ൻ കൊതികൽ മങി", originalText: "Chornn, chornn kothikal mangi" },
        { time: 74.88, text: "കഴിയുല്ല കബരിൽ ഞൻ ഇനപൊകതെ", originalText: "Kazhiyulla kabaril njan inapokathe" },
      ];

      const trackSeed = {
        title: "Ya Rabbe",
        artist: "Umbachy, Govind Vasantha, Mena Melath",
        album: "Kadina Kadoramee Andakadaham",
        language: "malayalam",
      };

      const result = lyricsCorrectionService.validateAndCorrectLyrics(
        trackSeed,
        brokenIncomingLines,
        brokenIncomingLines.map((l) => l.text).join("\n")
      );

      assert.equal(result.verificationStatus, VERIFICATION_STATUS.VERIFIED);
      assert.equal(result.confidenceLevel, 98);
      assert.equal(result.correctionMethod, "verified_reference");
      assert.ok(result.referenceSource.includes("M3DB") || result.referenceSource.includes("Authorized"));

      // Line 1:
      assert.equal(result.lines[0].text, "യാ റബ്ബേ ഒരു വേള സന്ദേഹിയായി");
      assert.equal(result.lines[0].time, 31.31, "Timestamp must be preserved intact");
      assert.equal(result.lines[0].corrected, true);

      // Line 2:
      assert.equal(result.lines[1].text, "ഈ ഞാനും വേദന താണ്ടുകയാലാളകലെ അകലെ");
      assert.equal(result.lines[1].time, 36.57);

      // Line 3:
      assert.equal(result.lines[2].text, "മഞ്ഞൂറിയ തണുനീരും കന്നിമഴ തണ്ണീരും");
      assert.equal(result.lines[2].time, 46.59);

      // Line 4:
      assert.equal(result.lines[3].text, "റബ്ബേ നീയുതിരും നറുവാസനയും മേൽക്കുളിരനായ്");
      assert.equal(result.lines[3].time, 51.79);

      // Line 5:
      assert.equal(result.lines[4].text, "കാത്തു കാത്തു കതകിൽ തങ്ങി");
      assert.equal(result.lines[4].time, 59.79);

      // Line 6:
      assert.equal(result.lines[5].text, "പ്രിയമേറും ഇവരിൽ ഞാൻ ദുആകൾ ചൊല്ലി");
      assert.equal(result.lines[5].time, 64.52);

      // Line 7:
      assert.equal(result.lines[6].text, "ചോർന്ന് ചോർന്ന് കൊതികൾ മങ്ങി");
      assert.equal(result.lines[6].time, 69.93);

      // Line 8:
      assert.equal(result.lines[7].text, "കഴിയൂല കബറിൽ ഞാനിണ പോകാതെ");
      assert.equal(result.lines[7].time, 74.88);

      // Ensure original raw lyrics are preserved
      assert.ok(result.originalLyrics.includes("യ രബ്ബെ ഒരുവെല സണ്ടെഹിയൈ"));
    });
  });

  // =========================================================================
  // 2. UNICODE NORMALIZATION & ATOMIC CHILLU PRESERVATION
  // =========================================================================
  describe("2. Unicode Normalization & Sanity Checks", () => {
    it("2.1: Converts legacy chillu sequences to modern atomic Unicode codepoints", () => {
      // Legacy "ന + ് + ZWJ"
      const legacyChilluN = "പൊ\u0D28\u0D4D\u200D";
      const normalized = normalizeMalayalamUnicode(legacyChilluN);
      assert.equal(normalized, "പൊൻ");
      assert.ok(normalized.includes("\u0D7B"), "Must contain atomic chillu ൻ (0x0D7B)");
    });

    it("2.2: Strips invisible zero-width spaces and duplicate viramas", () => {
      const brokenText = "വേദന\u200B\uFEFF താണ്ടുകയാൽ\u0D4D\u0D4D";
      const cleaned = normalizeMalayalamUnicode(brokenText);
      assert.ok(!cleaned.includes("\u200B"));
      assert.ok(!cleaned.includes("\uFEFF"));
      assert.ok(!cleaned.includes("\u0D4D\u0D4D"));
    });
  });

  // =========================================================================
  // 3. HEURISTIC MALAYALAM PHONETIC & WORD SPACING RULES
  // =========================================================================
  describe("3. Heuristic Malayalam Rule-Based Corrections", () => {
    it("3.1: Corrects solitary ങ to ങ്ങ and retroflex ണ്ട to dental ന്ദ in song stems", () => {
      const input = "കതകിൽ തങി കൊതികൾ മങി സണ്ടെഹിയായി";
      const result = applyMalayalamRuleCorrections(input);
      assert.ok(result.text.includes("തങ്ങി"));
      assert.ok(result.text.includes("മങ്ങി"));
      assert.ok(result.text.includes("സന്ദേഹിയായി"));
    });

    it("3.2: Preserves colloquial and poetic Malayalam words without standardizing into formal prose", () => {
      const poeticColloquial = "കഴിയൂല കബറിൽ ഞാനിണ പോകാതെ";
      const result = applyMalayalamRuleCorrections(poeticColloquial);
      assert.equal(result.text, "കഴിയൂല കബറിൽ ഞാനിണ പോകാതെ", "Poetic form 'കഴിയൂല' must not be rewritten as 'കഴിയില്ല'");
    });

    it("3.3: Cleans abnormal audio-stutter hyphens", () => {
      const input = "താണ്ടുകയൽ-ആൽ-അകലെ-അകലെ";
      const result = applyMalayalamRuleCorrections(input);
      assert.equal(result.text, "താണ്ടുകയാലാളകലെ അകലെ");
    });
  });

  // =========================================================================
  // 4. PRESERVATION OF VALID MALAYALAM LYRICS
  // =========================================================================
  describe("4. Preservation of Clean Malayalam Lyrics", () => {
    it("4.1: Leaves correct Malayalam lyrics 100% unaltered", () => {
      const cleanMalayalam = [
        { time: 5.0, text: "ഇല്ലുമിനാറ്റി കണ്ണിൽ പെട്ടോളെ" },
        { time: 10.0, text: "ആവേശം പെയ്യുന്ന രാവിൽ" },
      ];

      const trackSeed = {
        title: "Illuminati",
        artist: "Sushin Shyam, Dabzee",
        language: "malayalam",
      };

      const result = lyricsCorrectionService.validateAndCorrectLyrics(
        trackSeed,
        cleanMalayalam,
        "ഇല്ലുമിനാറ്റി കണ്ണിൽ പെട്ടോളെ\nആവേശം പെയ്യുന്ന രാവിൽ"
      );

      assert.equal(result.lines[0].text, "ഇല്ലുമിനാറ്റി കണ്ണിൽ പെട്ടോളെ");
      assert.equal(result.lines[1].text, "ആവേശം പെയ്യുന്ന രാവിൽ");
      assert.equal(result.lines[0].time, 5.0);
    });
  });

  // =========================================================================
  // 5. CACHE BYPASS & RETRY MECHANISM
  // =========================================================================
  describe("5. Fast Retrieval, Matching & Retry Cache Invalidation", () => {
    it("5.1: Negative cache is immediately invalidated when bypassCache=true", async () => {
      lyricsService.clearCache();

      // Seed negative cache with nonexistent song
      const fakeTrack = {
        id: "fake-track-999",
        title: "Nonexistent Track For Retry Test",
        artist: "Unknown Artist",
      };

      const firstRes = await lyricsService.getLyrics(fakeTrack);
      assert.equal(firstRes.success, false);

      // Verify cached
      const cacheKey = lyricsService.generateCacheKey(fakeTrack);
      assert.ok(lyricsService.cache.has(cacheKey));

      // Re-query with bypassCache=true (as happens on user 'Retry' button click)
      const retryRes = await lyricsService.getLyrics(fakeTrack, { bypassCache: true });
      assert.equal(retryRes.cacheStatus, "MISS");
    });
  });
});
