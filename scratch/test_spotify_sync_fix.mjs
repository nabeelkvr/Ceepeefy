import assert from "node:assert";
import { applySyncPlan } from "../src/services/spotifySyncService.js";

function runTest() {
  console.log("=== RUNNING SPOTIFY SYNC FIX TEST SUITE ===");

  // Existing tracks in Ceepeefy playlist
  const existingTracks = [
    { id: "jio-1", title: "Kesariya", artist: "Arijit Singh", sourceEntryId: "fp1#0", duration: 240 },
    { id: "jio-2", title: "Raataan Lambiyan", artist: "Jubin Nautiyal", sourceEntryId: "fp2#0", duration: 210 },
    { id: "jio-3", title: "Apna Bana Le", artist: "Arijit Singh", sourceEntryId: "fp3#0", duration: 250 },
    { id: "manual-4", title: "My Custom Song", artist: "Local Artist", isManual: true, duration: 180 },
  ];

  // Test 1: Undefined / Missing newItems in diff (Must not crash with TypeError!)
  const diffMissingNewItems = {
    added: [],
    removed: [{ sourceEntryId: "fp2#0", existingTrack: { id: "jio-2" } }],
    reordered: [],
    unchanged: [],
    manualTracks: [],
    // Note: newItems is completely undefined here!
  };

  const output1 = applySyncPlan({
    diff: diffMissingNewItems,
    matchedAddedItems: [],
    existingTracks,
  });

  assert.ok(output1, "applySyncPlan should return an object");
  assert.strictEqual(output1.removedCount, 1, "Should count 1 removed track");
  assert.strictEqual(output1.updatedTracks.length, 3, "Length should be 4 - 1 = 3");
  // Check that jio-2 is removed and others are kept
  assert.ok(!output1.updatedTracks.some((t) => t.id === "jio-2"), "jio-2 must be removed");
  assert.ok(output1.updatedTracks.some((t) => t.id === "jio-1"), "jio-1 must be preserved");
  assert.ok(output1.updatedTracks.some((t) => t.id === "jio-3"), "jio-3 must be preserved");
  assert.ok(output1.updatedTracks.some((t) => t.id === "manual-4"), "manual-4 must be preserved");
  console.log("✓ Test 1 Passed: Does not crash on undefined newItems; removes ONLY deleted song");

  // Test 2: Add a new song
  const newSong = {
    id: "jio-5",
    title: "Chaleya",
    artist: "Arijit Singh",
    duration: 200,
  };

  const diffAddSong = {
    added: [{ sourceEntryId: "fp5#0", newItem: { name: "Chaleya" }, targetIndex: 1 }],
    removed: [],
    reordered: [],
    unchanged: [],
    manualTracks: [],
  };

  const output2 = applySyncPlan({
    diff: diffAddSong,
    matchedAddedItems: [
      {
        sourceEntryId: "fp5#0",
        playableTrack: newSong,
        targetIndex: 1,
      },
    ],
    existingTracks,
  });

  assert.strictEqual(output2.addedCount, 1, "Should count 1 added track");
  assert.strictEqual(output2.updatedTracks.length, 5, "Length should be 4 + 1 = 5");
  assert.strictEqual(output2.updatedTracks[1].id, "jio-5", "New song should be placed at target index 1");
  // Existing songs must be intact!
  assert.strictEqual(output2.updatedTracks[0].id, "jio-1", "Original track 0 intact");
  assert.strictEqual(output2.updatedTracks[2].id, "jio-2", "Original track 1 shifted intact");
  console.log("✓ Test 2 Passed: Adds ONLY newly added song at correct position; keeps existing songs intact");

  // Test 3: Simultaneous Delete & Add (Only modify what changed!)
  const diffSyncBoth = {
    added: [{ sourceEntryId: "fp5#0", newItem: { name: "Chaleya" }, targetIndex: 0 }],
    removed: [{ sourceEntryId: "fp3#0", existingTrack: { id: "jio-3" } }],
    reordered: [],
    unchanged: [],
    manualTracks: [],
  };

  const output3 = applySyncPlan({
    diff: diffSyncBoth,
    matchedAddedItems: [
      {
        sourceEntryId: "fp5#0",
        playableTrack: newSong,
        targetIndex: 0,
      },
    ],
    existingTracks,
  });

  assert.strictEqual(output3.addedCount, 1);
  assert.strictEqual(output3.removedCount, 1);
  // jio-3 deleted, jio-5 added
  assert.ok(!output3.updatedTracks.some((t) => t.id === "jio-3"), "jio-3 was deleted");
  assert.ok(output3.updatedTracks.some((t) => t.id === "jio-5"), "jio-5 was added");
  assert.ok(output3.updatedTracks.some((t) => t.id === "jio-1"), "jio-1 preserved");
  assert.ok(output3.updatedTracks.some((t) => t.id === "jio-2"), "jio-2 preserved");
  assert.ok(output3.updatedTracks.some((t) => t.id === "manual-4"), "manual-4 preserved");
  console.log("✓ Test 3 Passed: Combined add & remove successfully updates ONLY changed songs");

  console.log("\n========================================================");
  console.log("ALL SPOTIFY SYNC TESTS PASSED! (3/3 suites passed)");
  console.log("========================================================\n");
}

runTest();
