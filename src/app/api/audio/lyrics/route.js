import { NextResponse } from "next/server";
import { lyricsService } from "../../../../services/lyrics/lyricsService.js";
import { parseDurationSec } from "../../../../services/lyrics/songMatcher.js";

/**
 * GET /api/audio/lyrics
 *
 * Centralized Multilingual, Multi-Provider Lyrics Endpoint
 *
 * Parameters:
 * - id: Track ID
 * - track / title: Song title
 * - artist: Artist name
 * - album: Album or movie name
 * - duration: Track duration in seconds
 * - language: Track language (e.g. malayalam, tamil, hindi, etc.)
 * - provider: Optional provider override ('jiosaavn', 'lrclib', 'musixmatch', 'mock')
 * - refresh: 'true' to bypass existing cache
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim() || "";
    const title = (searchParams.get("track") || searchParams.get("title") || "").trim();
    const artist = searchParams.get("artist")?.trim() || "";
    const album = (searchParams.get("album") || searchParams.get("movie") || "").trim();
    const duration = parseDurationSec(searchParams.get("duration"));
    const language = (searchParams.get("language") || "").toLowerCase().trim();
    const provider = searchParams.get("provider")?.toLowerCase().trim() || null;
    const bypassCache = searchParams.get("refresh") === "true";

    const trackSeed = {
      id,
      title,
      artist,
      album,
      duration,
      language,
    };

    const result = await lyricsService.getLyrics(trackSeed, {
      provider,
      bypassCache,
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": bypassCache
          ? "no-cache, no-store, must-revalidate"
          : result.success
          ? "public, max-age=3600, s-maxage=86400"
          : "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err) {
    console.error("[Lyrics API] Unhandled GET error:", err);
    return NextResponse.json(
      {
        success: false,
        provider: "none",
        synced: false,
        lines: [],
        lyrics: [],
        message: "Internal error processing lyrics request",
        rejectionReason: err.message,
      },
      { status: 200 } // Graceful fallback 200 with success: false
    );
  }
}
