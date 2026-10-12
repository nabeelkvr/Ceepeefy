import {
  getTrackFingerprint,
  diffSpotifyPlaylist,
  applySyncPlan,
  buildSnapshotFromExistingPlaylist,
} from "../src/services/spotifySyncService.js";

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log("--- Starting Spotify Sync Engine Tests ---");

// Test 1: Nothing changed on Spotify
{
  const oldTracks = [
    { spotifyId: "trackA", name: "Song A", primaryArtist: "Artist A", duration_ms: 200000, id: "jioA" },
    { spotifyId: "trackB", name: "Song B", primaryArtist: "Artist B", duration_ms: 210000, id: "jioB" },
    { spotifyId: "trackC", name: "Song C", primaryArtist: "Artist C", duration_ms: 220000, id: "jioC" },
  ];
  const oldSnapshot = buildSnapshotFromExistingPlaylist({ tracks: oldTracks });
  const currentSpotify = [
    { spotifyId: "trackA", name: "Song A", primaryArtist: "Artist A", duration_ms: 200000 },
    { spotifyId: "trackB", name: "Song B", primaryArtist: "Artist B", duration_ms: 210000 },
    { spotifyId: "trackC", name: "Song C", primaryArtist: "Artist C", duration_ms: 220000 },
  ];

  const diff = diffSpotifyPlaylist(oldSnapshot, currentSpotify, oldTracks);
  assert(diff.isUpToDate === true, "Test 1: isUpToDate should be true");
  assert(diff.hasChanges === false, "Test 1: hasChanges should be false");
  assert(diff.summary.addedCount === 0, "Test 1: 0 added");
  assert(diff.summary.removedCount === 0, "Test 1: 0 removed");
  assert(diff.summary.reorderedCount === 0, "Test 1: 0 reordered");
  assert(diff.summary.unchangedCount === 3, "Test 1: 3 unchanged");
}

// Test 2: One Spotify song added
{
  const oldTracks = [
    { spotifyId: "trackA", name: "Song A", primaryArtist: "Artist A", duration_ms: 200000, id: "jioA" },
    { spotifyId: "trackB", name: "Song B", primaryArtist: "Artist B", duration_ms: 210000, id: "jioB" },
  ];
  const oldSnapshot = buildSnapshotFromExistingPlaylist({ tracks: oldTracks });
  const currentSpotify = [
    { spotifyId: "trackA", name: "Song A", primaryArtist: "Artist A", duration_ms: 200000 },
    { spotifyId: "trackNew", name: "Song New", primaryArtist: "Artist New", duration_ms: 230000 },
    { spotifyId: "trackB", name: "Song B", primaryArtist: "Artist B", duration_ms: 210000 },
  ];

  const diff = diffSpotifyPlaylist(oldSnapshot, currentSpotify, oldTracks);
  assert(diff.isUpToDate === false, "Test 2: isUpToDate is false");
  assert(diff.summary.addedCount === 1, "Test 2: exactly 1 added");
  assert(diff.added[0].newItem.spotifyId === "trackNew", "Test 2: added item is trackNew");
  assert(diff.summary.removedCount === 0, "Test 2: 0 removed");

  // Apply plan
  const matchedAdded = [
    {
      sourceEntryId: diff.added[0].sourceEntryId,
      playableTrack: { id: "jioNew", title: "Song New", artist: "Artist New" },
    },
  ];
  const result = applySyncPlan({ diff, matchedAddedItems: matchedAdded });
  assert(result.updatedTracks.length === 3, "Test 2: Result has 3 tracks");
  assert(result.updatedTracks[0].id === "jioA", "Test 2: trackA is first and preserves jioA");
  assert(result.updatedTracks[1].id === "jioNew", "Test 2: trackNew inserted at index 1");
  assert(result.updatedTracks[2].id === "jioB", "Test 2: trackB is at index 2 and preserves jioB");
}

// Test 3: One Spotify song deleted
{
  const oldTracks = [
    { spotifyId: "trackA", name: "Song A", primaryArtist: "Artist A", id: "jioA" },
    { spotifyId: "trackB", name: "Song B", primaryArtist: "Artist B", id: "jioB" },
    { spotifyId: "trackC", name: "Song C", primaryArtist: "Artist C", id: "jioC" },
  ];
  const oldSnapshot = buildSnapshotFromExistingPlaylist({ tracks: oldTracks });
  // Song B deleted
  const currentSpotify = [
    { spotifyId: "trackA", name: "Song A", primaryArtist: "Artist A" },
    { spotifyId: "trackC", name: "Song C", primaryArtist: "Artist C" },
  ];

  const diff = diffSpotifyPlaylist(oldSnapshot, currentSpotify, oldTracks);
  assert(diff.summary.removedCount === 1, "Test 3: 1 removed");
  assert(diff.removed[0].prevItem.spotifyId === "trackB", "Test 3: removed is trackB");

  const result = applySyncPlan({ diff });
  assert(result.updatedTracks.length === 2, "Test 3: Result has 2 tracks");
  assert(result.updatedTracks[0].id === "jioA", "Test 3: jioA preserved");
  assert(result.updatedTracks[1].id === "jioC", "Test 3: jioC preserved");
}

