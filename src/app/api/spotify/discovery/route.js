import { NextResponse } from "next/server";
import { getSpotifyDiscovery } from "../../../../lib/spotify";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const market = searchParams.get("market")?.trim() || process.env.SPOTIFY_MARKET || "IN";

    const { artists, playlists } = await getSpotifyDiscovery(market);

    return NextResponse.json({
      success: true,
      market,
      artists: artists || [],
      playlists: playlists || [],
    });
  } catch (err) {
    console.error("[Spotify API] Discovery error:", err);
    // Graceful error response: Never throw 500 or break client
    return NextResponse.json(
      {
        success: false,
        error: "Spotify discovery unavailable",
        artists: [],
        playlists: [],
      },
      { status: 200 }
    );
  }
}
