import test from "node:test";
import assert from "node:assert/strict";

import {
  LYRICS_TRANSLITERATION_SYSTEM_PROMPT,
  PROMPT_VERSION,
  extractCleanJson,
  validateChunkOutput,
  transliterateSynchronizedLyrics,
  invalidateLyricsTransliterationCache,
} from "./src/services/lyrics/lyricsTransliterationEngine.js";

test("1. Temperature is set strictly to 0 on every LLM call", async () => {
  let passedTemperature = null;
  const mockCaller = async (prompt, systemPrompt, options) => {
    passedTemperature = options.temperature;
    return JSON.stringify({
      lines: [{ id: 1, time: "00:10.00", text: "Test line" }],
    });
  };

  await transliterateSynchronizedLyrics([{ time: 10, text: "Test line" }], {
    llmCaller: mockCaller,
    bypassCache: true,
  });

  assert.equal(passedTemperature, 0, "LLM caller must receive temperature = 0");
});

test("2. Chunking splits into 15-25 line chunks with GLOBAL IDs (1..N) across the whole song", async () => {
  const chunksReceived = [];
  const mockCaller = async (prompt) => {
    // Collect IDs sent in this chunk
    const idsInPrompt = (prompt.match(/^\d+\s*\|/gm) || []).map((m) => parseInt(m, 10));
    chunksReceived.push(idsInPrompt);

    return JSON.stringify({
      lines: idsInPrompt.map((id) => ({ id, time: "00:00.00", text: `Sample transliterated line ${id}` })),
    });
  };

  // Generate 45 lines -> should split into chunks of 20, 20, 5
  const sampleLines = Array.from({ length: 45 }).map((_, idx) => ({
    time: idx * 2.5,
    text: `Sample lyrics line ${idx + 1}`,
  }));

  const result = await transliterateSynchronizedLyrics(sampleLines, {
    chunkSize: 20,
    llmCaller: mockCaller,
    bypassCache: true,
  });

  assert.equal(result.lines.length, 45, "Total output lines must equal input count");
  assert.equal(chunksReceived.length, 3, "45 lines with chunk size 20 should produce 3 chunks");

  // Verify Global IDs (1..N)
  assert.equal(chunksReceived[0][0], 1, "First chunk starts at ID 1");
  assert.equal(chunksReceived[0][19], 20, "First chunk ends at ID 20");
  assert.equal(chunksReceived[1][0], 21, "Second chunk starts at ID 21 (Global ID, not restarted at 1)");
  assert.equal(chunksReceived[1][19], 40, "Second chunk ends at ID 40");
  assert.equal(chunksReceived[2][0], 41, "Third chunk starts at ID 41");
  assert.equal(chunksReceived[2][4], 45, "Third chunk ends at ID 45");
});

test("3. Strict JSON output parser strips markdown fences safely", () => {
  const rawWithMarkdown = "```json\n{\"lines\":[{\"id\":1,\"time\":\"00:12.00\",\"text\":\"Valid\"}]}\n```";
  const rawWithExtraText = "Here is the JSON:\n{\"lines\":[{\"id\":1,\"time\":\"00:12.00\",\"text\":\"Valid\"}]}\nHope this helps!";

  const clean1 = extractCleanJson(rawWithMarkdown);
  const clean2 = extractCleanJson(rawWithExtraText);

  assert.equal(JSON.parse(clean1).lines[0].text, "Valid");
  assert.equal(JSON.parse(clean2).lines[0].text, "Valid");
});

