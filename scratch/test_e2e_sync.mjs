import {
  diffSpotifyPlaylist,
  applySyncPlan,
  buildSnapshotFromExistingPlaylist,
  getTrackFingerprint,
} from "../src/services/spotifySyncService.js";

function assert(condition, desc) {
  if (!condition) {
    console.error(`❌ FAILED: ${desc}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${desc}`);
}

console.log("=== RUNNING FULL E2E SPOTIFY SYNC SCENARIO SUITE ===");

// 1. Nothing changed on Spotify — no Ceepeefy tracks are modified
{
  const tracks = [
    { id: "jio_1", title: "Track 1", artist: "Artist 1", spotifyId: "sp_1", sourceEntryId: "sp_sp_1#0", isSpotifyTrack: true },
    { id: "jio_2", title: "Track 2", artist: "Artist 2", spotifyId: "sp_2", sourceEntryId: "sp_sp_2#0", isSpotifyTrack: true },
  ];
  const snapshot = [
    { sourceEntryId: "sp_sp_1#0", fingerprint: "sp_sp_1", spotifyId: "sp_1", jioTrackId: "jio_1" },
    { sourceEntryId: "sp_sp_2#0", fingerprint: "sp_sp_2", spotifyId: "sp_2", jioTrackId: "jio_2" },
  ];
  const currentSpotify = [
    { spotifyId: "sp_1", name: "Track 1", primaryArtist: "Artist 1" },
    { spotifyId: "sp_2", name: "Track 2", primaryArtist: "Artist 2" },
  ];

  const diff = diffSpotifyPlaylist(snapshot, currentSpotify, tracks);
  assert(diff.isUpToDate === true, "Scenario 1: Detected up to date");
  assert(diff.summary.addedCount === 0 && diff.summary.removedCount === 0, "Scenario 1: No adds or removes");
}

// 2. One Spotify song added — only the new song is matched and inserted
{
  const tracks = [
    { id: "jio_1", title: "Track 1", artist: "Artist 1", spotifyId: "sp_1", sourceEntryId: "sp_sp_1#0", isSpotifyTrack: true },
    { id: "jio_2", title: "Track 2", artist: "Artist 2", spotifyId: "sp_2", sourceEntryId: "sp_sp_2#0", isSpotifyTrack: true },
  ];
  const snapshot = [
    { sourceEntryId: "sp_sp_1#0", fingerprint: "sp_sp_1", spotifyId: "sp_1", jioTrackId: "jio_1" },
    { sourceEntryId: "sp_sp_2#0", fingerprint: "sp_sp_2", spotifyId: "sp_2", jioTrackId: "jio_2" },
  ];
  const currentSpotify = [
    { spotifyId: "sp_1", name: "Track 1", primaryArtist: "Artist 1" },
    { spotifyId: "sp_new", name: "New Track", primaryArtist: "New Artist" },
    { spotifyId: "sp_2", name: "Track 2", primaryArtist: "Artist 2" },
  ];

  const diff = diffSpotifyPlaylist(snapshot, currentSpotify, tracks);
  assert(diff.summary.addedCount === 1, "Scenario 2: Exactly 1 added");
  assert(diff.summary.removedCount === 0, "Scenario 2: 0 removed");
  assert(diff.summary.unchangedCount === 2, "Scenario 2: 2 unchanged");

  const matched = [
    {
      sourceEntryId: diff.added[0].sourceEntryId,
      playableTrack: { id: "jio_new", title: "New Track", artist: "New Artist" },
    },
  ];
  const res = applySyncPlan({ diff, matchedAddedItems: matched });
  assert(res.updatedTracks.length === 3, "Scenario 2: Total 3 tracks");
  assert(res.updatedTracks[0].id === "jio_1", "Scenario 2: Track 1 unchanged with jio_1");
  assert(res.updatedTracks[1].id === "jio_new", "Scenario 2: New track at position 1");
  assert(res.updatedTracks[2].id === "jio_2", "Scenario 2: Track 2 unchanged with jio_2");
}

// 3. One Spotify song deleted — only the corresponding source-managed occurrence is removed
{
  const tracks = [
    { id: "jio_1", title: "Track 1", artist: "Artist 1", spotifyId: "sp_1", sourceEntryId: "sp_sp_1#0", isSpotifyTrack: true },
    { id: "jio_2", title: "Track 2", artist: "Artist 2", spotifyId: "sp_2", sourceEntryId: "sp_sp_2#0", isSpotifyTrack: true },
    { id: "jio_3", title: "Track 3", artist: "Artist 3", spotifyId: "sp_3", sourceEntryId: "sp_sp_3#0", isSpotifyTrack: true },
  ];
  const snapshot = [
    { sourceEntryId: "sp_sp_1#0", fingerprint: "sp_sp_1", spotifyId: "sp_1", jioTrackId: "jio_1" },
    { sourceEntryId: "sp_sp_2#0", fingerprint: "sp_sp_2", spotifyId: "sp_2", jioTrackId: "jio_2" },
    { sourceEntryId: "sp_sp_3#0", fingerprint: "sp_sp_3", spotifyId: "sp_3", jioTrackId: "jio_3" },
  ];
  // Remove sp_2
  const currentSpotify = [
    { spotifyId: "sp_1", name: "Track 1", primaryArtist: "Artist 1" },
    { spotifyId: "sp_3", name: "Track 3", primaryArtist: "Artist 3" },
  ];

  const diff = diffSpotifyPlaylist(snapshot, currentSpotify, tracks);
  assert(diff.summary.removedCount === 1, "Scenario 3: 1 removed");
  assert(diff.removed[0].sourceEntryId === "sp_sp_2#0", "Scenario 3: Removed sp_2");

  const res = applySyncPlan({ diff });
  assert(res.updatedTracks.length === 2, "Scenario 3: 2 remaining tracks");
  assert(res.updatedTracks[0].id === "jio_1" && res.updatedTracks[1].id === "jio_3", "Scenario 3: jio_1 and jio_3 preserved");
}

// 4. Several songs added and deleted without rebuilding playlist
{
  const tracks = [
    { id: "jio_1", title: "Track 1", artist: "Artist 1", spotifyId: "sp_1", sourceEntryId: "sp_sp_1#0", isSpotifyTrack: true },
    { id: "jio_2", title: "Track 2", artist: "Artist 2", spotifyId: "sp_2", sourceEntryId: "sp_sp_2#0", isSpotifyTrack: true },
    { id: "jio_3", title: "Track 3", artist: "Artist 3", spotifyId: "sp_3", sourceEntryId: "sp_sp_3#0", isSpotifyTrack: true },
    { id: "jio_4", title: "Track 4", artist: "Artist 4", spotifyId: "sp_4", sourceEntryId: "sp_sp_4#0", isSpotifyTrack: true },
  ];
  const snapshot = [
    { sourceEntryId: "sp_sp_1#0", fingerprint: "sp_sp_1", spotifyId: "sp_1", jioTrackId: "jio_1" },
    { sourceEntryId: "sp_sp_2#0", fingerprint: "sp_sp_2", spotifyId: "sp_2", jioTrackId: "jio_2" },
    { sourceEntryId: "sp_sp_3#0", fingerprint: "sp_sp_3", spotifyId: "sp_3", jioTrackId: "jio_3" },
    { sourceEntryId: "sp_sp_4#0", fingerprint: "sp_sp_4", spotifyId: "sp_4", jioTrackId: "jio_4" },
  ];
  // Remove 2 and 4, add 5 and 6
  const currentSpotify = [
    { spotifyId: "sp_1", name: "Track 1", primaryArtist: "Artist 1" },
    { spotifyId: "sp_5", name: "Track 5", primaryArtist: "Artist 5" },
    { spotifyId: "sp_3", name: "Track 3", primaryArtist: "Artist 3" },
    { spotifyId: "sp_6", name: "Track 6", primaryArtist: "Artist 6" },
  ];

  const diff = diffSpotifyPlaylist(snapshot, currentSpotify, tracks);
  assert(diff.summary.addedCount === 2, "Scenario 4: 2 added");
  assert(diff.summary.removedCount === 2, "Scenario 4: 2 removed");

  const matched = [
    { sourceEntryId: "sp_sp_5#0", playableTrack: { id: "jio_5", title: "Track 5" } },
    { sourceEntryId: "sp_sp_6#0", playableTrack: { id: "jio_6", title: "Track 6" } },
  ];
  const res = applySyncPlan({ diff, matchedAddedItems: matched });
  assert(res.updatedTracks.length === 4, "Scenario 4: 4 tracks total");
  assert(res.updatedTracks[0].id === "jio_1", "Scenario 4: jio_1 preserved");
  assert(res.updatedTracks[1].id === "jio_5", "Scenario 4: jio_5 inserted");
  assert(res.updatedTracks[2].id === "jio_3", "Scenario 4: jio_3 preserved");
  assert(res.updatedTracks[3].id === "jio_6", "Scenario 4: jio_6 inserted");
}

// 5. Spotify playlist reordered — order changes, existing mappings intact
{
  const tracks = [
    { id: "jio_A", title: "A", spotifyId: "sp_A", sourceEntryId: "sp_sp_A#0", isSpotifyTrack: true },
    { id: "jio_B", title: "B", spotifyId: "sp_B", sourceEntryId: "sp_sp_B#0", isSpotifyTrack: true },
    { id: "jio_C", title: "C", spotifyId: "sp_C", sourceEntryId: "sp_sp_C#0", isSpotifyTrack: true },
  ];
  const snapshot = [
    { sourceEntryId: "sp_sp_A#0", fingerprint: "sp_sp_A", spotifyId: "sp_A", jioTrackId: "jio_A" },
    { sourceEntryId: "sp_sp_B#0", fingerprint: "sp_sp_B", spotifyId: "sp_B", jioTrackId: "jio_B" },
    { sourceEntryId: "sp_sp_C#0", fingerprint: "sp_sp_C", spotifyId: "sp_C", jioTrackId: "jio_C" },
  ];
  // Reorder to B, C, A
  const currentSpotify = [
    { spotifyId: "sp_B", name: "B" },
    { spotifyId: "sp_C", name: "C" },
    { spotifyId: "sp_A", name: "A" },
  ];

  const diff = diffSpotifyPlaylist(snapshot, currentSpotify, tracks);
  assert(diff.summary.addedCount === 0 && diff.summary.removedCount === 0, "Scenario 5: 0 adds, 0 removes");
  assert(diff.summary.reorderedCount > 0, "Scenario 5: Reordering detected");

  const res = applySyncPlan({ diff });
  assert(res.updatedTracks[0].id === "jio_B", "Scenario 5: First is B");
  assert(res.updatedTracks[1].id === "jio_C", "Scenario 5: Second is C");
  assert(res.updatedTracks[2].id === "jio_A", "Scenario 5: Third is A");
}

// 6. Duplicate tracks — only correct occurrence added or removed
{
  const tracks = [
    { id: "jio_dup", title: "Dup", spotifyId: "sp_dup", sourceEntryId: "sp_sp_dup#0", isSpotifyTrack: true },
    { id: "jio_mid", title: "Mid", spotifyId: "sp_mid", sourceEntryId: "sp_sp_mid#0", isSpotifyTrack: true },
    { id: "jio_dup", title: "Dup", spotifyId: "sp_dup", sourceEntryId: "sp_sp_dup#1", isSpotifyTrack: true },
  ];
  const snapshot = [
    { sourceEntryId: "sp_sp_dup#0", fingerprint: "sp_sp_dup", spotifyId: "sp_dup", jioTrackId: "jio_dup" },
    { sourceEntryId: "sp_sp_mid#0", fingerprint: "sp_sp_mid", spotifyId: "sp_mid", jioTrackId: "jio_mid" },
    { sourceEntryId: "sp_sp_dup#1", fingerprint: "sp_sp_dup", spotifyId: "sp_dup", jioTrackId: "jio_dup" },
  ];
  // Remove first duplicate
  const currentSpotify = [
    { spotifyId: "sp_mid", name: "Mid" },
    { spotifyId: "sp_dup", name: "Dup" },
  ];

  const diff = diffSpotifyPlaylist(snapshot, currentSpotify, tracks);
  assert(diff.summary.removedCount === 1, "Scenario 6: Exactly 1 removed");
  assert(diff.removed[0].sourceEntryId === "sp_sp_dup#0", "Scenario 6: First occurrence removed");

  const res = applySyncPlan({ diff });
  assert(res.updatedTracks.length === 2, "Scenario 6: 2 tracks remain");
  assert(res.updatedTracks[0].id === "jio_mid", "Scenario 6: Mid is first");
  assert(res.updatedTracks[1].id === "jio_dup", "Scenario 6: Dup is second");
}

// 7. Playlist contains manual Ceepeefy-only entries — not accidentally deleted
{
  const tracks = [
    { id: "jio_1", title: "Track 1", spotifyId: "sp_1", sourceEntryId: "sp_sp_1#0", isSpotifyTrack: true },
    { id: "manual_custom_song", title: "Manual Song", isManual: true },
  ];
  const snapshot = [
    { sourceEntryId: "sp_sp_1#0", fingerprint: "sp_sp_1", spotifyId: "sp_1", jioTrackId: "jio_1" },
  ];
  const currentSpotify = [
    { spotifyId: "sp_1", name: "Track 1" },
  ];

  const diff = diffSpotifyPlaylist(snapshot, currentSpotify, tracks);
  assert(diff.summary.manualTracksCount === 1, "Scenario 7: Manual track detected");
  const res = applySyncPlan({ diff });
  assert(res.updatedTracks.length === 2, "Scenario 7: Both tracks retained");
  assert(res.updatedTracks.some((t) => t.id === "manual_custom_song"), "Scenario 7: Manual track preserved");
}

console.log("🌟 ALL 7 INTEGRATION SCENARIOS PASSED WITH 100% SUCCESS!");
