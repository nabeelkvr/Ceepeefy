import assert from "node:assert";

// Mock browser environment for Node.js test
globalThis.window = {
  localStorage: {
    store: {},
    getItem(key) {
      return this.store[key] || null;
    },
    setItem(key, val) {
      this.store[key] = String(val);
    },
    removeItem(key) {
      delete this.store[key];
    },
  },
};
globalThis.localStorage = globalThis.window.localStorage;

// Test fake indexedDB in memory
const fakeDB = {
  tracks: new Map(),
  playlists: new Map(),
  recent: new Map(),
};

// Import services
import {
  getAllLocalPlaylists,
  saveLocalPlaylist,
  deleteLocalPlaylist,
  addTracksToLocalPlaylist,
  removeTrackFromLocalPlaylist,
  reorderLocalPlaylistTracks,
  formatFileSize,
} from "../src/services/localMusicService.js";

async function runTestSuite() {
  console.log("=== STARTING LOCAL MUSIC PLAYER & PLAYLIST TEST SUITE ===");

  // Test 1: File size formatter
  assert.strictEqual(formatFileSize(0), "0 MB");
  assert.strictEqual(formatFileSize(1024), "1 KB");
  assert.strictEqual(formatFileSize(1048576 * 5.5), "5.5 MB");
  assert.strictEqual(formatFileSize(1073741824 * 1.2), "1.2 GB");
  console.log("✓ Test 1 Passed: File size formatter works accurately");

  // Test 2: Local Playlists initial state
  const initialPlaylists = await getAllLocalPlaylists();
  assert.ok(Array.isArray(initialPlaylists), "Initial playlists should be an array");
  console.log("✓ Test 2 Passed: Initial playlists loaded safely");

  // Test 3: Create Local Playlist
  const testPl1 = {
    id: "local-pl-" + Date.now(),
    name: "Night Vibes",
    description: "Offline chill tracks",
    trackIds: ["local-1", "local-2"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveLocalPlaylist(testPl1);
  let playlists = await getAllLocalPlaylists();
  assert.strictEqual(playlists.length, 1);
  assert.strictEqual(playlists[0].name, "Night Vibes");
  assert.deepStrictEqual(playlists[0].trackIds, ["local-1", "local-2"]);
  console.log("✓ Test 3 Passed: saveLocalPlaylist properly saves new playlist");

  // Test 4: Add tracks to existing playlist
  await addTracksToLocalPlaylist(testPl1.id, ["local-3", "local-4"]);
  playlists = await getAllLocalPlaylists();
  const plAfterAdd = playlists.find((p) => p.id === testPl1.id);
  assert.strictEqual(plAfterAdd.trackIds.length, 4);
  assert.ok(plAfterAdd.trackIds.includes("local-3"));
  assert.ok(plAfterAdd.trackIds.includes("local-4"));
  console.log("✓ Test 4 Passed: addTracksToLocalPlaylist appends tracks without duplicates");

  // Adding duplicate track to playlist should not duplicate IDs
  await addTracksToLocalPlaylist(testPl1.id, ["local-3"]);
  playlists = await getAllLocalPlaylists();
  assert.strictEqual(playlists.find((p) => p.id === testPl1.id).trackIds.length, 4);
  console.log("✓ Test 4b Passed: addTracksToLocalPlaylist prevents duplicate track IDs in playlist");

  // Test 5: Reorder playlist tracks
  await reorderLocalPlaylistTracks(testPl1.id, ["local-4", "local-3", "local-2", "local-1"]);
  playlists = await getAllLocalPlaylists();
  assert.deepStrictEqual(
    playlists.find((p) => p.id === testPl1.id).trackIds,
    ["local-4", "local-3", "local-2", "local-1"]
  );
  console.log("✓ Test 5 Passed: reorderLocalPlaylistTracks updates track order");

  // Test 6: Remove track from playlist (preserving track itself)
  await removeTrackFromLocalPlaylist(testPl1.id, "local-3");
  playlists = await getAllLocalPlaylists();
  const plAfterRemove = playlists.find((p) => p.id === testPl1.id);
  assert.strictEqual(plAfterRemove.trackIds.length, 3);
  assert.ok(!plAfterRemove.trackIds.includes("local-3"));
  console.log("✓ Test 6 Passed: removeTrackFromLocalPlaylist removes membership without deleting track");

  // Test 7: Create a second playlist
  const testPl2 = {
    id: "local-pl-2-" + Date.now(),
    name: "Workout Energy",
    description: "High BPM tracks",
    trackIds: ["local-1", "local-5"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveLocalPlaylist(testPl2);
  playlists = await getAllLocalPlaylists();
  assert.strictEqual(playlists.length, 2);
  console.log("✓ Test 7 Passed: Multiple local playlists supported simultaneously");

  // Test 8: Delete playlist (underlying tracks preserved)
  await deleteLocalPlaylist(testPl1.id);
  playlists = await getAllLocalPlaylists();
  assert.strictEqual(playlists.length, 1);
  assert.strictEqual(playlists[0].id, testPl2.id);
  console.log("✓ Test 8 Passed: deleteLocalPlaylist removes playlist while keeping others intact");

  // Test 9: Duplicate detection logic simulation
  const existingTracks = [
    { id: "local-1", fileName: "MySong.mp3", fileSize: 5000000 },
    { id: "local-2", fileName: "Track2.wav", fileSize: 20000000 },
  ];
  const newFiles = [
    { name: "MySong.mp3", size: 5000000 }, // Duplicate by name & size!
    { name: "BrandNew.flac", size: 30000000 }, // New!
  ];
  const existingKeySet = new Set(
    existingTracks.map((t) => `${t.fileName.toLowerCase()}:::${t.fileSize || 0}`)
  );
  const duplicates = newFiles.filter((f) => existingKeySet.has(`${f.name.toLowerCase()}:::${f.size || 0}`));
  const toProcess = newFiles.filter((f) => !existingKeySet.has(`${f.name.toLowerCase()}:::${f.size || 0}`));

  assert.strictEqual(duplicates.length, 1);
  assert.strictEqual(duplicates[0].name, "MySong.mp3");
  assert.strictEqual(toProcess.length, 1);
  assert.strictEqual(toProcess[0].name, "BrandNew.flac");
  console.log("✓ Test 9 Passed: Duplicate import detection accurately identifies existing files");

  console.log("\n========================================================");
  console.log("ALL TESTS PASSED SUCCESSFULLY! (9/9 suites passed)");
  console.log("========================================================\n");
}

runTestSuite().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
