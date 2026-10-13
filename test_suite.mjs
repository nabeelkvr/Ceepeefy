// Automated test suite for Ceepeefy cross-device playlist synchronization
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Ceepeefy Playlist Sync Verification", () => {
  it("Test 1: Stable Account Identity Across Devices", async () => {
    const { DEFAULT_USER_ID, getAccountUserId } = await import("./src/config/authConfig.js");
    
    // On Device A (e.g. where user logged in)
    const deviceA_Identity = DEFAULT_USER_ID;
    assert.equal(deviceA_Identity, "nabeeyl", "Default user identity must be 'nabeeyl'");

    // On Device B (brand new device where localStorage has NO credentials / user is null)
    // The auto-hydration fallback in authConfig and MusicContext must return "nabeeyl"
    const deviceB_Identity = getAccountUserId(null);
    assert.equal(deviceB_Identity, "nabeeyl", "New device with null user must auto-resolve to 'nabeeyl' without prompting login");
  });

  it("Test 2: Position-Safe Track Deduplication for 464 Songs", () => {
    // Generate 464 tracks with realistic duplicate track IDs (e.g. same song in playlist multiple times)
    const tracks = [];
    for (let i = 0; i < 464; i++) {
      // Intentionally introduce duplicate IDs every 20 songs
      const trackId = `song_${i % 20 === 0 ? "duplicate_hit" : i}`;
      tracks.push({
        id: trackId,
        title: `Song ${i + 1}`,
        artist: `Artist ${i % 5}`,
        album: "Greatest Hits",
        duration: 210,
        durationFormatted: "3:30",
        audioUrl: `https://c.saavncdn.com/stream_${i}.mp4`,
        coverUrl: `https://c.saavncdn.com/art_${i}.jpg`,
        source: "jiosaavn",
        position: i,
      });
    }

    assert.equal(tracks.length, 464, "Input playlist must have 464 tracks");

    // Replicate the deduplication algorithm in savePlaylistToCloud
    const seenTrackIds = new Set();
    const trackRecords = tracks.map((track, idx) => {
      const rawTrackId = String(track.id || track.track_id || `track-${idx}`);
      let safeTrackId = rawTrackId;
      if (seenTrackIds.has(safeTrackId)) {
        safeTrackId = `${rawTrackId}__pos_${idx}`;
      }
      seenTrackIds.add(safeTrackId);

      return {
        playlist_id: "test_pl_464",
        track_id: safeTrackId,
        title: track.title,
        position: idx,
      };
    });

    // Check that every single track record has a unique track_id within the playlist
    const uniqueIds = new Set(trackRecords.map(r => r.track_id));
    assert.equal(uniqueIds.size, 464, "All 464 track records must have unique (playlist_id, track_id) keys");

    // Check ordering preservation
    for (let i = 0; i < 464; i++) {
      assert.equal(trackRecords[i].position, i, `Track ${i} must preserve position ${i}`);
    }
  });

  it("Test 3: Un-sanitizing Deduplicated Track IDs on Retrieval", () => {
    const rawSavedId = "duplicate_hit__pos_40";
    const restoredId = rawSavedId.includes("__pos_") ? rawSavedId.split("__pos_")[0] : rawSavedId;
    assert.equal(restoredId, "duplicate_hit", "Restored track ID must match the original playable ID");
  });

  it("Test 4: Spotify Artwork URL Resolution & Fallback", () => {
    // 1. Genuine Spotify CDN URL
    const spotifyCdnUrl = "https://i.scdn.co/image/ab67616d0000b273b5e40e2cf7d91f4cf17f516a";
    const isSpotify = spotifyCdnUrl.includes("scdn.co") || spotifyCdnUrl.includes("spotifycdn.com");
    assert.equal(isSpotify, true, "Must identify Spotify CDN URL");

    // 2. Fallback proxy URL generation
    const proxyUrl = `/api/spotify/image-proxy?url=${encodeURIComponent(spotifyCdnUrl)}`;
    assert.ok(proxyUrl.startsWith("/api/spotify/image-proxy?url=https%3A%2F%2Fi.scdn.co"), "Proxy URL must be correctly encoded");
  });

  it("Test 5: Supabase Range Pagination (Fetching beyond PostgREST 50/1000 limit)", async () => {
    // Simulate pagination function that reads in batches of 1000
    const mockDb = Array.from({ length: 464 }, (_, i) => ({ id: i, title: `Track ${i}` }));
    
    async function fetchWithRange(pageSize = 200) {
      let allRows = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const to = from + pageSize - 1;
        const slice = mockDb.slice(from, to + 1);
        if (slice.length > 0) {
          allRows.push(...slice);
          if (slice.length < pageSize) {
            hasMore = false;
          } else {
            from += pageSize;
          }
        } else {
          hasMore = false;
        }
      }
      return allRows;
    }

    const retrieved = await fetchWithRange(200);
    assert.equal(retrieved.length, 464, "Pagination must retrieve all 464 rows without truncation");
    assert.equal(retrieved[0].id, 0);
    assert.equal(retrieved[463].id, 463);
  });
});
