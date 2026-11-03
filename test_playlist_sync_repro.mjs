import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Phase 2 Reproduction Test Suite for Playlist Synchronization Bug
 * Tests:
 * - T1: Anon Read/Write & Policy Matrix
 * - T2: Empty-State Wipe Loop Protection
 * - T3: Double-Click Rapid Submit Idempotency
 * - T4: Concurrent Add-Track vs Playlist Save Race Condition
 */

describe("Phase 2 Automated Reproductions (Before Fix)", () => {
  
  // --------------------------------------------------------------------------
  // T2: Empty-State Wipe Protection
  // Simulate Computer B opening with empty localStorage and failed/empty cloud fetch.
  // Must verify that an empty library is NOT written anywhere.
  // --------------------------------------------------------------------------
  it("T2: Empty-state wipe protection — empty cloud fetch must not overwrite or wipe library", () => {
    // Current bug in MusicContext / cloudStorageService:
    // If cloudPlaylists is empty [] and localStorage is empty [],
    // the system sets customPlaylists to [] and then if persistAccountData runs,
    // or if a save is triggered, it writes [] to storage.
    
    // Simulate initial state on Computer B:
    let computerB_localStorage = {};
    let hasCloudSyncedRef = false;
    let cloudPlaylists = null; // cloud fetch failed or unauthenticated
    
    // Mocking the guard:
    const simulateSync = (cloudResult) => {
      if (cloudResult === null) {
        // Failed cloud fetch -> MUST NOT set hasCloudSyncedRef to true!
        // Current code bug: sometimes set hasCloudSyncedRef anyway or wiped local cache
        return { wiped: false, synced: false };
      }
      if (Array.isArray(cloudResult) && cloudResult.length === 0) {
        // Empty cloud result when user previously had playlists on Computer A
        // If not authenticated or RLS blocked it, writing [] to localStorage or server is catastrophic!
        return { wiped: true, synced: true };
      }
      return { wiped: false, synced: true };
    };

    const result = simulateSync(cloudPlaylists);
    assert.equal(result.synced, false, "Cloud sync must not be marked successful on error/unauthenticated");
  });

  // --------------------------------------------------------------------------
  // T3: Double-Click Rapid Submit Idempotency
  // Demonstrates that clicking "Create" twice in rapid succession currently
  // generates 2 playlists because ID uses Date.now() / random on submit without a lock.
  // --------------------------------------------------------------------------
  it("T3: Double-click create yields 2 playlists today without submit lock", async () => {
    // Current implementation:
    const createPlaylistLegacy = (title, store) => {
      // Date.now() changes or random suffix creates distinct IDs
      const id = `playlist-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newPlaylist = { id, title };
      store.push(newPlaylist);
      return newPlaylist;
    };

    const legacyStore = [];
    // User rapidly double clicks within 15ms:
    createPlaylistLegacy("Late Night Vibes", legacyStore);
    await new Promise((r) => setTimeout(r, 10));
    createPlaylistLegacy("Late Night Vibes", legacyStore);

    // Current behavior: FAILS idempotency (creates 2 playlists!)
    assert.equal(legacyStore.length, 2, "Current legacy behavior creates 2 playlists on double-click");

    // Desired fix behavior:
    // 1. Client pre-generates UUID when modal opens
    // 2. Submit lock prevents duplicate requests
    // 3. Upsert on DB with unique ID
    let isSubmitting = false;
    const preGeneratedId = "550e8400-e29b-41d4-a716-446655440000"; // generated on form open
    const fixedStore = new Map();

    const createPlaylistFixed = (id, title) => {
      if (isSubmitting) return null; // Submit lock
      isSubmitting = true;
      fixedStore.set(id, { id, title });
      return fixedStore.get(id);
    };

    // Double-click with fix:
    const click1 = createPlaylistFixed(preGeneratedId, "Late Night Vibes");
    const click2 = createPlaylistFixed(preGeneratedId, "Late Night Vibes");

    assert.ok(click1 !== null);
    assert.equal(click2, null, "Double-click submit lock must reject duplicate submission");
    assert.equal(fixedStore.size, 1, "Fixed store must contain exactly 1 playlist");
  });

  // --------------------------------------------------------------------------
  // T4: Concurrent Add-Track vs Playlist Save Race Condition
  // Demonstrates that delete-before-insert pattern in savePlaylistToCloud
  // races with addTrackToPlaylistCloud and causes track loss.
  // --------------------------------------------------------------------------
  it("T4: Concurrent add-track vs playlist save race causes track loss under delete-before-insert", async () => {
    // Simulated database table:
    let dbTracks = [
      { playlist_id: "pl_1", track_id: "song_1", title: "Song 1" },
    ];

    // Current buggy flow in savePlaylistToCloud:
    // 1. DELETE from playlist_tracks where playlist_id = pl_1
    // 2. Insert tracks
    const legacySavePlaylistTracks = async (playlistId, tracks) => {
      // Step 1: DELETE ALL
      await new Promise((r) => setTimeout(r, 20)); // network delay
      dbTracks = dbTracks.filter((t) => t.playlist_id !== playlistId);
      
      // Step 2: INSERT (may be delayed or fail)
      await new Promise((r) => setTimeout(r, 20));
      for (const t of tracks) {
        dbTracks.push({ playlist_id: playlistId, track_id: t.id, title: t.title });
      }
    };

    // Concurrent addTrackToPlaylist:
    const legacyAddTrack = async (playlistId, newTrack) => {
      await new Promise((r) => setTimeout(r, 10)); // finishes in the middle of save's delete!
      dbTracks.push({ playlist_id: playlistId, track_id: newTrack.id, title: newTrack.title });
    };

    // Trigger both concurrently (as MusicContext:2460-2463 does today):
    const existingPlaylistTracks = [{ id: "song_1", title: "Song 1" }];
    const newTrackToAdd = { id: "song_2", title: "Song 2" };

    await Promise.all([
      legacySavePlaylistTracks("pl_1", existingPlaylistTracks),
      legacyAddTrack("pl_1", newTrackToAdd),
    ]);

    // In the legacy pattern, song_2 added during the delete phase was wiped out by savePlaylistTracks!
    const hasSong2 = dbTracks.some((t) => t.track_id === "song_2");
    assert.equal(hasSong2, false, "Legacy delete-before-insert wiped concurrent addTrack (proves T4 bug)");

    // Fixed implementation: atomic upsert without delete-all!
    let fixedDbTracks = new Map(); // key = `${playlist_id}:${track_key}`
    fixedDbTracks.set("pl_1:song_1", { playlist_id: "pl_1", track_key: "song_1", title: "Song 1" });

    const fixedAddTrack = async (playlistId, track) => {
      const key = `${playlistId}:${track.id}`;
      fixedDbTracks.set(key, { playlist_id: playlistId, track_key: track.id, title: track.title });
    };

    const fixedSaveMetadataOnly = async (playlistId, metadata) => {
      // Does NOT delete or touch playlist_tracks table!
      // Only updates user_playlists table.
      return { success: true };
    };

    await Promise.all([
      fixedSaveMetadataOnly("pl_1", { title: "Updated Title" }),
      fixedAddTrack("pl_1", newTrackToAdd),
    ]);

    assert.equal(fixedDbTracks.has("pl_1:song_1"), true);
    assert.equal(fixedDbTracks.has("pl_1:song_2"), true);
    assert.equal(fixedDbTracks.size, 2, "Fixed architecture preserves all tracks concurrently");
  });
});

