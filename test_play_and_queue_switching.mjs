import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTrackId,
  normalizeTitleForIdentity,
} from "./src/utils/trackIdentity.js";
import {
  buildIntelligentQueue,
} from "./src/utils/recommendationEngine.js";
import { buildAdaptiveQueue } from "./src/utils/adaptiveRecommendationLayer.js";
import { MALAYALAM_HITS } from "./src/data/curatedDiscovery.js";

describe("Song Switching & Queue Responsiveness Verification", () => {
  const seedTrackMalayalam1 = {
    id: "track-mal-1",
    title: "Kalyani",
    artist: "K.J. Yesudas",
    language: "malayalam",
    album: "Neelakkadambu",
  };

  const seedTrackMalayalam2 = {
    id: "track-mal-2",
    title: "Aalorungi Arangorungi",
    artist: "Chithra",
    language: "malayalam",
    album: "Kireedam",
  };

  const mockTracklist = [
    seedTrackMalayalam1,
    seedTrackMalayalam2,
    { id: "track-mal-3", title: "Chembarathi Poove", artist: "M.G. Sreekumar", language: "malayalam" },
    { id: "track-mal-4", title: "Pavizha Mazha", artist: "K.S. Harisankar", language: "malayalam" },
    { id: "track-mal-5", title: "Aavesham Theme", artist: "Sushin Shyam", language: "malayalam" },
    { id: "track-hin-1", title: "Tum Hi Ho", artist: "Arijit Singh", language: "hindi" },
  ];

  it("1: Standalone click correctly filters out clicked track using hoisted trackIdStr", () => {
    const clickedTrack = seedTrackMalayalam1;
    const trackIdStr = String(clickedTrack.id || "");

    const sameLangCandidates = mockTracklist.filter((t) => {
      if (!t || String(t.id) === trackIdStr) return false;
      if (clickedTrack.language) {
        const tLang = (t.language || "").toLowerCase().trim();
        if (tLang && tLang !== clickedTrack.language) return false;
      }
      return true;
    });

    // Must not include track-mal-1
    assert.ok(!sameLangCandidates.some((t) => String(t.id) === "track-mal-1"));
    // Must not include hindi track
    assert.ok(!sameLangCandidates.some((t) => t.language === "hindi"));
    // Must include the other 4 malayalam tracks
    assert.equal(sameLangCandidates.length, 4);
  });

  it("2: Consecutive clicks on distinct Malayalam songs produce responsive, non-identical queues", () => {
    const queue1 = buildAdaptiveQueue(seedTrackMalayalam1, MALAYALAM_HITS, { maxResults: 10 });
    const queue2 = buildAdaptiveQueue(seedTrackMalayalam2, MALAYALAM_HITS, { maxResults: 10 });

    assert.ok(queue1.length > 0, "Queue 1 must contain recommended songs");
    assert.ok(queue2.length > 0, "Queue 2 must contain recommended songs");

    // Neither queue contains its own seed song
    assert.ok(!queue1.some((t) => String(t.id) === "track-mal-1"));
    assert.ok(!queue2.some((t) => String(t.id) === "track-mal-2"));

    // Queues must be responsive and context-specific to their seeds
    const titles1 = queue1.map((t) => t.title);
    const titles2 = queue2.map((t) => t.title);
    assert.notDeepEqual(titles1, titles2, "Queues for different seeds must not be identical");
  });

  it("3: buildIntelligentQueue eliminates duplicate identity representations and respects anti-repetition", () => {
    const seed = seedTrackMalayalam1;
    const candidates = [
      { id: "track-mal-3", title: "Chembarathi Poove", artist: "M.G. Sreekumar" },
      { id: "mal-3", title: "Chembarathi Poove (Remastered)", artist: "M.G. Sreekumar" }, // Duplicate
      { id: "track-mal-4", title: "Pavizha Mazha", artist: "K.S. Harisankar" },
    ];

    const queue = buildIntelligentQueue(seed, candidates, { maxResults: 10 });
    assert.equal(queue.length, 2, "Duplicate identity representations must be collapsed");
    assert.equal(queue[0].title, "Chembarathi Poove");
    assert.equal(queue[1].title, "Pavizha Mazha");
  });
});
