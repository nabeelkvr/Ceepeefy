import { NextResponse } from "next/server";
import { transliterateSynchronizedLyrics } from "../../../../../services/lyrics/lyricsTransliterationEngine.js";

/**
 * POST /api/audio/lyrics/transliterate
 *
 * Dedicated endpoint for transliterating synchronized lyrics with
 * temperature 0, chunking, strict validation, auto-retry of failed lines,
 * and zero-drift timestamp preservation.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      lines = [],
      language = "malayalam",
      songId = "default_song",
      chunkSize = 20,
      bypassCache = false,
    } = body;

    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Payload must include a non-empty 'lines' array",
          lines: [],
        },
        { status: 400 }
      );
    }

    const result = await transliterateSynchronizedLyrics(lines, {
      language,
      songId,
      chunkSize,
      bypassCache,
    });

    return NextResponse.json({
      success: true,
      songId,
      language,
      count: result.lines.length,
      lines: result.lines,
      metrics: result.metrics,
    });
  } catch (error) {
    console.error("[Transliterate API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to transliterate lyrics",
      },
      { status: 500 }
    );
  }
}