// Test 4: Reordering Spotify tracks without re-matching
{
  const oldTracks = [
    { spotifyId: "trackA", name: "Song A", primaryArtist: "Artist A", id: "jioA" },
    { spotifyId: "trackB", name: "Song B", primaryArtist: "Artist B", id: "jioB" },
    { spotifyId: "trackC", name: "Song C", primaryArtist: "Artist C", id: "jioC" },
  ];
  const oldSnapshot = buildSnapshotFromExistingPlaylist({ tracks: oldTracks });
  // Reordered to C, A, B
  const currentSpotify = [
    { spotifyId: "trackC", name: "Song C", primaryArtist: "Artist C" },
    { spotifyId: "trackA", name: "Song A", primaryArtist: "Artist A" },
    { spotifyId: "trackB", name: "Song B", primaryArtist: "Artist B" },
  ];

  const diff = diffSpotifyPlaylist(oldSnapshot, currentSpotify, oldTracks);
  assert(diff.summary.addedCount === 0, "Test 4: 0 added");
  assert(diff.summary.removedCount === 0, "Test 4: 0 removed");
  assert(diff.summary.reorderedCount > 0, "Test 4: detected reordered");

  const result = applySyncPlan({ diff });
  assert(result.updatedTracks.length === 3, "Test 4: 3 tracks preserved");
  assert(result.updatedTracks[0].id === "jioC", "Test 4: C is first with jioC");
  assert(result.updatedTracks[1].id === "jioA", "Test 4: A is second with jioA");
  assert(result.updatedTracks[2].id === "jioB", "Test 4: B is third with jioB");
}

// Test 5: Duplicate occurrences tracking
{
  const oldTracks = [
    { spotifyId: "trackA", name: "Song A", primaryArtist: "Artist A", id: "jioA" },
    { spotifyId: "trackB", name: "Song B", primaryArtist: "Artist B", id: "jioB" },
    { spotifyId: "trackA", name: "Song A", primaryArtist: "Artist A", id: "jioA" },
  ];
  const oldSnapshot = buildSnapshotFromExistingPlaylist({ tracks: oldTracks });
  assert(oldSnapshot[0].sourceEntryId === "sp_trackA#0", "Test 5: first occurrence has #0");
  assert(oldSnapshot[2].sourceEntryId === "sp_trackA#1", "Test 5: second occurrence has #1");

  // Remove ONLY second occurrence on Spotify
  const currentSpotify = [
    { spotifyId: "trackA", name: "Song A", primaryArtist: "Artist A" },
    { spotifyId: "trackB", name: "Song B", primaryArtist: "Artist B" },
  ];

  const diff = diffSpotifyPlaylist(oldSnapshot, currentSpotify, oldTracks);
  assert(diff.summary.removedCount === 1, "Test 5: 1 removed");
  assert(diff.removed[0].sourceEntryId === "sp_trackA#1", "Test 5: removed exact occurrence #1");

  const result = applySyncPlan({ diff });
  assert(result.updatedTracks.length === 2, "Test 5: Result has 2 tracks");
  assert(result.updatedTracks[0].sourceEntryId === "sp_trackA#0", "Test 5: occurrence #0 preserved");
}

