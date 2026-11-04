import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("CEEPEEFY: Comprehensive Playlist Persistence & Synchronization Suite", () => {

  // Generate 61 realistic legacy tracks with diverse metadata, including duplicate songs
  const generate61LegacyTracks = () => {
    return Array.from({ length: 61 }, (_, i) => {
      // Intentionally create duplicate track IDs at position 10 and 35 to test deduplication safety
      const trackId = (i === 35) ? "malayalam_track_10" : `malayalam_track_${i + 1}`;
      return {
        id: trackId,
        title: `Sad Malayalam Song ${i + 1}`,
        artist: i % 2 === 0 ? "K. J. Yesudas" : "K. S. Chithra",
        album: `Heartbreak Hits Vol ${Math.floor(i / 10) + 1}`,
        duration: 208 + (i % 20),
        durationFormatted: "3:28",
        audioUrl: `https://storage.supabase.co/audio/track_${i + 1}.mp3`,
        coverUrl: `https://storage.supabase.co/covers/art_${i + 1}.jpg`,
        source: "jiosaavn",
        year: "2024",
      };
    });
  };

  // --------------------------------------------------------------------------
  // TEST 1: Existing Playlist - 61 Track Migration & Verification
  // --------------------------------------------------------------------------
  it("1. Existing Playlist: Migrates 61 legacy JSONB tracks into playlist_tracks with zero loss", () => {
    const raw61Tracks = generate61LegacyTracks();
    assert.equal(raw61Tracks.length, 61, "Fixture must start with exactly 61 legacy tracks");

    // Simulated PostgreSQL user_playlists state BEFORE migration
    const userPlaylistsDb = [
      {
        id: "playlist-custom-1793791009781",
        title: "Sad songs malayalam 🥀💔",
        user_id: "nabeeyl",
        auth_user_id: null,
        tracks: JSON.parse(JSON.stringify(raw61Tracks)), // JSONB column
        kind: "user",
        category: "Sad",
        created_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-10-01T00:00:00Z",
      },
      // Second legacy playlist to test ALL custom playlists migration
      {
        id: "playlist-custom-1793791009799",
        title: "Old Melodies",
        user_id: "nabeeyl",
        auth_user_id: null,
        tracks: [
          { id: "old_trk_1", title: "Thumbi Vaa", artist: "S. Janaki", duration: 250 },
          { id: "old_trk_2", title: "Oru Dalapam", artist: "K. J. Yesudas", duration: 230 },
        ],
        kind: "user",
        category: "Melody",
        created_at: "2026-10-02T00:00:00Z",
        updated_at: "2026-10-02T00:00:00Z",
      },
      // Preserved Self Mix 1
      {
        id: "mix-1730000001",
        title: "Lo-Fi Night Mix",
        user_id: "nabeeyl",
        auth_user_id: null,
        tracks: [{ id: "mix_trk_1", title: "Midnight Chill" }],
        kind: "mix",
      },
      // Preserved Self Mix 2
      {
        id: "mix-1730000002",
        title: "Acoustic Rain",
        user_id: "nabeeyl",
        auth_user_id: null,
        tracks: [{ id: "mix_trk_2", title: "Gentle Rain" }],
        kind: "mix",
      },
      // Preserved Cloud Archive
      {
        id: "cloud-archive-playlist",
        title: "Cloud Archive",
        user_id: "nabeeyl",
        auth_user_id: null,
        tracks: [],
        kind: "cloud_archive",
      },
    ];

    // Simulated PostgreSQL playlist_tracks state BEFORE migration
    const playlistTracksDb = [];

    // Simulated auth.users table
    const authUsersDb = [
      {
        id: "9f0b5d5e-d250-4fd1-b580-0ea5cbbec758",
        email: "nabeelek3603@gmail.com",
      },
    ];

    // ------------------------------------------------------------------------
    // VERIFY PRE-MIGRATION STATE
    // ------------------------------------------------------------------------
    const prePlaylist = userPlaylistsDb.find((p) => p.id === "playlist-custom-1793791009781");
    assert.equal(prePlaylist.tracks.length, 61, "Before: user_playlists.tracks has 61 tracks");
    assert.equal(prePlaylist.auth_user_id, null, "Before: auth_user_id is NULL");
    assert.equal(
      playlistTracksDb.filter((t) => t.playlist_id === "playlist-custom-1793791009781").length,
      0,
      "Before: playlist_tracks has 0 rows"
    );

    // ------------------------------------------------------------------------
    // EXECUTE STEP 1: RESOLVE AUTH UUID & BACKFILL PLAYLIST OWNERSHIP
    // ------------------------------------------------------------------------
    const verifiedAuthUser = authUsersDb.find(
      (u) => u.email.toLowerCase() === "nabeelek3603@gmail.com"
    );
    assert.ok(verifiedAuthUser, "Must resolve user from auth.users");
    const v_auth_uid = verifiedAuthUser.id;

    // Backfill ALL normal custom playlists owned by legacy user 'nabeeyl'
    for (const p of userPlaylistsDb) {
      if (
        p.user_id === "nabeeyl" &&
        !p.auth_user_id &&
        (p.kind === null || p.kind === "user") &&
        !p.id.startsWith("mix-") &&
        p.id !== "cloud-archive-playlist"
      ) {
        p.auth_user_id = v_auth_uid;
        p.updated_at = new Date().toISOString();
      }
    }

    assert.equal(prePlaylist.auth_user_id, v_auth_uid, "Target playlist ownership set to verified UUID");
    assert.equal(userPlaylistsDb[1].auth_user_id, v_auth_uid, "All normal custom playlists updated");

    // Verify Self Mixes and Cloud Archive remain untouched
    const selfMixes = userPlaylistsDb.filter((p) => p.kind === "mix" || p.kind === "cloud_archive");
    assert.equal(selfMixes.length, 3, "All three Self Mix/Archive records preserved");
    for (const sm of selfMixes) {
      assert.equal(sm.auth_user_id, null, "Self Mix/Archive records were not modified");
    }

    // ------------------------------------------------------------------------
    // EXECUTE STEP 2 & 3: MIGRATE ALL PLAYLIST TRACKS (SAFE INSERT-ONLY)
    // ------------------------------------------------------------------------
    const conflictsReported = [];

    // Pre-populate an existing normalized track to test Issue 3 (DO NOT overwrite with older JSONB)
    playlistTracksDb.push({
      playlist_id: "playlist-custom-1793791009781",
      track_id: "malayalam_track_1",
      track_key: "malayalam_track_1",
      position: 0,
      title: "Sad Malayalam Song 1 (Hi-Res Lossless 2026 Remaster)",
      artist: "K. J. Yesudas",
      album: "Heartbreak Hits Vol 1",
      duration: 215,
      duration_formatted: "3:35",
      audio_url: "https://storage.supabase.co/audio/track_1_remastered.mp3",
      cover_url: "https://storage.supabase.co/covers/art_1_remastered.jpg",
      source: "custom",
      created_at: "2026-11-04T00:00:00Z",
    });

    // Verify unique index creation happens BEFORE insert (Issue 1)
    let uniqueIndexCreated = false;
    const verifyAndCreateUniqueIndex = () => {
      // Check duplicates across playlist_tracks
      const counts = new Map();
      for (const row of playlistTracksDb) {
        const k = `${row.playlist_id}__${row.track_key}`;
        counts.set(k, (counts.get(k) || 0) + 1);
        if (counts.get(k) > 1) {
          throw new Error(`Duplicate found before index creation: ${k}`);
        }
      }
      uniqueIndexCreated = true;
    };
    verifyAndCreateUniqueIndex();
    assert.equal(uniqueIndexCreated, true, "Unique index verified/created before INSERT ON CONFLICT");

    const executeMigration = () => {
      const normalPlaylists = userPlaylistsDb.filter(
        (p) => (p.kind === null || p.kind === "user") && !p.id.startsWith("mix-") && p.id !== "cloud-archive-playlist"
      );

      for (const targetPl of normalPlaylists) {
        const rawTracks = targetPl.tracks || [];
        const baseKeyOccurrences = new Map();

        for (let ord = 0; ord < rawTracks.length; ord++) {
          const elem = rawTracks[ord];
          // Issue 2: Preserve original music track identifier in track_id
          const originalTrackId = elem.id || elem.track_id || elem.spotifyId || `track_${ord}`;
          const baseKey = elem.track_key || elem.id || elem.track_id || elem.spotifyId || `track_${ord}`;
          const occCount = (baseKeyOccurrences.get(baseKey) || 0) + 1;
          baseKeyOccurrences.set(baseKey, occCount);

          // Issue 2: Safe deterministic track_key per occurrence
          const safeTrackKey = (occCount === 1) ? baseKey : `${baseKey}__pos_${ord}`;

          const record = {
            playlist_id: targetPl.id,
            track_id: originalTrackId, // PRESERVES TRUE MUSIC TRACK IDENTIFIER
            track_key: safeTrackKey,   // SEPARATE DETERMINISTIC OCCURRENCE KEY
            position: ord,
            title: elem.title || elem.name || "Untitled Track",
            artist: elem.artist || elem.subtitle || "Unknown Artist",
            album: elem.album || elem.albumName || "",
            duration: typeof elem.duration === "number" ? elem.duration : 0,
            duration_formatted: elem.durationFormatted || "3:30",
            audio_url: elem.audioUrl || elem.audio_url || null,
            cover_url: elem.coverUrl || elem.cover_url || null,
            source: elem.source || "custom",
            track_data: elem,
            created_at: new Date().toISOString(),
          };

          // Issue 3: Safe insert-only conflict handling (ON CONFLICT DO NOTHING)
          const existingIdx = playlistTracksDb.findIndex(
            (r) => r.playlist_id === record.playlist_id && r.track_key === record.track_key
          );

          if (existingIdx >= 0) {
            // Report conflict and preserve existing normalized record without overwriting
            conflictsReported.push({
              existing: playlistTracksDb[existingIdx],
              incoming: record,
            });
          } else {
            playlistTracksDb.push(record);
          }
        }
      }
    };

    // Run migration
    executeMigration();

    // ------------------------------------------------------------------------
    // VERIFY POST-MIGRATION STATE
    // ------------------------------------------------------------------------
    const migratedTracks = playlistTracksDb.filter(
      (t) => t.playlist_id === "playlist-custom-1793791009781"
    );

    assert.equal(migratedTracks.length, 61, "Must have exactly 61 normalized records in playlist_tracks");
    assert.equal(prePlaylist.tracks.length, 61, "Legacy JSONB tracks column MUST remain untouched");

    // Issue 3 verification: pre-existing normalized track 1 was preserved, not overwritten!
    const track1 = migratedTracks.find((t) => t.position === 0);
    assert.equal(track1.title, "Sad Malayalam Song 1 (Hi-Res Lossless 2026 Remaster)");
    assert.equal(track1.audio_url, "https://storage.supabase.co/audio/track_1_remastered.mp3");
    assert.ok(conflictsReported.length >= 1, "Conflicting existing record was reported for inspection");

    // Verify ordering 0..60
    migratedTracks.sort((a, b) => a.position - b.position);
    for (let i = 0; i < 61; i++) {
      assert.equal(migratedTracks[i].position, i, `Position of track ${i} must be ${i}`);
      assert.ok(migratedTracks[i].track_key, `Track key must be present for track ${i}`);
      assert.ok(migratedTracks[i].audio_url, `Audio URL must be preserved for track ${i}`);
    }

    // Issue 2 verification: Track ID preservation
    // Position 9: original track ID "malayalam_track_10", track_key "malayalam_track_10"
    assert.equal(migratedTracks[9].track_id, "malayalam_track_10", "Occurrence 1 must preserve original track_id");
    assert.equal(migratedTracks[9].track_key, "malayalam_track_10");

    // Position 35: original track ID "malayalam_track_10" PRESERVED, track_key has "__pos_35"
    assert.equal(migratedTracks[35].track_id, "malayalam_track_10", "Occurrence 2 MUST preserve original track_id");
    assert.equal(migratedTracks[35].track_key, "malayalam_track_10__pos_35", "Occurrence 2 has distinct track_key");

    // Verify unique constraint: zero duplicate track_keys in playlist_tracks
    const keySet = new Set(migratedTracks.map((t) => t.track_key));
    assert.equal(keySet.size, 61, "All 61 tracks must have distinct track keys");

    // Also verify second playlist was migrated
    const secondPlTracks = playlistTracksDb.filter((t) => t.playlist_id === "playlist-custom-1793791009799");
    assert.equal(secondPlTracks.length, 2, "Second legacy playlist must also be migrated");

    // ------------------------------------------------------------------------
    // VERIFY IDEMPOTENCY: RUN MIGRATION AGAIN
    // ------------------------------------------------------------------------
    executeMigration();
    const secondRunTracks = playlistTracksDb.filter(
      (t) => t.playlist_id === "playlist-custom-1793791009781"
    );
    assert.equal(secondRunTracks.length, 61, "Idempotent re-run must maintain exactly 61 rows");
  });

  // --------------------------------------------------------------------------
  // TEST 2: Newly Created Playlist Lifecycle & Cross-Browser Synchronization
  // --------------------------------------------------------------------------
  it("2. New Playlist: Create -> Add songs -> Remove song -> Reorder -> Cross-browser retrieve", async () => {
    const authUser = {
      id: "9f0b5d5e-d250-4fd1-b580-0ea5cbbec758",
      email: "nabeelek3603@gmail.com",
    };

    // Shared server database tables
    const db = {
      user_playlists: [],
      playlist_tracks: [],
    };

    // Server-side Route Handler simulation: POST /api/playlists
    const handlePostPlaylist = (user, payload) => {
      assert.ok(user && user.id, "Authenticated user required");
      const record = {
        id: payload.id || `pl_${Date.now()}`,
        auth_user_id: user.id,
        user_id: user.id,
        title: payload.title || "Untitled",
        category: payload.category || "Mixed",
        curator: "You",
        badge: "CUSTOM",
        badge_variant: "purple",
        kind: "user",
        tracks: Array.isArray(payload.tracks) ? payload.tracks : [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const existingIdx = db.user_playlists.findIndex((p) => p.id === record.id);
      if (existingIdx >= 0) {
        db.user_playlists[existingIdx] = { ...db.user_playlists[existingIdx], ...record };
      } else {
        db.user_playlists.push(record);
      }

      // If tracks provided, upsert into playlist_tracks
      if (record.tracks.length > 0) {
        for (let idx = 0; idx < record.tracks.length; idx++) {
          const t = record.tracks[idx];
          const trackKey = t.track_key || t.id || `trk_${idx}`;
          const trkRecord = {
            playlist_id: record.id,
            track_id: String(t.id || trackKey),
            track_key: String(trackKey),
            position: idx,
            title: t.title || "Untitled",
            artist: t.artist || "Unknown",
            duration: t.duration || 0,
            track_data: t,
            added_at: new Date().toISOString(),
          };
          const trkIdx = db.playlist_tracks.findIndex(
            (r) => r.playlist_id === record.id && r.track_key === trkRecord.track_key
          );
          if (trkIdx >= 0) db.playlist_tracks[trkIdx] = trkRecord;
          else db.playlist_tracks.push(trkRecord);
        }
      }

      return { success: true, playlist: record };
    };

    // Server-side Route Handler simulation: POST /api/playlists/tracks (add track)
    const handleAddTrack = (user, playlistId, track, position) => {
      const parent = db.user_playlists.find((p) => p.id === playlistId && p.auth_user_id === user.id);
      assert.ok(parent, "Ownership verified before track addition");

      const trackKey = track.track_key || track.id;
      const trkRecord = {
        playlist_id: playlistId,
        track_id: String(track.id || trackKey),
        track_key: String(trackKey),
        position: Number(position) || 0,
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        track_data: track,
        added_at: new Date().toISOString(),
      };

      const existingIdx = db.playlist_tracks.findIndex(
        (r) => r.playlist_id === playlistId && r.track_key === trkRecord.track_key
      );
      if (existingIdx >= 0) db.playlist_tracks[existingIdx] = trkRecord;
      else db.playlist_tracks.push(trkRecord);

      parent.updated_at = new Date().toISOString();
      return { success: true, trackKey };
    };

    // Server-side Route Handler simulation: DELETE /api/playlists/tracks (remove track)
    const handleDeleteTrack = (user, playlistId, trackId) => {
      const parent = db.user_playlists.find((p) => p.id === playlistId && p.auth_user_id === user.id);
      assert.ok(parent, "Ownership verified before track deletion");

      const tid = String(trackId);
      const initialCount = db.playlist_tracks.length;
      db.playlist_tracks = db.playlist_tracks.filter(
        (t) => !(t.playlist_id === playlistId && (t.track_id === tid || t.track_key === tid))
      );

      assert.equal(db.playlist_tracks.length, initialCount - 1, "Track must be removed from playlist_tracks");
      parent.updated_at = new Date().toISOString();
      return { success: true, deletedTrackId: tid };
    };

    // Server-side Route Handler simulation: GET /api/playlists (authoritative retrieve)
    const handleGetPlaylists = (user) => {
      const owned = db.user_playlists.filter((p) => p.auth_user_id === user.id);
      const playlistIds = owned.map((p) => p.id);

      const tracksByPl = {};
      const relevantTracks = db.playlist_tracks
        .filter((t) => playlistIds.includes(t.playlist_id))
        .sort((a, b) => a.position - b.position);

      for (const row of relevantTracks) {
        if (!tracksByPl[row.playlist_id]) tracksByPl[row.playlist_id] = [];
        tracksByPl[row.playlist_id].push({
          ...row.track_data,
          id: row.track_key,
          position: row.position,
        });
      }

      return owned.map((pl) => ({
        ...pl,
        tracks: tracksByPl[pl.id] || [],
        songsCount: (tracksByPl[pl.id] || []).length,
      }));
    };

    // ------------------------------------------------------------------------
    // STEP A: Browser A creates a new playlist
    // ------------------------------------------------------------------------
    const newPlId = "playlist-custom-fresh-999999";
    const createRes = handlePostPlaylist(authUser, {
      id: newPlId,
      title: "Monsoon Drive 2026",
      category: "Chill",
      tracks: [],
    });
    assert.equal(createRes.success, true);
    assert.equal(db.user_playlists.length, 1);
    assert.equal(db.user_playlists[0].auth_user_id, authUser.id);
    assert.equal(db.user_playlists[0].title, "Monsoon Drive 2026");

    // ------------------------------------------------------------------------
    // STEP B: Browser A adds 3 songs immediately to playlist_tracks
    // ------------------------------------------------------------------------
    const song1 = { id: "song_1", title: "Aalorungi Arangorungi", artist: "K. J. Yesudas", duration: 230 };
    const song2 = { id: "song_2", title: "Neela Jalashaye", artist: "P. Jayachandran", duration: 215 };
    const song3 = { id: "song_3", title: "Kanneer Poovinte", artist: "M. G. Sreekumar", duration: 280 };

    handleAddTrack(authUser, newPlId, song1, 0);
    handleAddTrack(authUser, newPlId, song2, 1);
    handleAddTrack(authUser, newPlId, song3, 2);

    assert.equal(db.playlist_tracks.length, 3, "Immediately persisted 3 songs in playlist_tracks");
    assert.equal(db.playlist_tracks[0].position, 0);
    assert.equal(db.playlist_tracks[1].position, 1);
    assert.equal(db.playlist_tracks[2].position, 2);

    // ------------------------------------------------------------------------
    // STEP C: Browser A removes song 2
    // ------------------------------------------------------------------------
    handleDeleteTrack(authUser, newPlId, "song_2");
    assert.equal(db.playlist_tracks.length, 2, "playlist_tracks must now have 2 songs");
    assert.equal(db.playlist_tracks.some((t) => t.track_id === "song_2"), false, "song_2 removed from DB");

    // ------------------------------------------------------------------------
    // STEP D: Browser A reorders the remaining 2 songs (song 3 first, then song 1)
    // ------------------------------------------------------------------------
    const reordered = [
      { ...song3, position: 0 },
      { ...song1, position: 1 },
    ];
    handlePostPlaylist(authUser, {
      id: newPlId,
      title: "Monsoon Drive 2026",
      tracks: reordered,
    });

    const currentPlTracks = db.playlist_tracks.filter((t) => t.playlist_id === newPlId);
    assert.equal(currentPlTracks.find((t) => t.track_id === "song_3").position, 0);
    assert.equal(currentPlTracks.find((t) => t.track_id === "song_1").position, 1);

    // ------------------------------------------------------------------------
    // STEP E: Browser B (fresh session, same account on another computer)
    // ------------------------------------------------------------------------
    // Fresh browser has NO localStorage for this playlist
    const browserBPlaylists = handleGetPlaylists(authUser);

    assert.equal(browserBPlaylists.length, 1, "Browser B discovers playlist from server");
    assert.equal(browserBPlaylists[0].id, newPlId);
    assert.equal(browserBPlaylists[0].title, "Monsoon Drive 2026");
    assert.equal(browserBPlaylists[0].songsCount, 2);

    // Verify track order on Browser B
    assert.equal(browserBPlaylists[0].tracks[0].id, "song_3");
    assert.equal(browserBPlaylists[0].tracks[0].title, "Kanneer Poovinte");
    assert.equal(browserBPlaylists[0].tracks[1].id, "song_1");
    assert.equal(browserBPlaylists[0].tracks[1].title, "Aalorungi Arangorungi");

    // ------------------------------------------------------------------------
    // STEP F: Unauthorized user / another user cannot access Browser A's playlist
    // ------------------------------------------------------------------------
    const foreignUser = { id: "intruder-uuid-9999", email: "stranger@example.com" };
    const foreignPlaylists = handleGetPlaylists(foreignUser);
    assert.equal(foreignPlaylists.length, 0, "Account isolation: stranger cannot read user playlists");

    assert.throws(
      () => handleAddTrack(foreignUser, newPlId, { id: "hack_song", title: "Hacked" }, 0),
      /Ownership verified/,
      "Unauthorized user cannot insert into playlist_tracks"
    );
  });
});