test("4. Validation detects missing lines, blank text, and abnormally short output", () => {
  const sourceLines = [
    { id: 1, time: "00:10.00", text: "Kanneer kadalil njan thuzhanju" },
    { id: 2, time: "00:14.00", text: "Aaradhike mannil virinja thaarame" },
    { id: 3, time: "00:18.00", text: "Vaanil nilavu thorum raavu" },
  ];

  // Case A: Missing ID 2 and empty ID 3
  const corruptOutput = {
    lines: [
      { id: 1, time: "00:10.00", text: "കണ്ണീർ കടലിൽ ഞാൻ തുഴഞ്ഞു" },
      { id: 3, time: "00:18.00", text: "   " }, // Blank text
      // ID 2 omitted completely
    ],
  };

  const validationA = validateChunkOutput(sourceLines, corruptOutput);
  assert.equal(validationA.valid, false, "Corrupt output must be flagged invalid");
  assert.ok(validationA.failedIds.includes(2), "ID 2 must be flagged missing");
  assert.ok(validationA.failedIds.includes(3), "ID 3 must be flagged failed due to empty text");
  assert.ok(validationA.validLinesMap.has(1), "ID 1 should be retained as valid");

  // Case B: Abnormally short text (< 40% length)
  const shortOutput = {
    lines: [
      { id: 1, time: "00:10.00", text: "കണ്ണീർ കടലിൽ ഞാൻ തുഴഞ്ഞു" },
      { id: 2, time: "00:14.00", text: "A" }, // Source has 33 chars, output has 1 char (< 40%)
      { id: 3, time: "00:18.00", text: "വാനിൽ നിലാവ് തോരും രാവ്" },
    ],
  };

  const validationB = validateChunkOutput(sourceLines, shortOutput);
  assert.equal(validationB.valid, false, "Abnormally truncated line must be flagged invalid");
  assert.ok(validationB.failedIds.includes(2), "ID 2 must be in failedIds");
});

test("5. Auto-retry only sends failed or missing lines in subsequent attempt", async () => {
  let callCount = 0;
  const requestsMade = [];

  const mockFlakyCaller = async (prompt) => {
    callCount++;
    const idsInPrompt = (prompt.match(/^\d+\s*\|/gm) || []).map((m) => parseInt(m, 10));
    requestsMade.push(idsInPrompt);

    if (callCount === 1) {
      // First attempt: return lines 1 and 3, but drop line 2
      return JSON.stringify({
        lines: [
          { id: 1, time: "00:01.00", text: "Line 1 translated" },
          { id: 3, time: "00:03.00", text: "Line 3 translated" },
        ],
      });
    }

    // Retry attempt: should ONLY be called for line 2
    return JSON.stringify({
      lines: [
        { id: 2, time: "00:02.00", text: "Line 2 recovered on retry" },
      ],
    });
  };

  const inputLines = [
    { time: 1.0, text: "First line" },
    { time: 2.0, text: "Second line (failed on attempt 1)" },
    { time: 3.0, text: "Third line" },
  ];

  const result = await transliterateSynchronizedLyrics(inputLines, {
    llmCaller: mockFlakyCaller,
    bypassCache: true,
  });

  assert.equal(callCount, 2, "Should have retried once");
  assert.deepEqual(requestsMade[0], [1, 2, 3], "First call should request all 3 lines");
  assert.deepEqual(requestsMade[1], [2], "Retry call must request ONLY the failed line (ID 2)");

  assert.equal(result.lines[0].text, "Line 1 translated");
  assert.equal(result.lines[1].text, "Line 2 recovered on retry");
  assert.equal(result.lines[2].text, "Line 3 translated");
  assert.equal(result.metrics.linesRetried, 1, "Metrics should record 1 line retried");
});