// Test 6: Manual Ceepeefy tracks are preserved
{
  const oldTracks = [
    { spotifyId: "trackA", name: "Song A", primaryArtist: "Artist A", id: "jioA", sourceEntryId: "sp_trackA#0" },
    { id: "manual1", title: "Manual Song", artist: "Manual Artist", isManual: true },
    { spotifyId: "trackB", name: "Song B", primaryArtist: "Artist B", id: "jioB", sourceEntryId: "sp_trackB#0" },
  ];
  const oldSnapshot = [
    { sourceEntryId: "sp_trackA#0", fingerprint: "sp_trackA", spotifyId: "trackA", name: "Song A", jioTrackId: "jioA" },
    { sourceEntryId: "sp_trackB#0", fingerprint: "sp_trackB", spotifyId: "trackB", name: "Song B", jioTrackId: "jioB" },
  ];
  // On Spotify, B is removed
  const currentSpotify = [
    { spotifyId: "trackA", name: "Song A", primaryArtist: "Artist A" },
  ];

  const diff = diffSpotifyPlaylist(oldSnapshot, currentSpotify, oldTracks);
  assert(diff.summary.manualTracksCount === 1, "Test 6: 1 manual track recognized");
  assert(diff.summary.removedCount === 1, "Test 6: trackB removed from Spotify");

  const result = applySyncPlan({ diff });
  assert(result.updatedTracks.length === 2, "Test 6: 2 tracks remain (trackA and manual1)");
  assert(result.updatedTracks[0].id === "jioA", "Test 6: trackA retained");
  assert(result.updatedTracks[1].id === "manual1", "Test 6: manual track NOT deleted!");
}

// Test 7: Duplicate track added
{
  const oldTracks = [
    { spotifyId: "trackA", name: "Song A", primaryArtist: "Artist A", id: "jioA", sourceEntryId: "sp_trackA#0" },
    { spotifyId: "trackB", name: "Song B", primaryArtist: "Artist B", id: "jioB", sourceEntryId: "sp_trackB#0" },
  ];
  const oldSnapshot = [
    { sourceEntryId: "sp_trackA#0", fingerprint: "sp_trackA", spotifyId: "trackA", name: "Song A", jioTrackId: "jioA" },
    { sourceEntryId: "sp_trackB#0", fingerprint: "sp_trackB", spotifyId: "trackB", name: "Song B", jioTrackId: "jioB" },
  ];
  // Add another trackA at the end
  const currentSpotify = [
    { spotifyId: "trackA", name: "Song A", primaryArtist: "Artist A" },
    { spotifyId: "trackB", name: "Song B", primaryArtist: "Artist B" },
    { spotifyId: "trackA", name: "Song A", primaryArtist: "Artist A" },
  ];

  const diff = diffSpotifyPlaylist(oldSnapshot, currentSpotify, oldTracks);
  assert(diff.summary.addedCount === 1, "Test 7: 1 track added");
  assert(diff.added[0].sourceEntryId === "sp_trackA#1", "Test 7: newly added occurrence is #1");

  const matchedAdded = [
    {
      sourceEntryId: "sp_trackA#1",
      playableTrack: { id: "jioA", title: "Song A", artist: "Artist A" },
    },
  ];
  const result = applySyncPlan({ diff, matchedAddedItems: matchedAdded });
  assert(result.updatedTracks.length === 3, "Test 7: 3 tracks total in result");
  assert(result.updatedTracks[0].sourceEntryId === "sp_trackA#0", "Test 7: first is occurrence #0");
  assert(result.updatedTracks[2].sourceEntryId === "sp_trackA#1", "Test 7: third is occurrence #1");
}

// Test 8: Unresolved / low-confidence track is NOT inserted into playlist, existing tracks untouched
{
  const oldTracks = [
    { spotifyId: "trackA", name: "Song A", primaryArtist: "Artist A", id: "jioA", sourceEntryId: "sp_trackA#0" },
  ];
  const oldSnapshot = [
    { sourceEntryId: "sp_trackA#0", fingerprint: "sp_trackA", spotifyId: "trackA", name: "Song A", jioTrackId: "jioA" },
  ];
  // New track added, but cannot be matched
  const currentSpotify = [
    { spotifyId: "trackA", name: "Song A", primaryArtist: "Artist A" },
    { spotifyId: "obscureTrack", name: "Obscure Unreleased Track", primaryArtist: "Unknown" },
  ];

  const diff = diffSpotifyPlaylist(oldSnapshot, currentSpotify, oldTracks);
  assert(diff.summary.addedCount === 1, "Test 8: 1 track added on Spotify");

  // No matched candidate provided (unresolved)
  const result = applySyncPlan({
    diff,
    matchedAddedItems: [], // No confident match
    unresolvedAdditions: [{ sourceEntryId: diff.added[0].sourceEntryId, spotifyTrack: diff.added[0].newItem }],
  });

  // Track A is kept, obscureTrack is NOT added as a fake track
  assert(result.updatedTracks.length === 1, "Test 8: Only 1 track in playlist (fake song not added)");
  assert(result.updatedTracks[0].id === "jioA", "Test 8: Track A is completely untouched");
  assert(result.newSnapshot.length === 2, "Test 8: Snapshot retains unresolved entry for future retry");
  assert(result.newSnapshot[1].status === "unresolved", "Test 8: Unresolved status preserved in snapshot");
}

console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
