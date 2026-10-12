import { NextResponse } from "next/server";
import {
  parseSpotifyPlaylistId,
  getSpotifyPlaylistMetadata,
  parseTextTracklist,
} from "../../../../services/spotifyPlaylistService";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const input = searchParams.get("url") || searchParams.get("id");

    if (!input) {
      return NextResponse.json(
        { success: false, error: "Missing Spotify playlist URL or ID." },
        { status: 400 }
      );
    }

    const playlistId = parseSpotifyPlaylistId(input);
    if (!playlistId) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid Spotify playlist link. Please enter a valid playlist URL (e.g. https://open.spotify.com/playlist/...)",
          code: "INVALID_URL",
        },
        { status: 400 }
      );
    }

    const result = await getSpotifyPlaylistMetadata(playlistId);
    if (!result.success) {
      return NextResponse.json(result, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[Spotify Playlist Route] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to retrieve Spotify playlist. Please check the URL or try pasting track names.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { url, id, rawText, playlistName } = body;

    // Handle manual tracklist fallback
    if (rawText && typeof rawText === "string") {
      const parsed = parseTextTracklist(rawText, playlistName);
      if (!parsed) {
        return NextResponse.json(
          { success: false, error: "No valid tracks found in text." },
          { status: 400 }
        );
      }
      return NextResponse.json(parsed);
    }

    const input = url || id;
    if (!input) {
      return NextResponse.json(
        { success: false, error: "Missing Spotify playlist link or tracklist." },
        { status: 400 }
      );
    }

    const playlistId = parseSpotifyPlaylistId(input);
    if (!playlistId) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid Spotify playlist link. Please enter a valid playlist URL.",
          code: "INVALID_URL",
        },
        { status: 400 }
      );
    }

    const result = await getSpotifyPlaylistMetadata(playlistId);
    if (!result.success) {
      return NextResponse.json(result, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[Spotify Playlist Route POST] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to retrieve Spotify playlist.",
      },
      { status: 500 }
    );
  }
}
