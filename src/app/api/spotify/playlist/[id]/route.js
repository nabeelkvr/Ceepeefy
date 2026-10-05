import { NextResponse } from "next/server";
import { getSpotifyPlaylist } from "../../../../../lib/spotify";

export async function GET(request, context) {
  try {
    const resolvedParams = context?.params instanceof Promise ? await context.params : context?.params;
    const playlistId = resolvedParams?.id?.trim();

    if (!playlistId) {
      return NextResponse.json(
        {
          success: false,
          error: "Playlist ID is required",
          tracks: [],
          tracksAvailable: false,
        },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const market = searchParams.get("market")?.trim() || process.env.SPOTIFY_MARKET || "IN";

    const data = await getSpotifyPlaylist(playlistId, market);

    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (err) {
    console.error("[Spotify API] Playlist error:", err);
    // Graceful error response: Never throw 500 or crash client
    return NextResponse.json(
      {
        success: false,
        error: "Spotify playlist unavailable",
        id: "",
        name: "Spotify Playlist",
        artwork: null,
        curator: "Spotify",
        spotifyUrl: "https://open.spotify.com",
        totalCount: 0,
        tracksAvailable: false,
        tracks: [],
        items: [],
      },
      { status: 200 }
    );
  }
}
