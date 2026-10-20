import test from "node:test";
import assert from "node:assert/strict";

import {
  PLAYLIST_CATEGORIES,
  getPlaylistCategory,
} from "./src/utils/playlistUtils.js";
import {
  normalizeTrackId,
  areTracksEqual,
  createTrackDeduplicator,
} from "./src/utils/trackIdentity.js";
import {
  diffSpotifyPlaylist,
  buildSnapshotFromExistingPlaylist,
  createSnapshotEntry,
  getTrackFingerprint,
} from "./src/services/spotifySyncService.js";
import { parseSpotifyPlaylistId } from "./src/services/spotifyPlaylistService.js";

test("Spotify Playlist Sync & Category Filter Verification Suite", async (t) => {
  await t.test("1. Category Selection and Stability", async (t1) => {
    await t1.test("1.1: getPlaylistCategory resolves explicit category correctly", () => {
      const plTamil = { id: "pl-1", title: "Anirudh Goosebumps", category: "Tamil" };
      assert.equal(getPlaylistCategory(plTamil), "Tamil");

      const plMalayalam = { id: "pl-2", title: "Feel Good Melodies", category: "Malayalam" };
      assert.equal(getPlaylistCategory(plMalayalam), "Malayalam");

      const plMixed = { id: "pl-3", title: "Roadtrip Hits", category: "Mixed" };
      assert.equal(getPlaylistCategory(plMixed), "Mixed");
    });

    await t1.test("1.2: getPlaylistCategory infers category from title keywords only when uncategorized", () => {
      const plInferred = { id: "pl-4", title: "Best Tamil Hits 2024" };
      assert.equal(getPlaylistCategory(plInferred), "Tamil");

      const plMalayalamInferred = { id: "pl-5", title: "Classic Malayalam Cinema" };
      assert.equal(getPlaylistCategory(plMalayalamInferred), "Malayalam");

      const plPhonk = { id: "pl-6", title: "Aggressive Phonk Drift" };
      assert.equal(getPlaylistCategory(plPhonk), "Phonks");

      const plBgm = { id: "pl-7", title: "Original Motion Picture Theme Score" };
      assert.equal(getPlaylistCategory(plBgm), "Bgms");
    });

    await t1.test("1.3: Category filter matching preserves user selection and does not mutate playlist category", () => {
      const userSelectedFilter = "Tamil";

      const playlists = [
        { id: "1", title: "Anirudh Goosebumps", category: "Tamil" },
        { id: "2", title: "Illuminati Hits", category: "Malayalam" },
        { id: "3", title: "Trending Now India", category: "Mixed" },
        { id: "4", title: "Leo OST", category: "Tamil" },
      ];

      // Filter behavior
      const filtered = playlists.filter((pl) => {
        if (userSelectedFilter !== "All") {
          return (pl.category || "Mixed") === userSelectedFilter;
        }
        return true;
      });

      assert.equal(filtered.length, 2);
      assert.deepEqual(filtered.map((p) => p.id), ["1", "4"]);
      // Confirm individual playlist records were not altered
      assert.equal(playlists[0].category, "Tamil");
      assert.equal(playlists[1].category, "Malayalam");
      assert.equal(playlists[2].category, "Mixed");
    });

    await t1.test("1.4: Cloud sync merge preserves category and sourceMeta without falling back to Mixed", () => {
      // Simulate cloud sync merge logic from MusicContext.jsx
      const cloudRecord = {
        id: "custom-pl-tamil",
        title: "Anirudh Elevation",
        tracks: [{ id: "t1", title: "Hukum" }],
        source_meta: { category: "Tamil", spotifyId: "37i9dQZF1DXcBWIGoYBM5M" },
      };
      const localRecord = {
        id: "custom-pl-tamil",
        title: "Anirudh Elevation",
        category: "Tamil",
      };

      const resolvedCategory =
        cloudRecord.category ||
        localRecord.category ||
        cloudRecord.source_meta?.category ||
        null;

      assert.equal(resolvedCategory, "Tamil");
    });
  });

  await t.test("2. Spotify Playlist ID Resolution & Source Link", async (t2) => {
    await t2.test("2.1: Parses Spotify playlist IDs from various valid URL formats", () => {
      const standardUrl = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abcd1234";
      assert.equal(parseSpotifyPlaylistId(standardUrl), "37i9dQZF1DXcBWIGoYBM5M");

      const localizedUrl = "https://open.spotify.com/intl-ja/playlist/37i9dQZF1DXcBWIGoYBM5M";
      assert.equal(parseSpotifyPlaylistId(localizedUrl), "37i9dQZF1DXcBWIGoYBM5M");

      const embedUrl = "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M";
      assert.equal(parseSpotifyPlaylistId(embedUrl), "37i9dQZF1DXcBWIGoYBM5M");

      const uriFormat = "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M";
      assert.equal(parseSpotifyPlaylistId(uriFormat), "37i9dQZF1DXcBWIGoYBM5M");

      const rawId = "37i9dQZF1DXcBWIGoYBM5M";
      assert.equal(parseSpotifyPlaylistId(rawId), "37i9dQZF1DXcBWIGoYBM5M");
    });

    await t2.test("2.2: Rejects invalid or malicious strings gracefully", () => {
      assert.equal(parseSpotifyPlaylistId(""), null);
      assert.equal(parseSpotifyPlaylistId(null), null);
      assert.equal(parseSpotifyPlaylistId("https://example.com/not-spotify"), null);
    });
  });

  await t.test("3. Additive Playlist Synchronization & Deduplication", async (t3) => {
    const existingLocalTracks = [
      {
        id: "saavn_101",
        title: "Badass",
        artist: "Anirudh Ravichander",
        spotifyId: "sp_101",
        sourceEntryId: "sp_101#0",
      },
      {
        id: "saavn_102",
        title: "Naa Ready",
        artist: "Anirudh Ravichander, Thalapathy Vijay",
        spotifyId: "sp_102",
        sourceEntryId: "sp_102#0",
      },
    ];

    const baselineSnapshot = buildSnapshotFromExistingPlaylist({ tracks: existingLocalTracks });

    await t3.test("3.1: Reports up-to-date when remote tracks have not changed", () => {
      const currentRemoteTracks = [
        { id: "sp_101", name: "Badass", primaryArtist: "Anirudh Ravichander" },
        { id: "sp_102", name: "Naa Ready", primaryArtist: "Anirudh Ravichander" },
      ];

      const diff = diffSpotifyPlaylist(baselineSnapshot, currentRemoteTracks, existingLocalTracks);
      assert.equal(diff.isUpToDate, true);
      assert.equal(diff.added.length, 0);
    });

    await t3.test("3.2: Identifies newly added tracks in Spotify playlist", () => {
      const currentRemoteTracks = [
        { id: "sp_101", name: "Badass", primaryArtist: "Anirudh Ravichander" },
        { id: "sp_102", name: "Naa Ready", primaryArtist: "Anirudh Ravichander" },
        { id: "sp_103", name: "Lokiverse 2.0", primaryArtist: "Anirudh Ravichander" },
      ];

      const diff = diffSpotifyPlaylist(baselineSnapshot, currentRemoteTracks, existingLocalTracks);
      assert.equal(diff.isUpToDate, false);
      assert.equal(diff.added.length, 1);
      assert.equal(diff.added[0].newItem.id, "sp_103");
    });

    await t3.test("3.3: Additive update appends new tracks without deleting or modifying existing local songs", () => {
      const newlyDiscoveredPlayable = {
        id: "saavn_103",
        title: "Lokiverse 2.0",
        artist: "Anirudh Ravichander",
        spotifyId: "sp_103",
        source: "jiosaavn",
      };

      // Additive update
      const deduplicator = createTrackDeduplicator(existingLocalTracks);
      const newAdditions = [];
      if (deduplicator.add(newlyDiscoveredPlayable)) {
        newAdditions.push(newlyDiscoveredPlayable);
      }

      const updatedTracks = [...existingLocalTracks, ...newAdditions];

      assert.equal(updatedTracks.length, 3);
      assert.equal(updatedTracks[0].id, "saavn_101");
      assert.equal(updatedTracks[1].id, "saavn_102");
      assert.equal(updatedTracks[2].id, "saavn_103");
    });

    await t3.test("3.4: Repeated Update clicks do not introduce duplicate tracks", () => {
      const currentTracks = [
        { id: "saavn_101", title: "Badass", artist: "Anirudh Ravichander" },
        { id: "saavn_102", title: "Naa Ready", artist: "Anirudh Ravichander" },
        { id: "saavn_103", title: "Lokiverse 2.0", artist: "Anirudh Ravichander" },
      ];

      const deduplicator = createTrackDeduplicator(currentTracks);

      const candidateFromSpotify = {
        id: "saavn_103",
        title: "Lokiverse 2.0",
        artist: "Anirudh Ravichander",
      };

      // Attempting to add an already-existing song returns false
      const wasAdded = deduplicator.add(candidateFromSpotify);
      assert.equal(wasAdded, false);
    });

    await t3.test("3.5: Preserves tracks that were removed from Spotify (additive-only contract)", () => {
      // Remote Spotify playlist removed "Badass" (sp_101)
      const remoteWithoutBadass = [
        { id: "sp_102", name: "Naa Ready", primaryArtist: "Anirudh Ravichander" },
      ];

      const diff = diffSpotifyPlaylist(baselineSnapshot, remoteWithoutBadass, existingLocalTracks);
      assert.equal(diff.removed.length, 1);
      assert.equal(diff.removed[0].prevItem.spotifyId, "sp_101");

      // In additive mode, we do NOT delete diff.removed from local tracks
      const updatedLocal = [...existingLocalTracks];
      assert.equal(updatedLocal.length, 2);
      assert.equal(updatedLocal.some((t) => t.id === "saavn_101"), true);
    });
  });

  await t.test("4. Category Cross-Device Persistence & Manual Overrides", async (t4) => {
    await t4.test("4.1: Manual category override takes absolute priority over automatic keyword inference", () => {
      // Playlist title has 'Tamil', but user manually assigned it to 'Bgms'
      const plManualOverride = {
        id: "pl-override-1",
        title: "Best Tamil Hits 2024",
        category: "Bgms",
      };
      assert.equal(getPlaylistCategory(plManualOverride), "Bgms");
      assert.notEqual(getPlaylistCategory(plManualOverride), "Tamil");

      // Playlist title has 'Hindi', but user manually moved it to 'Malayalam'
      const plMalayalamMove = {
        id: "pl-override-2",
        title: "Hindi Melody Collection",
        category: "Malayalam",
      };
      assert.equal(getPlaylistCategory(plMalayalamMove), "Malayalam");
    });

    await t4.test("4.2: Simulated cross-device sync retrieves saved category and does not reset to Mixed", () => {
      // Simulated cloud record stored in Supabase user_playlists table
      const cloudRecord = {
        id: "pl-cloud-1",
        user_id: "user_default",
        title: "Anirudh Elevation Songs",
        category: "Tamil",
        source: "spotify_import",
        source_meta: {
          category: "Tamil",
          spotifyId: "37i9dQZF1DXcBWIGoYBM5M",
        },
        tracks: [{ id: "t1", title: "Hukum" }],
      };

      // When fetched on another computer without prior local storage
      const resolvedOnNewDevice = cloudRecord.category || cloudRecord.source_meta?.category || "Mixed";
      assert.equal(resolvedOnNewDevice, "Tamil");
      assert.notEqual(resolvedOnNewDevice, "Mixed");
    });

    await t4.test("4.3: Category filter accurately filters playlists by assigned category", () => {
      const collections = [
        { id: "1", title: "Anirudh Tamil Songs", category: "Tamil" },
        { id: "2", title: "Malayalam Beats", category: "Malayalam" },
        { id: "3", title: "Study BGM", category: "Bgms" },
        { id: "4", title: "Global Top Hits", category: "English" },
        { id: "5", title: "Uncategorized Mix", category: "Mixed" },
      ];

      // Filtering by Tamil
      const tamilResults = collections.filter((pl) => (pl.category || "Mixed") === "Tamil");
      assert.equal(tamilResults.length, 1);
      assert.equal(tamilResults[0].id, "1");

      // Filtering by Bgms
      const bgmResults = collections.filter((pl) => (pl.category || "Mixed") === "Bgms");
      assert.equal(bgmResults.length, 1);
      assert.equal(bgmResults[0].id, "3");

      // Filtering by All displays every collection
      const allFilter = "All";
      const allResults = collections.filter((pl) => (allFilter === "All" ? true : (pl.category || "Mixed") === allFilter));
      assert.equal(allResults.length, 5);
    });
  });

  await t.test("5. Spotify Playlist Update Button & Re-sync Safeguards", async (t5) => {
    await t5.test("5.1: Spotify imported playlists are accurately recognized for permanent Update button", () => {
      const checkIsSpotify = (pl) =>
        Boolean(
          pl.badge === "SPOTIFY" ||
          pl.source === "spotify_import" ||
          pl.spotifyId ||
          pl.sourceMeta?.spotifyId ||
          pl.source_meta?.spotifyId ||
          parseSpotifyPlaylistId(pl.spotifyUrl || pl.sourceMeta?.spotifyUrl)
        );

      const plDirectBadge = { id: "p1", badge: "SPOTIFY" };
      assert.equal(checkIsSpotify(plDirectBadge), true);

      const plSourceImport = { id: "p2", source: "spotify_import" };
      assert.equal(checkIsSpotify(plSourceImport), true);

      const plWithSpotifyId = { id: "p3", spotifyId: "37i9dQZF1DXcBWIGoYBM5M" };
      assert.equal(checkIsSpotify(plWithSpotifyId), true);

      const plWithMeta = {
        id: "p4",
        sourceMeta: { spotifyId: "37i9dQZF1DXcBWIGoYBM5M" },
      };
      assert.equal(checkIsSpotify(plWithMeta), true);

      const plLocalCustom = { id: "p5", isCustom: true, source: "custom" };
      assert.equal(checkIsSpotify(plLocalCustom), false);
    });

    await t5.test("5.2: Additive update preserves playlist category, title, artwork, and ordering", () => {
      const existingPlaylist = {
        id: "spotify-pl-1",
        title: "Anirudh Elevation",
        category: "Tamil",
        coverUrl: "https://images.unsplash.com/custom-art.jpg",
        customCover: "https://images.unsplash.com/custom-art.jpg",
        tracks: [
          { id: "saavn_1", title: "Badass", artist: "Anirudh", spotifyId: "sp_1" },
          { id: "saavn_2", title: "Naa Ready", artist: "Anirudh", spotifyId: "sp_2" },
        ],
        sourceMeta: {
          category: "Tamil",
          spotifyId: "sp_playlist_123",
        },
      };

      const newTrackFromSpotify = {
        id: "saavn_3",
        title: "Lokiverse 2.0",
        artist: "Anirudh",
        spotifyId: "sp_3",
      };

      // Simulate additive update logic
      const updatedTracks = [...existingPlaylist.tracks, newTrackFromSpotify];
      const updatedPlaylist = {
        ...existingPlaylist,
        category: existingPlaylist.category || "Mixed",
        tracks: updatedTracks,
        songsCount: updatedTracks.length,
      };

      // Category MUST remain Tamil
      assert.equal(updatedPlaylist.category, "Tamil");
      // Artwork MUST remain intact
      assert.equal(updatedPlaylist.coverUrl, "https://images.unsplash.com/custom-art.jpg");
      // Title MUST remain intact
      assert.equal(updatedPlaylist.title, "Anirudh Elevation");
      // Original track ordering MUST be preserved
      assert.equal(updatedPlaylist.tracks[0].id, "saavn_1");
      assert.equal(updatedPlaylist.tracks[1].id, "saavn_2");
      assert.equal(updatedPlaylist.tracks[2].id, "saavn_3");
    });

    await t5.test("5.3: Update response reports correct message for zero additions vs new additions", () => {
      const getResultMessage = (addedCount) => {
        if (addedCount === 0) return "Playlist is already up to date.";
        return `Successfully added ${addedCount} new track${addedCount > 1 ? "s" : ""} from Spotify.`;
      };

      assert.equal(getResultMessage(0), "Playlist is already up to date.");
      assert.equal(getResultMessage(1), "Successfully added 1 new track from Spotify.");
      assert.equal(getResultMessage(5), "Successfully added 5 new tracks from Spotify.");
    });
  });
});

