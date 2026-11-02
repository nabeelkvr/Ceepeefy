import { NextResponse } from "next/server";
import {
  getUserPlaylists,
  getDeletedPlaylistIds,
  saveUserPlaylist,
  deleteUserPlaylist,
  syncUserPlaylists,
  serverSupabase,
} from "../../../server/playlistStorage.js";
import {
  verifySessionToken,
  SESSION_COOKIE_NAME,
  OWNER_USERNAME,
} from "../../../server/auth.js";

/**
 * Resolves user ID from session cookie or request payload/params
 * Defaults always to single account "nabeeyl"
 */
function resolveUserId(request, bodyOrParamUserId = null) {
  if (bodyOrParamUserId && typeof bodyOrParamUserId === "string" && bodyOrParamUserId.trim()) {
    return bodyOrParamUserId.trim().toLowerCase();
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (sessionCookie) {
    const session = verifySessionToken(sessionCookie);
    if (session?.username) {
      return session.username.trim().toLowerCase();
    }
  }

  return (OWNER_USERNAME || "nabeeyl").toLowerCase();
}

/**
 * GET /api/playlists?userId=...
 * Retrieves all playlists and deleted playlist IDs for the user
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedUser = searchParams.get("userId") || searchParams.get("user_id");
    const userId = resolveUserId(request, requestedUser);

    let playlists = getUserPlaylists(userId);
    const deletedPlaylistIds = getDeletedPlaylistIds(userId);

    // If local store is empty and Supabase is configured, restore from Supabase
    if ((!playlists || playlists.length === 0) && serverSupabase) {
      try {
        const { data: supaPlaylists } = await serverSupabase
          .from("user_playlists")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (Array.isArray(supaPlaylists) && supaPlaylists.length > 0) {
          const synced = syncUserPlaylists(userId, supaPlaylists);
          playlists = synced.playlists;
        }
      } catch (supaErr) {
        console.warn("[Playlists API] Supabase query notice:", supaErr?.message || supaErr);
      }
    }

    return NextResponse.json({
      success: true,
      userId,
      count: playlists.length,
      playlists,
      deletedPlaylistIds,
    });
  } catch (err) {
    console.error("[Playlists API] GET error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch playlists." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/playlists
 * Saves or updates a single playlist for the user
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { playlist, userId: bodyUserId } = body;

    if (!playlist || !playlist.id) {
      return NextResponse.json(
        { success: false, error: "Playlist data with a valid ID is required." },
        { status: 400 }
      );
    }

    const userId = resolveUserId(request, bodyUserId || playlist.user_id || playlist.userId);
    const saved = saveUserPlaylist(userId, playlist);

    return NextResponse.json({
      success: true,
      userId,
      playlist: saved,
    });
  } catch (err) {
    console.error("[Playlists API] POST error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to save playlist." },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/playlists
 * Bulk migration / multi-device synchronization of playlists
 */
export async function PUT(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { playlists, userId: bodyUserId } = body;

    if (!Array.isArray(playlists)) {
      return NextResponse.json(
        { success: false, error: "An array of playlists is required." },
        { status: 400 }
      );
    }

    const userId = resolveUserId(request, bodyUserId);
    const syncResult = syncUserPlaylists(userId, playlists);

    return NextResponse.json({
      success: true,
      userId,
      count: syncResult.count,
      playlists: syncResult.playlists,
      deletedPlaylistIds: syncResult.deletedPlaylistIds,
    });
  } catch (err) {
    console.error("[Playlists API] PUT error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to sync playlists." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/playlists?id=...&userId=...
 * Deletes a playlist for the user
 */
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const requestedUser = searchParams.get("userId") || searchParams.get("user_id");

    let playlistId = id;
    let explicitUser = requestedUser;

    if (!playlistId) {
      const body = await request.json().catch(() => ({}));
      playlistId = body.id || body.playlistId;
      explicitUser = body.userId || body.user_id || explicitUser;
    }

    if (!playlistId) {
      return NextResponse.json(
        { success: false, error: "Playlist ID is required for deletion." },
        { status: 400 }
      );
    }

    const userId = resolveUserId(request, explicitUser);
    const deleted = deleteUserPlaylist(userId, playlistId);

    return NextResponse.json({
      success: deleted,
      userId,
      deletedId: playlistId,
    });
  } catch (err) {
    console.error("[Playlists API] DELETE error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to delete playlist." },
      { status: 500 }
    );
  }
}
