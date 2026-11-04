import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../services/supabaseServer.js";

/**
 * Derives a stable, deterministic track_key from track properties
 */
function deriveStableTrackKey(track) {
  if (!track) return "";
  if (track.track_key) return String(track.track_key);

  const url = track.audioUrl || track.audio_url || "";
  if (url) {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;
      if (pathname) {
        return pathname.replace(/^\/+/, "");
      }
    } catch {}
  }

  const id = track.id || track.track_id || track.spotifyId || "";
  return String(id).replace(/__pos_\d+$/, "");
}

/**
 * Helper to verify that the authenticated user owns the parent playlist
 */
async function verifyPlaylistOwnership(supabase, playlistId, user) {
  const { data: playlist, error } = await supabase
    .from("user_playlists")
    .select("id, auth_user_id, user_id")
    .eq("id", String(playlistId))
    .maybeSingle();

  if (error || !playlist) {
    return { authorized: false, notFound: true };
  }

  // 1. Standard verified ownership: auth_user_id matches authenticated user UUID
  if (playlist.auth_user_id) {
    if (playlist.auth_user_id !== user.id) {
      return { authorized: false, forbidden: true };
    }
    return { authorized: true, playlist };
  }

  // 2. Temporary legacy ownership check: only verified owner account tied to 'nabeeyl'
  const isVerifiedLegacyOwner = user.email === "nabeelek3603@gmail.com" && playlist.user_id === "nabeeyl";
  if (isVerifiedLegacyOwner) {
    return { authorized: true, playlist };
  }

  return { authorized: false, forbidden: true };
}

/**
 * GET /api/playlists/tracks?playlistId=...
 * Retrieves ordered tracks for a single playlist owned by user
 */
export async function GET(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const playlistId = searchParams.get("playlistId");

    if (!playlistId) {
      return NextResponse.json({ success: false, error: "playlistId is required" }, { status: 400 });
    }

    const check = await verifyPlaylistOwnership(supabase, playlistId, user);
    if (!check.authorized) {
      return NextResponse.json(
        { success: false, error: check.forbidden ? "Forbidden" : "Playlist not found" },
        { status: check.forbidden ? 403 : 404 }
      );
    }

    const { data, error } = await supabase
      .from("playlist_tracks")
      .select("*")
      .eq("playlist_id", playlistId)
      .order("position", { ascending: true });

    if (error) {
      console.error("[Playlists Tracks API] GET error:", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const tracks = (data || []).map((row) => {
      const rawData = row.track_data && typeof row.track_data === "object" ? row.track_data : {};
      const trackKey = row.track_key || rawData.id || row.track_id;

      return {
        ...rawData,
        id: trackKey,
        track_key: trackKey,
        position: row.position,
        title: rawData.title || row.title || "Untitled Track",
        artist: rawData.artist || row.artist || "Unknown Artist",
      };
    });

    return NextResponse.json({ success: true, tracks });
  } catch (err) {
    console.error("[Playlists Tracks API] GET exception:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/playlists/tracks
 * Adds a single track or batch-syncs an array of tracks to a playlist
 * Enforces parent playlist ownership before insert/upsert
 */
export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { playlistId, track, tracks, position } = body;

    if (!playlistId) {
      return NextResponse.json({ success: false, error: "playlistId is required" }, { status: 400 });
    }

    const check = await verifyPlaylistOwnership(supabase, playlistId, user);
    if (!check.authorized) {
      return NextResponse.json(
        { success: false, error: check.forbidden ? "Forbidden: You do not own this playlist." : "Playlist not found" },
        { status: check.forbidden ? 403 : 404 }
      );
    }

    // Case 1: Batch sync array of tracks
    if (Array.isArray(tracks)) {
      const records = tracks.map((t, idx) => {
        const trackKey = deriveStableTrackKey(t) || `trk_${idx}`;
        return {
          playlist_id: String(playlistId),
          track_id: String(t.id || trackKey),
          track_key: trackKey,
          position: idx,
          track_data: t,
          added_at: new Date().toISOString(),
        };
      });

      const CHUNK_SIZE = 50;
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        let { error } = await supabase
          .from("playlist_tracks")
          .upsert(chunk, { onConflict: "playlist_id,track_key" });

        if (error && (error.code === "42703" || error.message?.includes("track_key") || error.code === "42P10")) {
          // Fallback for baseline table schema without track_key constraint
          const baselineChunk = chunk.map(({ track_key, ...rest }) => rest);
          for (const item of baselineChunk) {
            await supabase
              .from("playlist_tracks")
              .delete()
              .eq("playlist_id", playlistId)
              .eq("track_id", item.track_id);
            await supabase.from("playlist_tracks").insert([item]);
          }
        } else if (error) {
          console.error("[Playlists Tracks API] Chunk upsert error:", error.message);
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
      }

      return NextResponse.json({ success: true, count: records.length });
    }

    // Case 2: Single track addition
    if (track) {
      const trackKey = deriveStableTrackKey(track);
      const trackRecord = {
        playlist_id: String(playlistId),
        track_id: String(track.id || trackKey),
        track_key: trackKey,
        position: Number(position) || 0,
        track_data: track,
        added_at: new Date().toISOString(),
      };

      let { error } = await supabase
        .from("playlist_tracks")
        .upsert(trackRecord, { onConflict: "playlist_id,track_key" });

      if (error && (error.code === "42703" || error.message?.includes("track_key") || error.code === "42P10")) {
        // Fallback for baseline schema
        await supabase
          .from("playlist_tracks")
          .delete()
          .eq("playlist_id", playlistId)
          .eq("track_id", String(track.id || trackKey));

        const baseline = {
          playlist_id: String(playlistId),
          track_id: String(track.id || trackKey),
          position: Number(position) || 0,
          track_data: track,
          added_at: new Date().toISOString(),
        };
        const insertRes = await supabase.from("playlist_tracks").insert([baseline]);
        error = insertRes.error;
      }

      if (error) {
        console.error("[Playlists Tracks API] Track insert error:", error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, trackKey });
    }

    return NextResponse.json({ success: false, error: "track or tracks required" }, { status: 400 });
  } catch (err) {
    console.error("[Playlists Tracks API] POST exception:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/playlists/tracks
 * Removes a track from a playlist
 * Enforces parent playlist ownership
 */
export async function DELETE(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let playlistId = searchParams.get("playlistId");
    let trackId = searchParams.get("trackId");

    if (!playlistId || !trackId) {
      const body = await request.json().catch(() => ({}));
      playlistId = playlistId || body.playlistId;
      trackId = trackId || body.trackId;
    }

    if (!playlistId || !trackId) {
      return NextResponse.json(
        { success: false, error: "playlistId and trackId are required" },
        { status: 400 }
      );
    }

    const check = await verifyPlaylistOwnership(supabase, playlistId, user);
    if (!check.authorized) {
      return NextResponse.json(
        { success: false, error: check.forbidden ? "Forbidden: You do not own this playlist." : "Playlist not found" },
        { status: check.forbidden ? 403 : 404 }
      );
    }

    const tid = String(trackId);
    const { error } = await supabase
      .from("playlist_tracks")
      .delete()
      .eq("playlist_id", playlistId)
      .or(`track_id.eq.${tid},track_key.eq.${tid}`);

    if (error) {
      console.error("[Playlists Tracks API] DELETE error:", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedTrackId: tid });
  } catch (err) {
    console.error("[Playlists Tracks API] DELETE exception:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

