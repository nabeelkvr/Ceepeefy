import { NextResponse } from "next/server";
import {
  matchPlaylistTracks,
  matchSingleTrack,
  searchJioSaavnCandidates,
} from "../../../../services/spotifyMatcherService";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tracks, track } = body;

    // Single track match (e.g. retry)
    if (track) {
      const singleResult = await matchSingleTrack(track);
      return NextResponse.json({
        success: true,
        result: {
          spotifyTrack: track,
          status: singleResult.status,
          score: singleResult.score,
          matchedTrack: singleResult.matchedTrack,
          alternatives: singleResult.alternatives,
        },
      });
    }

    // Playlist tracks batch match
    if (!Array.isArray(tracks) || tracks.length === 0) {
      return NextResponse.json(
        { success: false, error: "No tracks provided for matching." },
        { status: 400 }
      );
    }

    // Process matching with concurrency
    const matches = await matchPlaylistTracks(tracks);

    const summary = {
      total: matches.length,
      matched: matches.filter((m) => m.status === "matched").length,
      review: matches.filter((m) => m.status === "review").length,
      unmatched: matches.filter((m) => m.status === "unmatched").length,
    };

    return NextResponse.json({
      success: true,
      summary,
      matches,
    });
  } catch (err) {
    console.error("[Spotify Match Route] Error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to match tracks." },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || searchParams.get("query");

    if (!query || !query.trim()) {
      return NextResponse.json(
        { success: false, candidates: [] },
        { status: 400 }
      );
    }

    const candidates = await searchJioSaavnCandidates(query.trim());
    return NextResponse.json({
      success: true,
      candidates,
    });
  } catch (err) {
    console.error("[Spotify Match Search] Error:", err);
    return NextResponse.json(
      { success: false, candidates: [] },
      { status: 500 }
    );
  }
}
