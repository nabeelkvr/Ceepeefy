import { NextResponse } from "next/server";
import { getSpotifyPlaylistMetadata, parseSpotifyPlaylistId } from "../../../../services/spotifyPlaylistService.js";
import {
  diffSpotifyPlaylist,
  buildSnapshotFromExistingPlaylist,
} from "../../../../services/spotifySyncService.js";
import { matchSingleTrack } from "../../../../services/spotifyMatcherService.js";

/**
 * Route handler for Spotify Playlist Sync.
 * Supports:
 * - POST: Diff comparison, candidate matching for newly added tracks, preview plan generation.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      spotifyId,
      playlistUrl,
      currentSnapshot,
      existingTracks = [],
    } = body;

    const targetId = spotifyId || parseSpotifyPlaylistId(playlistUrl);
    if (!targetId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing Spotify playlist ID or valid link.",
          code: "INVALID_SPOTIFY_ID",
        },
        { status: 400 }
      );
    }

    // 1. Fetch current Spotify playlist data using official API / fallback
    console.log(`[Spotify Sync Route] Fetching latest Spotify playlist: ${targetId}`);
    const spotifyRes = await getSpotifyPlaylistMetadata(targetId);

    if (!spotifyRes.success || !spotifyRes.playlist) {
      return NextResponse.json(
        {
          success: false,
          error:
            spotifyRes.error ||
            "Unable to access Spotify playlist. The playlist might be private, deleted, or network issues occurred.",
          code: spotifyRes.code || "PLAYLIST_UNAVAILABLE",
        },
        { status: 404 }
      );
    }

    const currentSpotifyTracks = spotifyRes.playlist.tracks || [];

    // 2. Resolve baseline snapshot
    let baselineSnapshot = Array.isArray(currentSnapshot) && currentSnapshot.length > 0
      ? currentSnapshot
      : buildSnapshotFromExistingPlaylist({ tracks: existingTracks });

    // 3. Diff current Spotify tracks against last synced snapshot
    const diff = diffSpotifyPlaylist(
      baselineSnapshot,
      currentSpotifyTracks,
      existingTracks
    );

    // If completely up to date, return early without touching JioSaavn search
    if (diff.isUpToDate) {
      return NextResponse.json({
        success: true,
        isUpToDate: true,
        message: "Your playlist is already up to date.",
        summary: diff.summary,
        spotifyMetadata: {
          id: spotifyRes.playlist.id,
          name: spotifyRes.playlist.name,
          snapshotId: spotifyRes.playlist.snapshotId || null,
          totalTracks: spotifyRes.playlist.totalTracks,
        },
      });
    }

    // 4. For newly added tracks ONLY: Run intelligent JioSaavn matcher
    // Bounded concurrency (limit 3)
    const addedMatches = [];
    const concurrency = 3;
    let cursor = 0;

    async function matchWorker() {
      while (cursor < diff.added.length) {
        const item = diff.added[cursor++];
        try {
          const matchResult = await matchSingleTrack(item.newItem);
          addedMatches.push({
            sourceEntryId: item.sourceEntryId,
            spotifyTrack: item.newItem,
            targetIndex: item.targetIndex,
            status: matchResult.status, // "matched" | "review" | "unmatched"
            score: matchResult.score || 0,
            matchedTrack: matchResult.matchedTrack,
            alternatives: matchResult.alternatives || [],
          });
        } catch (mErr) {
          console.warn("[Spotify Sync Route] Match error for added track:", mErr);
          addedMatches.push({
            sourceEntryId: item.sourceEntryId,
            spotifyTrack: item.newItem,
            targetIndex: item.targetIndex,
            status: "unmatched",
            score: 0,
            matchedTrack: null,
            alternatives: [],
          });
        }
      }
    }

    const workers = [];
    for (let w = 0; w < Math.min(concurrency, diff.added.length); w++) {
      workers.push(matchWorker());
    }
    await Promise.all(workers);

    // Sort addedMatches in order of targetIndex to maintain relative positions
    addedMatches.sort((a, b) => a.targetIndex - b.targetIndex);

    const highConfidenceMatchesCount = addedMatches.filter((m) => m.status === "matched").length;
    const reviewMatchesCount = addedMatches.filter((m) => m.status === "review").length;
    const unmatchedCount = addedMatches.filter((m) => m.status === "unmatched").length;

    return NextResponse.json({
      success: true,
      isUpToDate: false,
      summary: {
        ...diff.summary,
        matchedAddedCount: highConfidenceMatchesCount,
        reviewAddedCount: reviewMatchesCount,
        unmatchedAddedCount: unmatchedCount,
      },
      diff: {
        added: diff.added,
        removed: diff.removed,
        reordered: diff.reordered,
        unchanged: diff.unchanged,
        manualTracks: diff.manualTracks,
        prevItems: diff.prevItems || [],
        newItems: diff.newItems || [],
      },
      addedMatches,
      spotifyMetadata: {
        id: spotifyRes.playlist.id,
        name: spotifyRes.playlist.name,
        snapshotId: spotifyRes.playlist.snapshotId || null,
        totalTracks: spotifyRes.playlist.totalTracks,
      },
    });
  } catch (err) {
    console.error("[Spotify Sync Route] Unhandled exception:", err);
    return NextResponse.json(
      {
        success: false,
        error: "An unexpected error occurred while syncing with Spotify. Please try again.",
        code: "SERVER_ERROR",
      },
      { status: 500 }
    );
  }
}
