import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { diffSpotifyPlaylist, applySyncPlan } from "./src/services/spotifySyncService.js";
import { parseSpotifyPlaylistId } from "./src/services/spotifyPlaylistService.js";

// Replicate identical isMp3Buffer check from src/app/api/audio/download/route.js
function isMp3Buffer(buf) {
  if (!buf || buf.length < 4) return false;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    return true;
  }
  for (let i = 0; i < Math.min(buf.length - 2, 8192); i++) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
      const layerBits = (buf[i + 1] >> 1) & 0x03;
      if (layerBits === 0x01) {
        return true;
      }
    }
  }
  return false;
}

describe("Ceepeefy — 5 Requirements Comprehensive Test Suite", () => {
  const BASE_URL = "http://localhost:3000";

  // ==========================================
  // REQUIREMENT 1: Spotify Playlist Sync — Exclude Blocked or Skipped Songs
  // ==========================================
  describe("1. Spotify Playlist Sync — Exclude Blocked or Skipped Songs", () => {
    it("1.1: diffSpotifyPlaylist does not re-add songs previously marked as skipped/blocked/rejected/unavailable", () => {
      const existingPlaylist = {
        id: "custom-sync-pl",
        title: "My Synced Playlist",
        spotifyId: "37i9dQZF1DXcBWIGoYBM5M",
        tracks: [
          {
            id: "track_existing_1",
            title: "Shape of You",
            artist: "Ed Sheeran",
            album: "Divide",
            duration: 233,
            source: "jiosaavn",
            spotifyId: "sp_101",
          },
        ],
        syncedSnapshot: [
          {
            sourceEntryId: "sp_101",
            spotifyId: "sp_101",
            title: "Shape of You",
            artist: "Ed Sheeran",
            status: "matched",
            targetTrackId: "track_existing_1",
          },
          {
            sourceEntryId: "sp_102",
            title: "Blocked Explicit Track",
            artist: "Explicit Artist",
            status: "blocked",
            blocked: true,
            excluded: true,
          },
          {
            sourceEntryId: "sp_103",
            title: "User Skipped Song",
            artist: "Indie Band",
            status: "skipped",
            skipped: true,
            excluded: true,
          },
          {
            sourceEntryId: "sp_104",
            title: "Unavailable Regional Song",
            artist: "Regional Singer",
            status: "unavailable",
            unavailable: true,
            excluded: true,
          },
        ],
      };

      // Spotify returns 5 songs: the 1 existing, the 3 previously excluded, and 1 brand new song
      const incomingSpotifyTracks = [
        {
          id: "sp_101",
          title: "Shape of You",
          artist: "Ed Sheeran",
          album: "Divide",
          duration: 233,
        },
        {
          id: "sp_102",
          title: "Blocked Explicit Track",
          artist: "Explicit Artist",
          album: "Album X",
          duration: 180,
        },
        {
          id: "sp_103",
          title: "User Skipped Song",
          artist: "Indie Band",
          album: "Album Y",
          duration: 200,
        },
        {
          id: "sp_104",
          title: "Unavailable Regional Song",
          artist: "Regional Singer",
          album: "Album Z",
          duration: 210,
        },
        {
          id: "sp_105",
          title: "Genuinely New Song",
          artist: "Fresh Artist",
          album: "New Album",
          duration: 195,
        },
      ];

      const diff = diffSpotifyPlaylist(existingPlaylist.syncedSnapshot, incomingSpotifyTracks, existingPlaylist.tracks);

      // Only the genuinely new song (sp_105) should be in 'added'
      assert.equal(diff.added.length, 1, "Only genuinely new songs must be added");
      assert.equal(diff.added[0].newItem?.id || diff.added[0].newItem?.spotifyId, "sp_105");
      assert.equal(diff.added[0].newItem?.title || diff.added[0].newItem?.name, "Genuinely New Song");

      // sp_101 should be unchanged
      assert.equal(diff.unchanged.length, 1);
      assert.equal(diff.unchanged[0].prevItem?.spotifyId || diff.unchanged[0].sourceEntryId, "sp_101");

      // sp_102, sp_103, sp_104 should be in skipped with wasExcluded: true
      assert.equal(diff.skipped.length, 3, "All 3 excluded songs must be placed in skipped");
      const skippedIds = diff.skipped.map((s) => s.prevItem?.spotifyId || s.newItem?.id || s.newItem?.spotifyId || s.sourceEntryId || s.spotifyId);
      assert.ok(skippedIds.includes("sp_102"));
      assert.ok(skippedIds.includes("sp_103"));
      assert.ok(skippedIds.includes("sp_104"));
      assert.ok(diff.skipped.every((s) => s.wasExcluded === true));
    });

    it("1.2: Normalized title and artist matching prevents re-adding excluded songs even if Spotify IDs vary", () => {
      const existingPlaylist = {
        id: "custom-sync-normalized",
        title: "Normalized Test",
        spotifyId: "test_pl_norm",
        tracks: [],
        sourceMeta: {
          excludedTracks: [
            {
              title: "Blinding Lights (Remix) [feat. Rosalia]",
              artist: "The Weeknd & Rosalia",
              status: "rejected",
            },
          ],
        },
        syncedSnapshot: [
          {
            title: "Blinding Lights",
            artist: "The Weeknd",
            status: "rejected",
            excluded: true,
          },
        ],
      };

      const incomingSpotifyTracks = [
        {
          id: "sp_diff_id_999",
          name: "Blinding Lights - Single Version",
          primaryArtist: "The Weeknd",
          artists: [{ name: "The Weeknd" }],
          album: "After Hours",
        },
      ];

      const diff = diffSpotifyPlaylist(existingPlaylist.syncedSnapshot, incomingSpotifyTracks, existingPlaylist.tracks);
      assert.equal(diff.added.length, 0, "Normalized match should prevent re-adding rejected song");
      assert.equal(diff.skipped.length, 1);
      assert.equal(diff.skipped[0].wasExcluded, true);
    });

    it("1.3: applySyncPlan preserves existing playlist order and excludes duplicates", () => {
      const existingTracks = [
        { id: "song_1", title: "Song 1", artist: "Artist 1" },
        { id: "song_2", title: "Song 2", artist: "Artist 2" },
      ];
      const prevSnapshot = [
        { spotifyId: "sp_1", sourceEntryId: "sp_1", targetTrackId: "song_1", status: "matched", title: "Song 1", artist: "Artist 1" },
        { spotifyId: "sp_2", sourceEntryId: "sp_2", targetTrackId: "song_2", status: "matched", title: "Song 2", artist: "Artist 2" },
        { spotifyId: "sp_skip", sourceEntryId: "sp_skip", status: "skipped", skipped: true, wasExcluded: true, title: "Skipped", artist: "Skipped" },
      ];

      const incomingSpotifyTracks = [
        { id: "sp_1", name: "Song 1", primaryArtist: "Artist 1" },
        { id: "sp_2", name: "Song 2", primaryArtist: "Artist 2" },
        { id: "sp_skip", name: "Skipped", primaryArtist: "Skipped" },
        { id: "sp_3", name: "Song 3", primaryArtist: "Artist 3" },
      ];

      const diff = diffSpotifyPlaylist(prevSnapshot, incomingSpotifyTracks, existingTracks);

      const plan = applySyncPlan({
        diff,
        matchedAddedItems: [
          {
            sourceEntryId: diff.added[0].sourceEntryId,
            targetIndex: 2,
            spotifyTrack: diff.added[0].spotifyTrack,
            playableTrack: { id: "song_3", title: "Song 3", artist: "Artist 3" },
          },
        ],
        unresolvedAdditions: [],
        skippedAdditions: [],
        existingTracks,
        playlistTitle: "Order Test",
      });

      // Preserves existing order [song_1, song_2] and appends song_3
      assert.equal(plan.updatedTracks.length, 3);
      assert.equal(plan.updatedTracks[0].id, "song_1");
      assert.equal(plan.updatedTracks[1].id, "song_2");
      assert.equal(plan.updatedTracks[2].id, "song_3");

      // Synced snapshot preserves skipped record
      const skippedSnapshot = plan.newSnapshot.find((s) => s.spotifyId === "sp_skip" || s.sourceEntryId === "sp_skip");
      assert.ok(skippedSnapshot, "Skipped record must remain in synced snapshot");
      assert.ok(skippedSnapshot.status === "skipped" || skippedSnapshot.status === "excluded" || skippedSnapshot.excluded === true);
    });
  });

  // ==========================================
  // REQUIREMENT 2: Home Page — Skeleton Loading
  // ==========================================
  describe("2. Home Page — Skeleton Loading", () => {
    it("2.1: Home page contains skeleton loaders matching existing card dimensions while isPageLoading is true", () => {
      const homePageCode = fs.readFileSync("./src/app/page.jsx", "utf8");

      assert.ok(homePageCode.includes("isPageLoading"), "Home page must track isPageLoading state");
      // Check for song card skeletons (154px / aspect-[4/5])
      assert.ok(
        homePageCode.includes("w-[154px]") && homePageCode.includes("aspect-[4/5]"),
        "Must have skeletons matching SongCard dimensions (w-[154px] aspect-[4/5])"
      );
      // Check for playlist card skeletons (135px / rounded-[10px])
      assert.ok(
        homePageCode.includes("w-[135px]") && homePageCode.includes("rounded-[10px]"),
        "Must have skeletons matching PlaylistCard dimensions"
      );
      // Check for artist avatars skeletons (rounded-full)
      assert.ok(
        homePageCode.includes("rounded-full") && homePageCode.includes("animate-pulse"),
        "Must have skeletons matching ArtistAvatar dimensions with pulse effect"
      );
    });
  });

  // ==========================================
  // REQUIREMENT 3: Spotify Sync — Remove the Error Alert
  // ==========================================
  describe("3. Spotify Sync — Remove Error Alert & Maintain Metadata", () => {
    it("3.1: parseSpotifyPlaylistId extracts playlist ID from all common Spotify formats", () => {
      const formats = [
        "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=123",
        "https://open.spotify.com/intl-ja/playlist/37i9dQZF1DXcBWIGoYBM5M",
        "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M",
        "37i9dQZF1DXcBWIGoYBM5M",
      ];
      for (const fmt of formats) {
        assert.equal(
          parseSpotifyPlaylistId(fmt),
          "37i9dQZF1DXcBWIGoYBM5M",
          `Should parse ID correctly from ${fmt}`
        );
      }
    });

    it("3.2: Playlist details page conditionally hides Sync action if not linked, preventing error toast", () => {
      const playlistDetailsCode = fs.readFileSync("./src/app/playlist/[id]/page.jsx", "utf8");

      assert.ok(
        playlistDetailsCode.includes("const isSpotifyLinked = Boolean(spotifySourceId)"),
        "Must compute isSpotifyLinked boolean"
      );
      // Guarding handleStartSync so it does not trigger without a Spotify source
      assert.ok(
        playlistDetailsCode.includes("if (!spotifySourceId) return;"),
        "handleStartSync must return cleanly if no spotifySourceId instead of triggering red error alert"
      );
      // UI buttons guarded by isSpotifyLinked
      assert.ok(
        playlistDetailsCode.includes("{isSpotifyLinked && ("),
        "Sync with Spotify button must only be rendered when isSpotifyLinked is true"
      );
    });
  });

  // ==========================================
  // REQUIREMENT 4: Downloads — Download MP3 Files
  // ==========================================
  describe("4. Downloads — Download MP3 Files", () => {
    it("4.1: isMp3Buffer validates ID3 tag and MPEG Layer III frame sync", () => {
      // 1. ID3v2 tag (magic bytes 'ID3')
      const id3Buffer = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00]);
      assert.equal(isMp3Buffer(id3Buffer), true, "ID3 tag must be recognized as MP3");

      // 2. MPEG-1 Layer 3 frame sync: 0xFF, 0xFB
      const mpeg1Layer3Buffer = Buffer.from([0xff, 0xfb, 0x90, 0x44]);
      assert.equal(isMp3Buffer(mpeg1Layer3Buffer), true, "MPEG-1 Layer 3 frame sync must be recognized as MP3");

      // 3. MP4 / M4A container (magic bytes '....ftypM4A ')
      const m4aBuffer = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);
      assert.equal(isMp3Buffer(m4aBuffer), false, "M4A AAC container must NOT be treated as MP3");

      // 4. HTML error page
      const htmlBuffer = Buffer.from("<!DOCTYPE html><html><body>Error</body></html>");
      assert.equal(isMp3Buffer(htmlBuffer), false, "HTML page must NOT be treated as MP3");
    });

    it("4.2: /api/audio/download downloads available file format (e.g. .m4a) if MP3 is not provided", async () => {
      // Test track 1 which has an M4A/AAC stream
      const res = await fetch(`${BASE_URL}/api/audio/download?id=1&title=Forest%20Lullaby`, {
        redirect: "manual",
      });
      assert.equal(res.status, 200, "Must return status 200 OK for available audio stream");
      assert.equal(res.headers.get("content-type"), "audio/mp4");
      const disposition = res.headers.get("content-disposition") || "";
      assert.ok(disposition.includes(".m4a"), `Expected .m4a in disposition: ${disposition}`);
    });

    it("4.3: /api/audio/download returns Content-Type: audio/mpeg and .mp3 for genuine MP3 tracks", async () => {
      // Test fallback ambient track with MP3 stream
      const res = await fetch(`${BASE_URL}/api/audio/download?trackId=track-midnight-pulse&title=Midnight%20Pulse`, {
        redirect: "manual",
      });
      assert.equal(res.status, 200, "Must return status 200 OK for MP3 stream");
      assert.equal(res.headers.get("content-type"), "audio/mpeg");
      const disposition = res.headers.get("content-disposition") || "";
      assert.ok(disposition.includes(".mp3"), `Expected .mp3 in disposition: ${disposition}`);
      const buf = Buffer.from(await res.arrayBuffer());
      assert.ok(isMp3Buffer(buf), "Downloaded buffer must be genuine MP3");
    });
  });

  // ==========================================
  // REQUIREMENT 5: Self Mix — Manual Cover Image Option
  // ==========================================
  describe("5. Self Mix — Manual Cover Image Option", () => {
    it("5.1: Self Mix page includes manual cover image picker, handlers, and cloud upload hooks", () => {
      const selfMixCode = fs.readFileSync("./src/app/self-mix/page.jsx", "utf8");

      assert.ok(
        selfMixCode.includes("uploadPlaylistCoverToCloud") && selfMixCode.includes("processLocalImage"),
        "Must import uploadPlaylistCoverToCloud and processLocalImage in self-mix"
      );
      assert.ok(
        selfMixCode.includes("updatePlaylistCover"),
        "Must destruct updatePlaylistCover from MusicContext"
      );
      assert.ok(
        selfMixCode.includes("handleCoverFileSelected"),
        "Must have handleCoverFileSelected for cover upload"
      );
      assert.ok(
        selfMixCode.includes("handleOpenCoverPicker"),
        "Must have handleOpenCoverPicker to trigger file input"
      );
      assert.ok(
        selfMixCode.includes("coverFileInputRef"),
        "Must have hidden coverFileInputRef input"
      );
      assert.ok(
        selfMixCode.includes("photo_camera"),
        "Must have camera icon buttons on cards and headers for changing cover"
      );
    });

    it("5.2: MusicContext updatePlaylistCover handles selfMixes and persists to cloud and localStorage", () => {
      const musicContextCode = fs.readFileSync("./src/context/MusicContext.jsx", "utf8");

      assert.ok(
        musicContextCode.includes("setSelfMixes"),
        "updatePlaylistCover must update selfMixes state"
      );
      assert.ok(
        musicContextCode.includes("savePlaylistToCloud"),
        "updatePlaylistCover must save updated self mix to cloud"
      );
      assert.ok(
        musicContextCode.includes("ceepeefy_playlist_covers"),
        "updatePlaylistCover must persist cover overrides in localStorage"
      );
    });
  });
});
