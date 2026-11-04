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
    .select("id, auth_user_id, user_id, tracks")
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
    // Backfill auth_user_id immediately so future checks are fast and row is permanently claimed
    await supabase
      .from("user_playlists")
      .update({ auth_user_id: user.id, updated_at: new Date().toISOString() })
      .eq("id", String(playlistId));
    return { authorized: true, playlist: { ...playlist, auth_user_id: user.id } };
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

    let tracks = (data || []).map((row) => {
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

    // Fallback: If playlist_tracks has no rows, check if parent playlist row in user_playlists has tracks
    if (tracks.length === 0 && Array.isArray(check.playlist?.tracks) && check.playlist.tracks.length > 0) {
      tracks = check.playlist.tracks;

      // Auto-migrate to playlist_tracks so subsequent reads hit playlist_tracks
      try {
        const keyOccurrences = new Map();
        const records = tracks.map((t, idx) => {
          const baseKey = deriveStableTrackKey(t) || `trk_${idx}`;
          const occCount = (keyOccurrences.get(baseKey) || 0) + 1;
          keyOccurrences.set(baseKey, occCount);
          const trackKey = occCount === 1 ? baseKey : `${baseKey}__pos_${idx}`;
          const originalTrackId = String(t.id || t.track_id || t.spotifyId || baseKey);
          return {
            playlist_id: String(playlistId),
            track_id: originalTrackId,
            track_key: trackKey,
            position: idx,
            title: String(t.title || t.name || "Untitled Track"),
            artist: String(t.artist || t.subtitle || t.artistName || "Unknown Artist"),
            album: String(t.album || t.albumName || ""),
            duration: typeof t.duration === "number" ? t.duration : 0,
            duration_formatted: t.durationFormatted || null,
            audio_url: t.audioUrl || t.audio_url || null,
            cover_url: t.coverUrl || t.cover_url || null,
            source: t.source || "custom",
            track_data: t,
            added_at: new Date().toISOString(),
          };
        });

        const CHUNK_SIZE = 50;
        for (let i = 0; i < records.length; i += CHUNK_SIZE) {
          const chunk = records.slice(i, i + CHUNK_SIZE);
          const { error: trkErr } = await supabase
            .from("playlist_tracks")
            .upsert(chunk, { onConflict: "playlist_id,track_key" });
          if (trkErr && (trkErr.code === "42703" || trkErr.message?.includes("track_key") || trkErr.code === "42P10")) {
            const baselineChunk = chunk.map(({ track_key, ...rest }) => rest);
            for (const item of baselineChunk) {
              await supabase.from("playlist_tracks").delete().eq("playlist_id", playlistId).eq("track_id", item.track_id);
              await supabase.from("playlist_tracks").insert([item]);
            }
          }
        }
      } catch (syncErr) {
        console.warn("[Playlists Tracks API] Auto-migrate error:", syncErr);
      }
    }

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
      const keyOccurrences = new Map();
      const records = tracks.map((t, idx) => {
        const baseKey = deriveStableTrackKey(t) || `trk_${idx}`;
        const occCount = (keyOccurrences.get(baseKey) || 0) + 1;
        keyOccurrences.set(baseKey, occCount);
        const trackKey = occCount === 1 ? baseKey : `${baseKey}__pos_${idx}`;
        const originalTrackId = String(t.id || t.track_id || t.spotifyId || baseKey);
        return {
          playlist_id: String(playlistId),
          track_id: originalTrackId,
          track_key: trackKey,
          position: idx,
          title: String(t.title || t.name || "Untitled Track"),
          artist: String(t.artist || t.subtitle || t.artistName || "Unknown Artist"),
          album: String(t.album || t.albumName || ""),
          duration: typeof t.duration === "number" ? t.duration : 0,
          duration_formatted: t.durationFormatted || null,
          audio_url: t.audioUrl || t.audio_url || null,
          cover_url: t.coverUrl || t.cover_url || null,
          source: t.source || "custom",
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
            const { error: insErr } = await supabase.from("playlist_tracks").insert([item]);
            if (insErr) {
              console.error("[Playlists Tracks API] Fallback insert error:", insErr.message);
              return NextResponse.json({ success: false, error: insErr.message }, { status: 500 });
            }
          }
        } else if (error) {
          console.error("[Playlists Tracks API] Chunk upsert error:", error.message);
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
      }

      // Update parent playlist updated_at and aligned tracks JSONB cache
      await supabase
        .from("user_playlists")
        .update({ tracks, updated_at: new Date().toISOString() })
        .eq("id", String(playlistId));

      return NextResponse.json({ success: true, count: records.length });
    }

    // Case 2: Single track addition
    if (track) {
      const baseKey = deriveStableTrackKey(track);
      const originalTrackId = String(track.id || track.track_id || track.spotifyId || baseKey);
      const trackKey = baseKey;
      const trackRecord = {
        playlist_id: String(playlistId),
        track_id: originalTrackId,
        track_key: trackKey,
        position: Number(position) || 0,
        title: String(track.title || track.name || "Untitled Track"),
        artist: String(track.artist || track.subtitle || track.artistName || "Unknown Artist"),
        album: String(track.album || track.albumName || ""),
        duration: typeof track.duration === "number" ? track.duration : 0,
        duration_formatted: track.durationFormatted || null,
        audio_url: track.audioUrl || track.audio_url || null,
        cover_url: track.coverUrl || track.cover_url || null,
        source: track.source || "custom",
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
          .eq("track_id", originalTrackId);

        const baseline = {
          playlist_id: String(playlistId),
          track_id: originalTrackId,
          position: Number(position) || 0,
          title: String(track.title || track.name || "Untitled Track"),
          artist: String(track.artist || track.subtitle || track.artistName || "Unknown Artist"),
          album: String(track.album || track.albumName || ""),
          duration: typeof track.duration === "number" ? track.duration : 0,
          duration_formatted: track.durationFormatted || null,
          audio_url: track.audioUrl || track.audio_url || null,
          cover_url: track.coverUrl || track.cover_url || null,
          source: track.source || "custom",
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

      // Update parent playlist updated_at and sync JSONB cache
      const currentTracks = Array.isArray(check.playlist?.tracks) ? [...check.playlist.tracks] : [];
      if (!currentTracks.some((t) => String(t.id || t.track_id || deriveStableTrackKey(t)) === originalTrackId)) {
        currentTracks.push(track);
      }
      await supabase
        .from("user_playlists")
        .update({ tracks: currentTracks, updated_at: new Date().toISOString() })
        .eq("id", String(playlistId));

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

    // Update parent playlist updated_at and remove from JSONB cache
    const currentTracks = Array.isArray(check.playlist?.tracks)
      ? check.playlist.tracks.filter((t) => String(t.id || t.track_id || deriveStableTrackKey(t)) !== tid)
      : [];
    await supabase
      .from("user_playlists")
      .update({ tracks: currentTracks, updated_at: new Date().toISOString() })
      .eq("id", String(playlistId));

    return NextResponse.json({ success: true, deletedTrackId: tid });
  } catch (err) {
    console.error("[Playlists Tracks API] DELETE exception:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