test("6. Map by ID, not by order: Jumbled LLM lines preserve 100% original sync & timestamps", async () => {
  const mockJumblingCaller = async () => {
    // Return lines reversed and jumbled
    return JSON.stringify({
      lines: [
        { id: 3, time: "99:99.99", text: "Third Line Trans" }, // Corrupt time from LLM
        { id: 1, time: "88:88.88", text: "First Line Trans" },
        { id: 2, time: "77:77.77", text: "Second Line Trans" },
      ],
    });
  };

  const originalLines = [
    { time: 12.5, text: "Source Line 1" },
    { time: 16.0, text: "Source Line 2" },
    { time: 20.2, text: "Source Line 3" },
  ];

  const result = await transliterateSynchronizedLyrics(originalLines, {
    llmCaller: mockJumblingCaller,
    bypassCache: true,
  });

  assert.equal(result.lines[0].id, 1);
  assert.equal(result.lines[0].time, 12.5, "Timestamp must strictly come from original source data");
  assert.equal(result.lines[0].text, "First Line Trans");

  assert.equal(result.lines[1].id, 2);
  assert.equal(result.lines[1].time, 16.0, "Timestamp must strictly come from original source data");
  assert.equal(result.lines[1].text, "Second Line Trans");

  assert.equal(result.lines[2].id, 3);
  assert.equal(result.lines[2].time, 20.2, "Timestamp must strictly come from original source data");
  assert.equal(result.lines[2].text, "Third Line Trans");
});

test("7. Fallback to original line on persistent failure + Cache validation", async () => {
  invalidateLyricsTransliterationCache();

  let calls = 0;
  const mockPermanentlyFailingCaller = async () => {
    calls++;
    // Returns empty invalid JSON every time
    return "INVALID_NOT_JSON";
  };

  const sourceLines = [
    { time: 5.0, text: "Original Untouched Line 1" },
    { time: 10.0, text: "Original Untouched Line 2" },
  ];

  // Call 1: Should exhaust 2 retries (total 3 attempts) and fall back to source line
  const result1 = await transliterateSynchronizedLyrics(sourceLines, {
    songId: "cached_song_test",
    language: "malayalam",
    llmCaller: mockPermanentlyFailingCaller,
    maxRetries: 2,
  });

  assert.equal(result1.lines.length, 2, "Must return exactly 2 lines");
  assert.equal(result1.lines[0].text, "Original Untouched Line 1", "Fallback must return original source text");
  assert.equal(result1.lines[1].text, "Original Untouched Line 2", "Fallback must return original source text");
  assert.equal(result1.metrics.linesUsingFallback, 2, "Metrics should record 2 fallbacks");
  assert.equal(calls, 3, "Initial call + 2 retries = 3 calls");

  // Call 2: Should hit cache without invoking LLM caller again
  const result2 = await transliterateSynchronizedLyrics(sourceLines, {
    songId: "cached_song_test",
    language: "malayalam",
    llmCaller: mockPermanentlyFailingCaller,
  });

  assert.equal(result2.metrics.cacheHit, true, "Second request must hit cache");
  assert.equal(calls, 3, "LLM caller must NOT be called on cache hit");
  assert.deepEqual(result1.lines, result2.lines, "Cached lines must match exactly");
});

test("8. Task rule: Malayalam outputs Malayalam script; other languages output English letters (romanization)", async () => {
  // Test Malayalam
  const malInput = [
    { time: 10.0, text: "kannil pettol aavesham peyyunna raavil" }
  ];
  const malResult = await transliterateSynchronizedLyrics(malInput, {
    language: "malayalam",
    songId: "mal_song_test",
    bypassCache: true,
  });
  // Should contain Malayalam script Unicode range (0D00 - 0D7F)
  assert.ok(/[\u0D00-\u0D7F]/.test(malResult.lines[0].text), "Malayalam song must output Malayalam script");

  // Test Non-Malayalam (Hindi Devanagari input -> English romanization)
  const hindiInput = [
    { time: 12.0, text: "केसरिया तेरा इश्क है पिया" }
  ];
  const hindiResult = await transliterateSynchronizedLyrics(hindiInput, {
    language: "hindi",
    songId: "hindi_song_test",
    bypassCache: true,
  });
  // Should NOT contain Devanagari, should be in Latin/English letters
  assert.ok(!/[\u0900-\u097F]/.test(hindiResult.lines[0].text), "Hindi song must not contain Devanagari");
  assert.ok(/[a-zA-Z]/.test(hindiResult.lines[0].text), "Hindi song must output in English letters");
});
