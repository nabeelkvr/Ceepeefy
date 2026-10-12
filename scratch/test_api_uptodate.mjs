async function testUpToDate() {
  console.log("Testing POST /api/spotify/sync with matching snapshot (Up-to-date scenario)...");

  // First fetch the tracks from the playlist
  const res1 = await fetch("http://localhost:3000/api/spotify/playlist?id=37i9dQZF1DXcBWIGoYBM5M");
  const data1 = await res1.json();
  if (!data1.success) throw new Error("Failed to fetch playlist");

  const spotifyTracks = data1.playlist.tracks;
  console.log(`Fetched ${spotifyTracks.length} tracks.`);

  // Build a matching snapshot
  const occMap = new Map();
  const snapshot = spotifyTracks.map((t, idx) => {
    const occ = occMap.get(t.spotifyId) || 0;
    occMap.set(t.spotifyId, occ + 1);
    return {
      sourceEntryId: `sp_${t.spotifyId}#${occ}`,
      fingerprint: `sp_${t.spotifyId}`,
      occurrenceIndex: occ,
      spotifyId: t.spotifyId,
      name: t.name,
      primaryArtist: t.primaryArtist,
      jioTrackId: `mock_jio_${idx}`,
      status: "matched",
    };
  });

  const existingTracks = snapshot.map((s, idx) => ({
    id: s.jioTrackId,
    title: s.name,
    artist: s.primaryArtist,
    spotifyId: s.spotifyId,
    sourceEntryId: s.sourceEntryId,
    isSpotifyTrack: true,
  }));

  // Now call sync with this snapshot
  const res2 = await fetch("http://localhost:3000/api/spotify/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      spotifyId: "37i9dQZF1DXcBWIGoYBM5M",
      currentSnapshot: snapshot,
      existingTracks: existingTracks,
    }),
  });

  const data2 = await res2.json();
  console.log("Up-to-date Response:", data2);
  if (!data2.isUpToDate) throw new Error("Expected isUpToDate to be true");
  if (data2.message !== "Your playlist is already up to date.") {
    throw new Error(`Unexpected message: ${data2.message}`);
  }
  console.log("✅ Up-to-date scenario verified successfully!");
}

testUpToDate().catch(console.error);
