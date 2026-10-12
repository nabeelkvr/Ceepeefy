async function run() {
  console.log("Calling POST /api/spotify/sync with mock snapshot...");

  // Send a mock request where playlist has 2 songs, and snapshot has the same 2 songs
  const body = {
    spotifyId: "37i9dQZF1DXcBWIGoYBM5M",
    currentSnapshot: [],
    existingTracks: [],
  };

  const res = await fetch("http://localhost:3000/api/spotify/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  console.log("Status:", res.status, "Success:", data.success);
  if (data.summary) {
    console.log("Summary:", data.summary);
  } else {
    console.log("Message / Error:", data.message || data.error);
  }
}

run().catch(console.error);
