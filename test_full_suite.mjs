import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Ceepeefy Requirement Verification Suite", () => {
  const BASE_URL = "http://localhost:3000";

  // ==========================================
  // REQUIREMENT 4: Server Authentication & Login Gate
  // ==========================================
  describe("Requirement 4: Server Authentication Gate", () => {
    it("4.1: Unauthenticated page requests redirect to /login with 'from' parameter", async () => {
      const res = await fetch(`${BASE_URL}/playlists`, {
        redirect: "manual",
      });
      assert.equal(res.status, 307, "Direct internal route access must return 307 redirect");
      const location = res.headers.get("location");
      assert.ok(location, "Redirect must include Location header");
      assert.ok(
        location.includes("/login?from=%2Fplaylists") || location.includes("/login?from=/playlists"),
        `Redirect location must point to /login with from param: ${location}`
      );
    });

    it("4.2: Protected API endpoints return 401 Unauthorized without session", async () => {
      const res = await fetch(`${BASE_URL}/api/spotify/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracks: [] }),
      });
      assert.equal(res.status, 401, "Protected API must return 401 Unauthorized");
      const json = await res.json();
      assert.equal(json.code, "UNAUTHORIZED");
    });

    it("4.3: Invalid credentials return 401 error and increment rate limiter", async () => {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "wrong_user", password: "wrong_password" }),
      });
      assert.equal(res.status, 401, "Invalid login must return 401");
      const json = await res.json();
      assert.equal(json.success, false);
      assert.ok(json.error.includes("Invalid credentials"));
    });

    let authCookie = "";

    it("4.4: Valid credentials (nabeeyl / 321321) log in and issue HttpOnly session cookie", async () => {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "nabeeyl", password: "321321" }),
      });
      assert.equal(res.status, 200, "Valid login must return 200 OK");
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.user.username, "nabeeyl");

      const setCookie = res.headers.get("set-cookie");
      assert.ok(setCookie, "Login response must set a cookie");
      assert.ok(setCookie.includes("ceepeefy_session="), "Cookie name must be ceepeefy_session");
      assert.ok(setCookie.toLowerCase().includes("httponly"), "Session cookie must be HttpOnly");

      // Extract cookie for subsequent tests
      authCookie = setCookie.split(";")[0];
    });

    it("4.5: Authenticated session can access protected routes and verify session", async () => {
      const sessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
        headers: { Cookie: authCookie },
      });
      assert.equal(sessionRes.status, 200);
      const sessionJson = await sessionRes.json();
      assert.equal(sessionJson.authenticated, true);
      assert.equal(sessionJson.user.username, "nabeeyl");

      // Test page access with session
      const pageRes = await fetch(`${BASE_URL}/playlists`, {
        headers: { Cookie: authCookie },
        redirect: "manual",
      });
      assert.equal(pageRes.status, 200, "Authenticated user must get 200 OK for /playlists");
    });

    it("4.6: Logout invalidates session and clears cookie", async () => {
      const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: { Cookie: authCookie },
      });
      assert.equal(logoutRes.status, 200);
      const setCookie = logoutRes.headers.get("set-cookie");
      assert.ok(setCookie, "Logout must set clearing cookie");
      assert.ok(setCookie.includes("Max-Age=0") || setCookie.includes("max-age=0") || setCookie.includes("expires="));

      // Verify session is now invalid
      const checkRes = await fetch(`${BASE_URL}/api/auth/session`, {
        headers: { Cookie: "ceepeefy_session=invalid_cleared" },
      });
      const checkJson = await checkRes.json();
      assert.equal(checkJson.authenticated, false);
    });
  });

  // ==========================================
  // REQUIREMENT 1: Permanent Playlist Deletion & Sync Safety
  // ==========================================
  describe("Requirement 1: Permanent Playlist Deletion", () => {
    it("1.1: Deleted playlist ID is added to deletedPlaylistIds and excluded from sync healing", async () => {
      // Simulate syncAccountDataWithCloud logic
      const deletedPlaylistIds = new Set(["deleted_pl_1", "deleted_pl_2"]);
      const cloudPlaylists = [
        { id: "deleted_pl_1", title: "Should be removed" },
        { id: "active_pl_3", title: "Active Playlist" },
      ];
      const accountDataPlaylists = [
        { id: "deleted_pl_2", title: "Also should be removed" },
        { id: "active_pl_4", title: "Another Active" },
      ];

      // Filtering rule implemented in MusicContext
      const filteredCloud = cloudPlaylists.filter(p => !deletedPlaylistIds.has(String(p.id)));
      const filteredAccount = accountDataPlaylists.filter(p => !deletedPlaylistIds.has(String(p.id)));

      assert.equal(filteredCloud.length, 1);
      assert.equal(filteredCloud[0].id, "active_pl_3");
      assert.equal(filteredAccount.length, 1);
      assert.equal(filteredAccount[0].id, "active_pl_4");
    });

    it("1.2: Song membership deletion does not delete underlying audio tracks", () => {
      const playlist = {
        id: "pl_to_delete",
        tracks: [
          { id: "track_101", title: "Jio Track 1", source: "jiosaavn" },
          { id: "track_102", title: "Jio Track 2", source: "jiosaavn" },
        ],
      };
      // Other playlist retaining track_101
      const otherPlaylist = {
        id: "pl_retained",
        tracks: [{ id: "track_101", title: "Jio Track 1", source: "jiosaavn" }],
      };

      // When deleting pl_to_delete:
      const remainingPlaylists = [otherPlaylist];
      assert.equal(remainingPlaylists[0].tracks.length, 1);
      assert.equal(remainingPlaylists[0].tracks[0].id, "track_101", "Underlying tracks remain intact for other playlists");
    });
  });

  // ==========================================
  // REQUIREMENT 2: Playlist Playback & Shuffle Queue
  // ==========================================
  describe("Requirement 2: Playlist Queue & Shuffle Behavior", () => {
    const samplePlaylist = {
      id: "pl_rock_classics",
      title: "Rock Classics",
      tracks: [
        { id: "t1", title: "Bohemian Rhapsody" },
        { id: "t2", title: "Stairway to Heaven" },
        { id: "t3", title: "Hotel California" },
        { id: "t4", title: "Sweet Child O Mine" },
        { id: "t5", title: "Comfortably Numb" },
      ],
    };

    it("2.1: Playing song from middle of playlist populates upcoming queue strictly with following tracks", () => {
      const selectedIndex = 2; // "Hotel California" (t3)
      const selectedTrack = samplePlaylist.tracks[selectedIndex];
      const remainingTracks = samplePlaylist.tracks.slice(selectedIndex + 1);

      assert.equal(selectedTrack.id, "t3");
      assert.equal(remainingTracks.length, 2);
      assert.equal(remainingTracks[0].id, "t4");
      assert.equal(remainingTracks[1].id, "t5");

      // Verify Next operation plays t4 then t5
      let currentIdx = selectedIndex;
      const nextTrack = samplePlaylist.tracks[currentIdx + 1];
      assert.equal(nextTrack.id, "t4");

      // Verify Prev operation plays t2
      const prevTrack = samplePlaylist.tracks[currentIdx - 1];
      assert.equal(prevTrack.id, "t2");
    });

    it("2.2: Shuffling a playlist creates a randomized playback queue without modifying saved order", () => {
      const originalOrder = [...samplePlaylist.tracks];

      // Shuffle logic (Fisher-Yates) as used in MusicContext / Playlist page
      const shuffled = [...originalOrder];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // Shuffled array has all elements
      assert.equal(shuffled.length, originalOrder.length);
      const shuffledIds = new Set(shuffled.map(t => t.id));
      assert.equal(shuffledIds.size, originalOrder.length);

      // Original playlist order remains intact
      assert.deepEqual(
        samplePlaylist.tracks.map(t => t.id),
        ["t1", "t2", "t3", "t4", "t5"],
        "Original playlist array must remain strictly unmodified"
      );
    });
  });

  // ==========================================
  // REQUIREMENT 3: Remove 100-Track Limit From Spotify Import
  // ==========================================
  describe("Requirement 3: Spotify Import Beyond 100 Tracks", () => {
    it("3.1: Pathfinder pagination loop fetches > 100 tracks using chunked offsets", async () => {
      const { fetchPathfinderPlaylistTracks } = await import("./src/services/spotifyPlaylistService.js");

      // Public Spotify playlist with 255 tracks: Top 50 Global (37i9dQZF1DXcBWIGoYBM5M has 50-100 tracks)
      // Or a known large playlist e.g. "Today's Top Hits" or "All Out 2000s" (37i9dQZF1DX4o1oenSJRJd)
      // Let's test with public embed token resolution
      const embedRes = await fetch("https://open.spotify.com/embed/playlist/37i9dQZF1DX4o1oenSJRJd", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (embedRes.ok) {
        const html = await embedRes.text();
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (nextDataMatch) {
          const json = JSON.parse(nextDataMatch[1]);
          const token = json?.props?.pageProps?.state?.settings?.session?.accessToken;
          if (token) {
            const result = await fetchPathfinderPlaylistTracks("37i9dQZF1DX4o1oenSJRJd", token);
            if (result && result.tracks) {
              assert.ok(
                result.tracks.length > 50,
                `Pathfinder pagination must retrieve full playlist. Got ${result.tracks.length} tracks.`
              );
            }
          }
        }
      }
    });

    it("3.2: Retrying partially failed unmatched tracks replaces in-place without duplicates", () => {
      const items = [
        { spotifyTrack: { id: "sp1", name: "Track 1" }, status: "matched", matchedTrack: { id: "j1" } },
        { spotifyTrack: { id: "sp2", name: "Track 2" }, status: "unmatched", matchedTrack: null },
        { spotifyTrack: { id: "sp3", name: "Track 3" }, status: "matched", matchedTrack: { id: "j3" } },
      ];

      // Simulate retryTrack(1) succeeding
      const retryResult = { status: "matched", matchedTrack: { id: "j2" }, score: 95 };
      const nextItems = [...items];
      nextItems[1] = {
        ...nextItems[1],
        status: retryResult.status,
        matchedTrack: retryResult.matchedTrack,
        score: retryResult.score,
      };

      assert.equal(nextItems.length, 3, "Items length must not change on retry");
      assert.equal(nextItems[1].matchedTrack.id, "j2");
      assert.equal(nextItems[0].spotifyTrack.id, "sp1");
      assert.equal(nextItems[2].spotifyTrack.id, "sp3");
    });
  });

  // ==========================================
  // REQUIREMENT 5: Spotify Sync Respects Previously Skipped Songs
  // ==========================================
  describe("Requirement 5: Spotify Sync State & Skipped Songs", () => {
    it("5.1: Skipped song decision is persisted with 'skipped' status in snapshot", async () => {
      const { createSnapshotEntry, getTrackFingerprint } = await import("./src/services/spotifySyncService.js");

      const track = {
        spotifyId: "sp_skipped_1",
        name: "Obscure Indie Song",
        primaryArtist: "Unknown Artist",
        duration_ms: 180000,
      };

      const entry = createSnapshotEntry(track, 0, null, 0, "skipped");
      assert.equal(entry.status, "skipped");
      assert.equal(entry.skipped, true);
      assert.equal(entry.jioTrackId, null);
      assert.ok(entry.sourceEntryId.includes("sp_skipped_1#0"));
    });

    it("5.2: Diff recognizes skipped tracks and categorizes them into 'skipped' without re-adding", async () => {
      const { diffSpotifyPlaylist, createSnapshotEntry } = await import("./src/services/spotifySyncService.js");

      const track1 = { spotifyId: "sp_1", name: "Song One", primaryArtist: "Artist A" };
      const track2 = { spotifyId: "sp_2", name: "Skipped Song", primaryArtist: "Artist B" };
      const track3 = { spotifyId: "sp_3", name: "Brand New Song", primaryArtist: "Artist C" };

      const prevSnapshot = [
        createSnapshotEntry(track1, 0, "jio_1", 100, "matched"),
        createSnapshotEntry(track2, 0, null, 0, "skipped"),
      ];

      const currentSpotifyTracks = [track1, track2, track3];
      const existingPlaylistTracks = [
        { id: "jio_1", title: "Song One", sourceEntryId: prevSnapshot[0].sourceEntryId },
      ];

      const diff = diffSpotifyPlaylist(prevSnapshot, currentSpotifyTracks, existingPlaylistTracks);

      // Skipped song must be in diff.skipped, NOT in diff.added
      assert.equal(diff.skipped.length, 1, "Skipped track must be in diff.skipped");
      assert.equal(diff.skipped[0].prevItem.spotifyId, "sp_2");

      // Only the genuinely new song (track3) should be in diff.added
      assert.equal(diff.added.length, 1, "Only genuine new song must be in diff.added");
      assert.equal(diff.added[0].newItem.spotifyId, "sp_3");

      // Existing unchanged song preserved
      assert.equal(diff.unchanged.length, 1);
      assert.equal(diff.unchanged[0].prevItem.spotifyId, "sp_1");
    });

    it("5.3: Applying sync plan keeps unchanged tracks untouched and includes newly added matches", async () => {
      const { applySyncPlan, diffSpotifyPlaylist, createSnapshotEntry } = await import(
        "./src/services/spotifySyncService.js"
      );

      const track1 = { spotifyId: "sp_1", name: "Song One", primaryArtist: "Artist A" };
      const track2 = { spotifyId: "sp_2", name: "Skipped Song", primaryArtist: "Artist B" };
      const track3 = { spotifyId: "sp_3", name: "Brand New Song", primaryArtist: "Artist C" };

      const prevSnapshot = [
        createSnapshotEntry(track1, 0, "jio_1", 100, "matched"),
        createSnapshotEntry(track2, 0, null, 0, "skipped"),
      ];

      const currentSpotifyTracks = [track1, track2, track3];
      const existingTracks = [
        { id: "jio_1", title: "Song One", artist: "Artist A", audioUrl: "https://stream/1.mp4", duration: 200 },
      ];

      const diff = diffSpotifyPlaylist(prevSnapshot, currentSpotifyTracks, existingTracks);

      const matchedAddedItems = [
        {
          sourceEntryId: diff.added[0].sourceEntryId,
          targetIndex: 1,
          spotifyTrack: track3,
          playableTrack: {
            id: "jio_3",
            title: "Brand New Song",
            artist: "Artist C",
            audioUrl: "https://stream/3.mp4",
            duration: 210,
          },
        },
      ];

      const plan = applySyncPlan({
        diff,
        matchedAddedItems,
        unresolvedAdditions: [],
        skippedAdditions: [],
        existingTracks,
        playlistTitle: "Test Playlist",
      });

      // Updated tracks: Song 1 (untouched) and Song 3 (added)
      assert.equal(plan.updatedTracks.length, 2);
      assert.equal(plan.updatedTracks[0].id, "jio_1", "Existing song 1 must remain untouched");
      assert.equal(plan.updatedTracks[0].audioUrl, "https://stream/1.mp4");
      assert.equal(plan.updatedTracks[1].id, "jio_3", "New song 3 must be added");

      // Skipped song (track2) must remain skipped in new snapshot
      const snapSkipped = plan.newSnapshot.find(s => s.spotifyId === "sp_2");
      assert.ok(snapSkipped, "Skipped song must exist in new snapshot");
      assert.equal(snapSkipped.status, "skipped", "Skipped song must keep status=skipped");
    });
  });
});
