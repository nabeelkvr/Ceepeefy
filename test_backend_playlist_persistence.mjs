import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  getUserPlaylists,
  saveUserPlaylist,
  deleteUserPlaylist,
  syncUserPlaylists,
  getDeletedPlaylistIds,
} from "./src/server/playlistStorage.js";

describe("Backend Playlist Persistence & Cross-Device Sync Verification", () => {
  const TEST_USER_1 = "test_user_persistence_1";
  const TEST_USER_2 = "test_user_persistence_2";
  const DATA_DIR = path.join(process.cwd(), "src", "server", "data");

  const cleanTestFiles = () => {
    try {
      const file1 = path.join(DATA_DIR, `playlists_${TEST_USER_1}.json`);
      const file2 = path.join(DATA_DIR, `playlists_${TEST_USER_2}.json`);
      if (fs.existsSync(file1)) fs.unlinkSync(file1);
      if (fs.existsSync(file2)) fs.unlinkSync(file2);
    } catch {}
  };

  before(cleanTestFiles);
  after(cleanTestFiles);

  it("1. Saves manually created playlists to backend with full metadata and owner relationship", () => {
    const playlist = {
      id: "pl_manual_001",
      title: "Late Night Coding",
      description: "Atmospheric electronic beats",
      coverUrl: "https://example.com/cover1.jpg",
      category: "Chill",
      curator: "You",
      fidelity: "Personal Playlist • Hi-Res Lossless",
      spec: "24-Bit • 192kHz",
      badge: "CUSTOM",
      badgeVariant: "purple",
      tracks: [
        { id: "t1", title: "Resonance", artist: "HOME", duration: 212 },
        { id: "t2", title: "Memory Reboot", artist: "VØJ", duration: 180 },
      ],
    };

    const saved = saveUserPlaylist(TEST_USER_1, playlist);
    assert.equal(saved.id, "pl_manual_001");
    assert.equal(saved.user_id, TEST_USER_1);
    assert.equal(saved.category, "Chill");
    assert.equal(saved.tracks.length, 2);
    assert.equal(saved.songsCount, 2);
    assert.ok(saved.created_at);
    assert.ok(saved.updated_at);

    // Verify backend retrieval simulates logging in from Computer B
    const retrieved = getUserPlaylists(TEST_USER_1);
    assert.equal(retrieved.length, 1);
    assert.equal(retrieved[0].title, "Late Night Coding");
    assert.equal(retrieved[0].category, "Chill");
    assert.equal(retrieved[0].tracks[0].title, "Resonance");
    assert.equal(retrieved[0].tracks[1].title, "Memory Reboot");
  });

  it("2. Saves Spotify-imported playlists with Spotify playlist ID, track order, and metadata", () => {
    const spotifyPlaylist = {
      id: "pl_spotify_import_002",
      title: "Today's Top Hits",
      description: "Imported from Spotify",
      coverUrl: "https://i.scdn.co/image/ab67706f00000002b55d607db",
      category: "Mixed",
      source: "spotify_import",
      spotifyId: "37i9dQZF1DXcBWIGoYBM5M",
      spotifyUrl: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      sourceMeta: {
        spotifyId: "37i9dQZF1DXcBWIGoYBM5M",
        spotifyUrl: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
        syncedSnapshot: [
          { sourceEntryId: "sp_1", spotifyId: "sp_1", status: "matched" },
          { sourceEntryId: "sp_2", spotifyId: "sp_2", status: "matched" },
        ],
      },
      tracks: [
        { id: "sp_trk_1", title: "Espresso", artist: "Sabrina Carpenter", duration: 175, spotifyId: "sp_1" },
        { id: "sp_trk_2", title: "Birds of a Feather", artist: "Billie Eilish", duration: 198, spotifyId: "sp_2" },
      ],
    };

    const saved = saveUserPlaylist(TEST_USER_1, spotifyPlaylist);
    assert.equal(saved.id, "pl_spotify_import_002");
    assert.equal(saved.source, "spotify_import");
    assert.equal(saved.spotifyId, "37i9dQZF1DXcBWIGoYBM5M");
    assert.equal(saved.badge, "SPOTIFY");
    assert.equal(saved.badgeVariant, "emerald");
    assert.equal(saved.tracks.length, 2);
    assert.equal(saved.tracks[0].title, "Espresso");
    assert.equal(saved.tracks[1].title, "Birds of a Feather");

    // Re-read from disk to simulate another device
    const onAnotherComputer = getUserPlaylists(TEST_USER_1);
    const foundSpotify = onAnotherComputer.find((p) => p.id === "pl_spotify_import_002");
    assert.ok(foundSpotify);
    assert.equal(foundSpotify.spotifyId, "37i9dQZF1DXcBWIGoYBM5M");
    assert.equal(foundSpotify.sourceMeta.syncedSnapshot.length, 2);
  });

  it("3. Enforces strict account isolation: User 1 playlists are not visible to User 2", () => {
    const user2Playlists = getUserPlaylists(TEST_USER_2);
    assert.equal(user2Playlists.length, 0, "User 2 should have no playlists initially");

    // Add a playlist for User 2
    saveUserPlaylist(TEST_USER_2, {
      id: "pl_user2_001",
      title: "User 2 Beats",
      category: "Tamil",
      tracks: [],
    });

    const user1List = getUserPlaylists(TEST_USER_1);
    const user2List = getUserPlaylists(TEST_USER_2);

    assert.equal(user1List.length, 2);
    assert.equal(user2List.length, 1);
    assert.ok(!user2List.some((p) => p.id === "pl_manual_001"));
    assert.ok(!user1List.some((p) => p.id === "pl_user2_001"));
  });

  it("4. Edits to playlists persist accurately (rename, reorder, category change, add/remove tracks)", () => {
    // 4.1: Rename and category change
    const existing = getUserPlaylists(TEST_USER_1).find((p) => p.id === "pl_manual_001");
    const updated = {
      ...existing,
      title: "Focus & Flow (Renamed)",
      category: "Focus",
    };
    saveUserPlaylist(TEST_USER_1, updated);

    let current = getUserPlaylists(TEST_USER_1).find((p) => p.id === "pl_manual_001");
    assert.equal(current.title, "Focus & Flow (Renamed)");
    assert.equal(current.category, "Focus");

    // 4.2: Add track
    const withNewTrack = {
      ...current,
      tracks: [
        ...current.tracks,
        { id: "t3", title: "Midnight City", artist: "M83", duration: 243 },
      ],
    };
    saveUserPlaylist(TEST_USER_1, withNewTrack);

    current = getUserPlaylists(TEST_USER_1).find((p) => p.id === "pl_manual_001");
    assert.equal(current.tracks.length, 3);
    assert.equal(current.tracks[2].title, "Midnight City");

    // 4.3: Reorder tracks (move t3 to first position)
    const reorderedTracks = [current.tracks[2], current.tracks[0], current.tracks[1]];
    saveUserPlaylist(TEST_USER_1, { ...current, tracks: reorderedTracks });

    current = getUserPlaylists(TEST_USER_1).find((p) => p.id === "pl_manual_001");
    assert.equal(current.tracks[0].id, "t3");
    assert.equal(current.tracks[1].id, "t1");
    assert.equal(current.tracks[2].id, "t2");

    // 4.4: Remove track (remove t1)
    const removedTracks = current.tracks.filter((t) => t.id !== "t1");
    saveUserPlaylist(TEST_USER_1, { ...current, tracks: removedTracks });

    current = getUserPlaylists(TEST_USER_1).find((p) => p.id === "pl_manual_001");
    assert.equal(current.tracks.length, 2);
    assert.ok(!current.tracks.some((t) => t.id === "t1"));
  });

  it("5. Deletes playlists and prevents resurrection via deletedPlaylistIds tracking", () => {
    const deleted = deleteUserPlaylist(TEST_USER_1, "pl_manual_001");
    assert.equal(deleted, true);

    const remaining = getUserPlaylists(TEST_USER_1);
    assert.ok(!remaining.some((p) => p.id === "pl_manual_001"));

    const deletedIds = getDeletedPlaylistIds(TEST_USER_1);
    assert.ok(deletedIds.includes("pl_manual_001"));

    // Attempting to sync stale client data containing the deleted playlist should NOT resurrect it
    const staleClientPlaylists = [
      { id: "pl_manual_001", title: "Resurrect Attempt", tracks: [] },
      { id: "pl_new_device_003", title: "Device 2 Playlist", tracks: [] },
    ];

    const syncResult = syncUserPlaylists(TEST_USER_1, staleClientPlaylists);
    assert.ok(!syncResult.playlists.some((p) => p.id === "pl_manual_001"), "Deleted playlist must not resurrect");
    assert.ok(syncResult.playlists.some((p) => p.id === "pl_new_device_003"), "Legitimate new playlist is preserved");
  });

  it("6. Avoids duplicate playlists and duplicate tracks during sync / migration", () => {
    const clientBatch = [
      {
        id: "pl_dup_test",
        title: "Deduplication Test",
        category: "Malayalam",
        tracks: [
          { id: "song_1", title: "Illuminati", artist: "Sushin Shyam" },
          { id: "song_1", title: "Illuminati", artist: "Sushin Shyam" }, // duplicate track
          { id: "song_2", title: "Aavesham", artist: "Jithin Raj" },
        ],
      },
    ];

    syncUserPlaylists(TEST_USER_1, clientBatch);

    const pl = getUserPlaylists(TEST_USER_1).find((p) => p.id === "pl_dup_test");
    assert.ok(pl);
    // Duplicate track should be removed, leaving exactly 2 unique tracks
    assert.equal(pl.tracks.length, 2, "Duplicate tracks must be filtered out during sync");
    assert.equal(pl.tracks[0].id, "song_1");
    assert.equal(pl.tracks[1].id, "song_2");

    // Syncing the same batch again should NOT create duplicate playlists
    syncUserPlaylists(TEST_USER_1, clientBatch);
    const matchingPls = getUserPlaylists(TEST_USER_1).filter((p) => p.id === "pl_dup_test");
    assert.equal(matchingPls.length, 1, "Duplicate playlists must not be created");
  });

  it("7. Last-Write-Wins: Does not overwrite newer backend data with stale client data", () => {
    // 1. Backend has an updated playlist at T2
    const now = Date.now();
    const t2 = new Date(now).toISOString();
    const t1 = new Date(now - 100000).toISOString(); // Stale

    saveUserPlaylist(TEST_USER_1, {
      id: "pl_timestamp_test",
      title: "Newer Backend Title",
      category: "Phonks",
      updated_at: t2,
      tracks: [{ id: "t_new", title: "New Track" }],
    });

    // 2. Client syncs with an older timestamp T1
    const staleClient = [
      {
        id: "pl_timestamp_test",
        title: "Stale Local Title That Should Not Overwrite",
        category: "Mixed",
        updated_at: t1,
        tracks: [{ id: "t_stale", title: "Stale Track" }],
      },
    ];

    syncUserPlaylists(TEST_USER_1, staleClient);

    const result = getUserPlaylists(TEST_USER_1).find((p) => p.id === "pl_timestamp_test");
    assert.equal(result.title, "Newer Backend Title", "Newer backend title must be preserved");
    assert.equal(result.category, "Phonks", "Newer backend category must be preserved");
    assert.equal(result.tracks[0].id, "t_new", "Newer backend tracks must be preserved");
  });
});
