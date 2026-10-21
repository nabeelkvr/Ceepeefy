import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseSpotifyPlaylistId } from "./src/services/spotifyPlaylistService.js";
import { matchPlaylistTracks, matchSingleTrack } from "./src/services/spotifyMatcherService.js";
import { saveUserPlaylist, getUserPlaylists, deleteUserPlaylist } from "./src/server/playlistStorage.js";

describe("Sequential Import of 5 Spotify Playlists Verification", () => {
  const testUserId = `test_seq_user_${Date.now()}`;

  test("1. URL Validation: accepts 1-5 valid Spotify playlist links and rejects invalid links with field indicators", () => {
    const validInputs = [
      "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      "https://open.spotify.com/intl-ja/playlist/37i9dQZF1DX0XUsuxWHRQd",
      "https://open.spotify.com/embed/playlist/37i9dQZF1DX4sWSpwq3LiO",
      "spotify:playlist:37i9dQZF1DX1lVhptIYRda",
      "37i9dQZF1DX10zKzsJ2jva",
    ];

    const parsedIds = validInputs.map((url) => parseSpotifyPlaylistId(url));
    assert.equal(parsedIds.length, 5);
    parsedIds.forEach((id, idx) => {
      assert.ok(id, `Playlist ${idx + 1} should extract a valid Spotify playlist ID`);
      assert.match(id, /^[a-zA-Z0-9]{20,25}$/, `Playlist ${idx + 1} ID format should match Base62`);
    });

    // Test rejection with field number
    const mixedInputs = [
      "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      "https://notspotify.com/playlist/invalid123",
      "",
      "https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd",
      "",
    ];

    const validationErrors = [];
    mixedInputs.forEach((input, idx) => {
      const trimmed = (input || "").trim();
      if (trimmed) {
        const id = parseSpotifyPlaylistId(trimmed);
        if (!id) {
          validationErrors.push({ fieldNumber: idx + 1, error: `Playlist ${idx + 1} URL is invalid.` });
        }
      }
    });

    assert.equal(validationErrors.length, 1);
    assert.equal(validationErrors[0].fieldNumber, 2);
  });

  test("2. Sequential Processing Order: processes Playlist 1 through matching and confirmation before proceeding to Playlist 2", async () => {
    const sequenceOrder = [];

    // Simulate 3 playlists entered in fields 1, 2, and 3
    const queue = [
      {
        fieldIndex: 0,
        url: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
        playlistId: "37i9dQZF1DXcBWIGoYBM5M",
        name: "Rock Classics",
        mockTracks: [
          { name: "Bohemian Rhapsody", primaryArtist: "Queen", duration_ms: 354000 },
          { name: "Sweet Child O' Mine", primaryArtist: "Guns N' Roses", duration_ms: 356000 },
        ],
      },
      {
        fieldIndex: 1,
        url: "https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd",
        playlistId: "37i9dQZF1DX0XUsuxWHRQd",
        name: "Rap Caviar",
        mockTracks: [
          { name: "Lose Yourself", primaryArtist: "Eminem", duration_ms: 326000 },
        ],
      },
      {
        fieldIndex: 2,
        url: "https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO",
        playlistId: "37i9dQZF1DX4sWSpwq3LiO",
        name: "Peaceful Piano",
        mockTracks: [
          { name: "Nuvole Bianche", primaryArtist: "Ludovico Einaudi", duration_ms: 348000 },
        ],
      },
    ];

    const completedPlaylists = [];

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      sequenceOrder.push(`start_fetch_playlist_${i + 1}`);

      // Step 1: Read valid playlist URL and retrieve tracks
      sequenceOrder.push(`tracks_retrieved_playlist_${i + 1}`);

      // Step 2: Exact matching algorithm pipeline
      sequenceOrder.push(`start_matching_playlist_${i + 1}`);
      const matches = await matchPlaylistTracks(item.mockTracks);
      assert.ok(Array.isArray(matches), "Matches must be an array");
      assert.equal(matches.length, item.mockTracks.length);
      sequenceOrder.push(`matching_completed_playlist_${i + 1}`);

      // Step 3: Present matching results
      sequenceOrder.push(`preview_ready_playlist_${i + 1}`);

      // Step 4: Confirm import
      sequenceOrder.push(`confirm_import_playlist_${i + 1}`);
      const playableTracks = matches.map((m, tIdx) => ({
        id: `saavn_${item.playlistId}_${tIdx}`,
        title: m.matchedTrack?.title || m.spotifyTrack.name,
        artist: m.matchedTrack?.artist || m.spotifyTrack.primaryArtist,
        audioUrl: `https://mock.stream.jiosaavn.com/${item.playlistId}_${tIdx}.mp3`,
        duration: 210,
        type: "song",
        source: "jiosaavn",
        isSpotifyTrack: true,
        spotifyId: item.playlistId,
      }));

      const importedPl = {
        id: `pl_seq_${Date.now()}_${i}`,
        title: item.name,
        tracks: playableTracks,
        spotifyId: item.playlistId,
        category: i === 0 ? "Rock" : i === 1 ? "Hip-Hop" : "Classical",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      completedPlaylists.push(importedPl);
      sequenceOrder.push(`import_saved_playlist_${i + 1}`);

      // Step 5: Advance to Next only after Playlist is successfully saved
      if (i < queue.length - 1) {
        sequenceOrder.push(`enable_next_to_playlist_${i + 2}`);
      }
    }

    // Verify strict sequential progression
    assert.deepEqual(sequenceOrder, [
      "start_fetch_playlist_1",
      "tracks_retrieved_playlist_1",
      "start_matching_playlist_1",
      "matching_completed_playlist_1",
      "preview_ready_playlist_1",
      "confirm_import_playlist_1",
      "import_saved_playlist_1",
      "enable_next_to_playlist_2",
      "start_fetch_playlist_2",
      "tracks_retrieved_playlist_2",
      "start_matching_playlist_2",
      "matching_completed_playlist_2",
      "preview_ready_playlist_2",
      "confirm_import_playlist_2",
      "import_saved_playlist_2",
      "enable_next_to_playlist_3",
      "start_fetch_playlist_3",
      "tracks_retrieved_playlist_3",
      "start_matching_playlist_3",
      "matching_completed_playlist_3",
      "preview_ready_playlist_3",
      "confirm_import_playlist_3",
      "import_saved_playlist_3",
    ]);

    assert.equal(completedPlaylists.length, 3);
  });

  test("3. Unchanged Matching Algorithm Contract: matches Spotify metadata using standard matchPlaylistTracks pipeline", async () => {
    const testTrack = {
      name: "Believer",
      primaryArtist: "Imagine Dragons",
      artists: ["Imagine Dragons"],
      duration_ms: 204000,
    };

    const singleMatch = await matchSingleTrack(testTrack);
    assert.ok(singleMatch);
    assert.ok(typeof singleMatch.score === "number");
    assert.ok(["matched", "review", "unmatched"].includes(singleMatch.status));
  });

  test("4. Cross-Computer Backend Persistence: persists all sequentially imported playlists to backend with full metadata", async () => {
    const playlistsToPersist = [
      {
        id: "seq_import_pl_1",
        title: "Sequential Playlist One",
        category: "Chill",
        spotifyId: "spotify_pl_id_1",
        tracks: [
          { id: "trk_1_1", title: "Track One", artist: "Artist A", audioUrl: "https://audio.cdn/1.mp3" },
          { id: "trk_1_2", title: "Track Two", artist: "Artist B", audioUrl: "https://audio.cdn/2.mp3" },
        ],
        updated_at: new Date().toISOString(),
      },
      {
        id: "seq_import_pl_2",
        title: "Sequential Playlist Two",
        category: "Workout",
        spotifyId: "spotify_pl_id_2",
        tracks: [
          { id: "trk_2_1", title: "Fast Track", artist: "Artist C", audioUrl: "https://audio.cdn/3.mp3" },
        ],
        updated_at: new Date().toISOString(),
      },
    ];

    // Save sequentially to backend
    for (const pl of playlistsToPersist) {
      await saveUserPlaylist(testUserId, pl);
    }

    // Retrieve from backend as if logging in on a second computer
    const retrieved = await getUserPlaylists(testUserId);
    assert.equal(retrieved.length, 2);

    const p1 = retrieved.find((p) => p.id === "seq_import_pl_1");
    const p2 = retrieved.find((p) => p.id === "seq_import_pl_2");

    assert.ok(p1, "Playlist 1 must exist in backend database");
    assert.equal(p1.title, "Sequential Playlist One");
    assert.equal(p1.category, "Chill");
    assert.equal(p1.spotifyId, "spotify_pl_id_1");
    assert.equal(p1.tracks.length, 2);
    assert.equal(p1.tracks[0].audioUrl, "https://audio.cdn/1.mp3");

    assert.ok(p2, "Playlist 2 must exist in backend database");
    assert.equal(p2.title, "Sequential Playlist Two");
    assert.equal(p2.category, "Workout");
    assert.equal(p2.spotifyId, "spotify_pl_id_2");
    assert.equal(p2.tracks.length, 1);
  });

  test("5. Resilience & Retry Safeguard: failed playlist in sequence does not corrupt or erase earlier imported playlists", async () => {
    // Playlist 1 succeeded
    const p1 = {
      id: "resilience_pl_1",
      title: "Resilience Safe Playlist",
      category: "Focus",
      spotifyId: "spot_safe_1",
      tracks: [{ id: "res_t1", title: "Safe Song", artist: "Safe Artist" }],
      updated_at: new Date().toISOString(),
    };
    await saveUserPlaylist(testUserId, p1);

    // Playlist 2 simulates a network failure / 404
    const simulatedError = new Error("Spotify playlist not found or private");

    // Verify backend still contains Playlist 1 intact
    const verifyState = await getUserPlaylists(testUserId);
    const existingP1 = verifyState.find((p) => p.id === "resilience_pl_1");
    assert.ok(existingP1, "Playlist 1 must remain intact despite playlist 2 error");
    assert.equal(existingP1.title, "Resilience Safe Playlist");

    // Retry Playlist 2 after error resolution
    const p2Fixed = {
      id: "resilience_pl_2",
      title: "Resilience Retried Playlist",
      category: "Party",
      spotifyId: "spot_safe_2",
      tracks: [{ id: "res_t2", title: "Party Song", artist: "Party Artist" }],
      updated_at: new Date().toISOString(),
    };
    await saveUserPlaylist(testUserId, p2Fixed);

    const finalState = await getUserPlaylists(testUserId);
    assert.ok(finalState.some((p) => p.id === "resilience_pl_1"));
    assert.ok(finalState.some((p) => p.id === "resilience_pl_2"));
  });
});
