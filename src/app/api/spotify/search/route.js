import { NextResponse } from "next/server";
import { searchSpotifyCatalog } from "../../../../lib/spotify";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query")?.trim() || searchParams.get("q")?.trim() || "";
    const rawMarket = searchParams.get("market")?.trim() || process.env.SPOTIFY_MARKET?.trim() || "IN";
    const market = /^[A-Z]{2}$/i.test(rawMarket) ? rawMarket.toUpperCase() : "IN";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10) || 20, 1), 50);

    if (!query) {
      return NextResponse.json({
        success: true,
        query: "",
        market,
        artists: [],
        playlists: [],
      });
    }

    const { artists, playlists } = await searchSpotifyCatalog(query, market, limit);

    return NextResponse.json({
      success: true,
      query,
      market,
      artists: artists || [],
      playlists: playlists || [],
    });
  } catch (err) {
    console.error("[Spotify API] Search error:", err?.message || err);
    // Graceful error response: Never throw 500 or break client search
    return NextResponse.json(
      {
        success: false,
        error: "Spotify search unavailable",
        artists: [],
        playlists: [],
      },
      { status: 200 }
    );
  }
}
