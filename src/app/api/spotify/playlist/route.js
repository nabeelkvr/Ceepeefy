import { NextResponse } from "next/server";
import { getSpotifyPlaylist } from "../../../../lib/spotify";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const playlistId = (searchParams.get("id") || searchParams.get("playlistId"))?.trim();
    const market = searchParams.get("market")?.trim() || process.env.SPOTIFY_MARKET || "IN";

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

    const data = await getSpotifyPlaylist(playlistId, market);

    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (err) {
    console.error("[Spotify API] Playlist error:", err);
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
