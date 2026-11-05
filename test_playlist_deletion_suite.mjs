import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("CEEPEEFY: Playlist Deletion & Integrity Test Suite", () => {
  // Test fixture setup with simulated Supabase DB
  const createMockDb = () => {
    const authUsers = [
      { id: "9f0b5d5e-d250-4fd1-b580-0ea5cbbec758", email: "nabeelek3603@gmail.com" },
      { id: "stranger-user-uuid-1111", email: "stranger@example.com" },
    ];

    const userPlaylists = [
      {
        id: "playlist-custom-1793791009781",
        title: "Sad songs malayalam 🥀💔",
        user_id: "nabeeyl",
        auth_user_id: "9f0b5d5e-d250-4fd1-b580-0ea5cbbec758",
        kind: "user",
      },
      {
        id: "playlist-custom-1793802294021",
        title: "Trending Now Malayalam",
        user_id: "nabeeyl",
        auth_user_id: "9f0b5d5e-d250-4fd1-b580-0ea5cbbec758",
        kind: "user",
      },
      {
        id: "playlist-to-delete-123456",
        title: "Temporary Chill Mix",
        user_id: "nabeeyl",
        auth_user_id: "9f0b5d5e-d250-4fd1-b580-0ea5cbbec758",
        kind: "user",
      },
      {
        id: "stranger-private-playlist",
        title: "Stranger Jam",
        user_id: "stranger-user-uuid-1111",
        auth_user_id: "stranger-user-uuid-1111",
        kind: "user",
      },
    ];

    const playlistTracks = [
      // 61 tracks for Sad songs malayalam
      ...Array.from({ length: 61 }, (_, i) => ({
        id: `sad_${i}`,
        playlist_id: "playlist-custom-1793791009781",
        track_id: `sad_trk_${i}`,
        title: `Sad Song ${i + 1}`,
      })),
      // 50 tracks for Trending Now Malayalam
      ...Array.from({ length: 50 }, (_, i) => ({
        id: `trending_${i}`,
        playlist_id: "playlist-custom-1793802294021",
        track_id: `trend_trk_${i}`,
        title: `Trending Song ${i + 1}`,
      })),
      // 5 tracks for Temporary Chill Mix (target to delete)
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `temp_${i}`,
        playlist_id: "playlist-to-delete-123456",
        track_id: `temp_trk_${i}`,
        title: `Temp Song ${i + 1}`,
      })),
      // 3 tracks for Stranger Jam
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `stranger_${i}`,
        playlist_id: "stranger-private-playlist",
        track_id: `stranger_trk_${i}`,
        title: `Stranger Song ${i + 1}`,
      })),
    ];

    return { authUsers, userPlaylists, playlistTracks };
  };

  // Simulates DELETE /api/playlists server handler logic
  const executeDeletePlaylistApi = (db, callerUser, playlistId, simulateDbFailure = false) => {
    if (!callerUser || !callerUser.id) {
      return { status: 401, body: { success: false, error: "Unauthorized." } };
    }
    if (!playlistId) {
      return { status: 400, body: { success: false, error: "Playlist ID is required." } };
    }

    const target = db.userPlaylists.find((p) => p.id === playlistId);
    if (!target) {
      return { status: 404, body: { success: false, error: "Playlist not found." } };
    }

    // Ownership verification
    const isUuidOwner = target.auth_user_id && target.auth_user_id === callerUser.id;
    const isLegacyOwner =
      (!target.auth_user_id || target.auth_user_id === callerUser.id) &&
      callerUser.email === "nabeelek3603@gmail.com" &&
      (target.user_id === "nabeeyl" || target.user_id === callerUser.id);

    if (!isUuidOwner && !isLegacyOwner) {
      return {
        status: 403,
        body: { success: false, error: "Forbidden: You cannot delete another user's playlist." },
      };
    }

    if (simulateDbFailure) {
      return {
        status: 500,
        body: { success: false, error: "Database transaction failure: simulated disk/network error." },
      };
    }

    // 1. Delete parent playlist from user_playlists with returning id
    const targetIdx = db.userPlaylists.findIndex((p) => p.id === playlistId);
    if (targetIdx === -1) {
      return { status: 404, body: { success: false, error: "Playlist not found or already deleted." } };
    }
    const [deletedRow] = db.userPlaylists.splice(targetIdx, 1);

    // 2. PostgreSQL foreign-key ON DELETE CASCADE automatically cascades to playlist_tracks
    const initialTrackCount = db.playlistTracks.length;
    db.playlistTracks = db.playlistTracks.filter((t) => t.playlist_id !== playlistId);
    const cascadedTrackCount = initialTrackCount - db.playlistTracks.length;

    return {
      status: 200,
      body: { success: true, deletedId: deletedRow.id, cascadedTrackCount },
    };
  };

  // Simulates client GET /api/playlists on refresh
  const executeGetPlaylistsApi = (db, callerUser) => {
    const isOwnerNabeeyl = callerUser.email === "nabeelek3603@gmail.com";
    return db.userPlaylists.filter((p) => {
      if (isOwnerNabeeyl) {
        return (
          p.auth_user_id === callerUser.id ||
          p.user_id === callerUser.id ||
          p.user_id === "nabeeyl"
        );
      }
      return p.auth_user_id === callerUser.id || p.user_id === callerUser.id;
    });
  };

  // --------------------------------------------------------------------------
  // TEST 1: Delete playlist containing multiple songs
  // --------------------------------------------------------------------------
  it("1. Delete playlist: deletes associated tracks and parent playlist record", () => {
    const db = createMockDb();
    const owner = db.authUsers[0];
    const targetId = "playlist-to-delete-123456";

    // Verify pre-conditions
    assert.ok(db.userPlaylists.some((p) => p.id === targetId), "Target playlist must exist before delete");
    assert.equal(
      db.playlistTracks.filter((t) => t.playlist_id === targetId).length,
      5,
      "Target playlist must have 5 tracks before delete"
    );

    // Execute deletion
    const res = executeDeletePlaylistApi(db, owner, targetId);
    assert.equal(res.status, 200, "API must return HTTP 200 on successful deletion");
    assert.equal(res.body.success, true);
    assert.equal(res.body.deletedId, targetId);
    assert.equal(res.body.cascadedTrackCount, 5);

    // 2. Verify row no longer exists in user_playlists
    assert.equal(
      db.userPlaylists.some((p) => p.id === targetId),
      false,
      "Target playlist row must be completely removed from user_playlists"
    );

    // 3. Verify zero associated rows remain in playlist_tracks
    assert.equal(
      db.playlistTracks.filter((t) => t.playlist_id === targetId).length,
      0,
      "Zero associated tracks must remain in playlist_tracks"
    );
  });

  // --------------------------------------------------------------------------
  // TEST 2: Refresh application: confirm playlist does NOT reappear
  // --------------------------------------------------------------------------
  it("2. Refresh application: deleted playlist never reappears", () => {
    const db = createMockDb();
    const owner = db.authUsers[0];
    const targetId = "playlist-to-delete-123456";

    // Delete
    executeDeletePlaylistApi(db, owner, targetId);

    // Client refreshes: triggers GET /api/playlists
    const freshPlaylists = executeGetPlaylistsApi(db, owner);
    assert.equal(
      freshPlaylists.some((p) => p.id === targetId),
      false,
      "Deleted playlist must not be returned on page refresh / subsequent GET"
    );
    assert.equal(freshPlaylists.length, 2, "Only non-deleted playlists remain for owner");
  });

  // --------------------------------------------------------------------------
  // TEST 3: Confirm other playlists and their songs remain 100% untouched
  // --------------------------------------------------------------------------
  it("3. Untouched scope: other playlists and songs remain strictly intact", () => {
    const db = createMockDb();
    const owner = db.authUsers[0];
    const targetId = "playlist-to-delete-123456";

    // Delete target
    executeDeletePlaylistApi(db, owner, targetId);

    // Sad songs malayalam must still have 61 tracks
    const sadTracks = db.playlistTracks.filter((t) => t.playlist_id === "playlist-custom-1793791009781");
    assert.equal(sadTracks.length, 61, "Sad songs malayalam must still have all 61 tracks intact");

    // Trending Now Malayalam must still have 50 tracks
    const trendingTracks = db.playlistTracks.filter((t) => t.playlist_id === "playlist-custom-1793802294021");
    assert.equal(trendingTracks.length, 50, "Trending Now Malayalam must still have all 50 tracks intact");

    // Stranger's playlist must still have 3 tracks
    const strangerTracks = db.playlistTracks.filter((t) => t.playlist_id === "stranger-private-playlist");
    assert.equal(strangerTracks.length, 3, "Stranger playlist tracks must remain untouched");
  });

  // --------------------------------------------------------------------------
  // TEST 4: Error handling: failed deletion preserves playlist in UI
  // --------------------------------------------------------------------------
  it("4. Error handling: failed database deletion preserves playlist in UI and reports error", () => {
    const db = createMockDb();
    const owner = db.authUsers[0];
    const targetId = "playlist-to-delete-123456";

    // Client UI state
    let clientCustomPlaylists = [...db.userPlaylists];
    let clientErrorMessage = null;

    // Simulate delete attempt when database encounters an error
    const res = executeDeletePlaylistApi(db, owner, targetId, true);
    assert.equal(res.status, 500, "Database error returns 500");
    assert.equal(res.body.success, false);

    // Client UI handling: checks res.body.success before mutating state
    if (!res.body.success) {
      clientErrorMessage = res.body.error;
    } else {
      clientCustomPlaylists = clientCustomPlaylists.filter((p) => p.id !== targetId);
    }

    assert.ok(clientErrorMessage, "UI must capture and display the error message");
    assert.equal(
      clientCustomPlaylists.some((p) => p.id === targetId),
      true,
      "UI MUST preserve the playlist in state when database deletion fails"
    );
    assert.equal(
      db.userPlaylists.some((p) => p.id === targetId),
      true,
      "Database must preserve playlist row on failed transaction"
    );
  });

  // --------------------------------------------------------------------------
  // TEST 5: Security: unauthorized user cannot delete another user's playlist
  // --------------------------------------------------------------------------
  it("5. Security: stranger cannot delete another user's playlist", () => {
    const db = createMockDb();
    const stranger = db.authUsers[1];
    const victimPlaylistId = "playlist-custom-1793791009781"; // Sad songs malayalam

    const res = executeDeletePlaylistApi(db, stranger, victimPlaylistId);
    assert.equal(res.status, 403, "Must return HTTP 403 Forbidden");
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /Forbidden/);

    // Verify nothing was deleted
    assert.ok(
      db.userPlaylists.some((p) => p.id === victimPlaylistId),
      "Victim playlist must remain in user_playlists"
    );
    assert.equal(
      db.playlistTracks.filter((t) => t.playlist_id === victimPlaylistId).length,
      61,
      "Victim tracks must remain completely intact in playlist_tracks"
    );
  });
});

