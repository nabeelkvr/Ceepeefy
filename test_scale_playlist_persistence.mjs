import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  getUserPlaylists,
  saveUserPlaylist,
  syncUserPlaylists,
  deleteUserPlaylist,
} from "./src/server/playlistStorage.js";

const SCALE_USER_A = "scale_test_user_a";
const SCALE_USER_B = "scale_test_user_b";
const DATA_DIR = path.join(process.cwd(), "src", "server", "data");

function cleanupScaleUser(userId) {
  const filePath = path.join(DATA_DIR, `playlists_${userId}.json`);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
}

describe("Scale & No-Artificial-Limits Verification Suite", () => {
  before(() => {
    cleanupScaleUser(SCALE_USER_A);
    cleanupScaleUser(SCALE_USER_B);
  });

  after(() => {
    cleanupScaleUser(SCALE_USER_A);
    cleanupScaleUser(SCALE_USER_B);
  });

  it("1. Persists 1,000+ playlists without arbitrary count limits or truncation", () => {
    // Generate 1,000 distinct playlists
    const playlistBatch = [];
    const TOTAL_PLAYLISTS = 1000;

    for (let i = 1; i <= TOTAL_PLAYLISTS; i++) {
      playlistBatch.push({
        id: `pl_scale_${i}`,
        title: `Scale Playlist #${i}`,
        category: i % 2 === 0 ? "Rock" : "Malayalam",
        tracks: [
          { id: `trk_${i}_1`, title: `Song A for ${i}`, artist: "Artist A" },
          { id: `trk_${i}_2`, title: `Song B for ${i}`, artist: "Artist B" },
        ],
      });
    }

    // Sync in batches of 100 to simulate realistic network streaming
    const BATCH_SIZE = 100;
    for (let i = 0; i < playlistBatch.length; i += BATCH_SIZE) {
      const chunk = playlistBatch.slice(i, i + BATCH_SIZE);
      const res = syncUserPlaylists(SCALE_USER_A, chunk);
      assert.ok(res.success, `Sync batch at offset ${i} must succeed`);
    }

    // Retrieve all playlists from the backend
    const storedPlaylists = getUserPlaylists(SCALE_USER_A);
    assert.equal(
      storedPlaylists.length,
      TOTAL_PLAYLISTS,
      `All ${TOTAL_PLAYLISTS} playlists must be saved and retrieved without being capped at 1,000`
    );

    // Verify first, middle, and last playlist integrity
    const first = storedPlaylists.find((p) => p.id === "pl_scale_1");
    const mid = storedPlaylists.find((p) => p.id === "pl_scale_500");
    const last = storedPlaylists.find((p) => p.id === "pl_scale_1000");

    assert.ok(first, "First playlist must exist");
    assert.ok(mid, "500th playlist must exist");
    assert.ok(last, "1,000th playlist must exist");
    assert.equal(first.title, "Scale Playlist #1");
    assert.equal(last.title, "Scale Playlist #1000");
  });

  it("2. Imports, saves, and completely retrieves a single playlist with 1,000 songs", () => {
    const TOTAL_TRACKS = 1000;
    const thousandTracks = [];

    for (let i = 1; i <= TOTAL_TRACKS; i++) {
      thousandTracks.push({
        id: `scale_track_${i}`,
        title: `Massive Track #${i}`,
        artist: `Artist ${(i % 50) + 1}`,
        durationFormatted: "3:45",
        album: "Mega Album",
      });
    }

    const largePlaylist = {
      id: "pl_thousand_songs",
      title: "1,000 Songs Master Playlist",
      category: "English",
      tracks: thousandTracks,
      badge: "CUSTOM",
    };

    saveUserPlaylist(SCALE_USER_A, largePlaylist);

    // Read back from backend store
    const retrieved = getUserPlaylists(SCALE_USER_A).find((p) => p.id === "pl_thousand_songs");
    assert.ok(retrieved, "1,000-song playlist must be found in backend store");
    assert.equal(
      retrieved.tracks.length,
      TOTAL_TRACKS,
      `All ${TOTAL_TRACKS} tracks must be preserved without slicing or truncation`
    );
    assert.equal(retrieved.songsCount, TOTAL_TRACKS);

    // Verify order preservation from track 1 to 1,000
    assert.equal(retrieved.tracks[0].id, "scale_track_1");
    assert.equal(retrieved.tracks[499].id, "scale_track_500");
    assert.equal(retrieved.tracks[999].id, "scale_track_1000");
  });

  it("3. Repeated imports and syncs avoid duplicate playlists and tracks", () => {
    const spotifyPlaylist = {
      id: "pl_spotify_sync_test",
      spotifyId: "37i9dQZF1DXcBWIGoYBM5M",
      title: "Today's Top Hits",
      category: "Pop",
      badge: "SPOTIFY",
      tracks: [
        { id: "sp_t1", title: "Hit Song 1", artist: "Pop Star" },
        { id: "sp_t1", title: "Hit Song 1", artist: "Pop Star" }, // duplicate track in raw data
        { id: "sp_t2", title: "Hit Song 2", artist: "Pop Star" },
      ],
    };

    // First import
    saveUserPlaylist(SCALE_USER_A, spotifyPlaylist);
    let pl = getUserPlaylists(SCALE_USER_A).find((p) => p.id === "pl_spotify_sync_test");
    assert.equal(pl.tracks.length, 2, "Duplicate track within the same playlist must be deduplicated");

    // Re-importing the same playlist must update it in-place without creating a duplicate playlist
    const updatedImport = {
      ...spotifyPlaylist,
      title: "Today's Top Hits (Updated)",
      tracks: [
        { id: "sp_t1", title: "Hit Song 1", artist: "Pop Star" },
        { id: "sp_t2", title: "Hit Song 2", artist: "Pop Star" },
        { id: "sp_t3", title: "Hit Song 3", artist: "Pop Star" },
      ],
    };

    saveUserPlaylist(SCALE_USER_A, updatedImport);

    const matches = getUserPlaylists(SCALE_USER_A).filter((p) => p.id === "pl_spotify_sync_test");
    assert.equal(matches.length, 1, "Repeated import must NOT create duplicate playlists");
    assert.equal(matches[0].title, "Today's Top Hits (Updated)");
    assert.equal(matches[0].tracks.length, 3, "New tracks must be integrated cleanly");
  });

  it("4. Data remains intact across logout/login and simulated page reload", () => {
    // Simulated Logout: client state is discarded; backend file remains unchanged
    // Simulated Login on Computer 2 / New Browser Session:
    const freshSessionPlaylists = getUserPlaylists(SCALE_USER_A);

    assert.ok(freshSessionPlaylists.length >= 1001, "All 1,000+ playlists persist across sessions");
    const thousandPl = freshSessionPlaylists.find((p) => p.id === "pl_thousand_songs");
    assert.ok(thousandPl);
    assert.equal(thousandPl.tracks.length, 1000, "1,000 tracks persist after session reset");
  });

  it("5. Multi-device protection: partial device data does NOT overwrite complete backend collection", () => {
    // Device A previously saved 1,000 tracks for 'pl_thousand_songs'
    const backendBefore = getUserPlaylists(SCALE_USER_A).find((p) => p.id === "pl_thousand_songs");
    assert.equal(backendBefore.tracks.length, 1000);

    // Device B comes online with an older/partial cache of only 3 tracks for that playlist
    const partialClientBatch = [
      {
        id: "pl_thousand_songs",
        title: "1,000 Songs Master Playlist",
        category: "English",
        tracks: [
          { id: "scale_track_1", title: "Massive Track #1", artist: "Artist 1" },
          { id: "scale_track_2", title: "Massive Track #2", artist: "Artist 2" },
          { id: "scale_track_3", title: "Massive Track #3", artist: "Artist 3" },
        ],
        updated_at: new Date().toISOString(), // Even if device B sends a recent timestamp
      },
    ];

    // Device B synchronizes with backend
    syncUserPlaylists(SCALE_USER_A, partialClientBatch);

    // Check backend: complete 1,000 tracks collection MUST be preserved!
    const backendAfter = getUserPlaylists(SCALE_USER_A).find((p) => p.id === "pl_thousand_songs");
    assert.equal(
      backendAfter.tracks.length,
      1000,
      "Partial collection from another device must NOT overwrite the complete 1,000-track collection"
    );
  });

  it("6. Strict account isolation: User B cannot access User A's 1,000 playlists", () => {
    const userBPlaylists = getUserPlaylists(SCALE_USER_B);
    assert.equal(userBPlaylists.length, 0, "User B starts with 0 playlists");

    saveUserPlaylist(SCALE_USER_B, {
      id: "pl_user_b_exclusive",
      title: "User B Private Playlist",
      category: "Rock",
      tracks: [{ id: "b_trk_1", title: "Private Rock" }],
    });

    const userBAfter = getUserPlaylists(SCALE_USER_B);
    assert.equal(userBAfter.length, 1);
    assert.equal(userBAfter[0].id, "pl_user_b_exclusive");

    // Verify User A still has all their playlists and does not have User B's playlist
    const userAAfter = getUserPlaylists(SCALE_USER_A);
    assert.ok(userAAfter.length >= 1001);
    assert.ok(!userAAfter.some((p) => p.id === "pl_user_b_exclusive"));
  });
});
