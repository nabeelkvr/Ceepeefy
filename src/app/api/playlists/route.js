import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../services/supabaseServer.js";
import { formatPlaylistDuration } from "../../../utils/playlistUtils.js";

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
 * Playlists API Route
 * Authoritative Server-Side Playlist Persistence
 * Enforces authenticated Supabase session and scopes operations to auth_user_id.
 */

export async function GET(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Valid Supabase session required." },
        { status: 401 }
      );
    }

    // 1. Fetch active playlists owned by authenticated user (including verified legacy owner 'nabeeyl')
    const isOwnerNabeeyl = user.email === "nabeelek3603@gmail.com";
    const filter = isOwnerNabeeyl
      ? `auth_user_id.eq.${user.id},user_id.eq.${user.id},user_id.eq.nabeeyl`
      : `auth_user_id.eq.${user.id},user_id.eq.${user.id}`;

    const { data: playlistsData, error: plError } = await supabase
      .from("user_playlists")
      .select("*")
      .or(filter)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (plError) {
      console.error("[Playlists API] Failed to fetch playlists:", plError.message);
      return NextResponse.json({ success: false, error: plError.message }, { status: 500 });
    }

    const playlists = playlistsData || [];
    if (playlists.length === 0) {
      return NextResponse.json({ success: true, count: 0, playlists: [] });
    }

    // 2. Hydrate tracks for all returned playlists
    const playlistIds = playlists.map((p) => p.id);
    const tracksByPlaylist = {};

    const { data: tracksData, error: trError } = await supabase
      .from("playlist_tracks")
      .select("*")
      .in("playlist_id", playlistIds)
      .order("position", { ascending: true });

    if (!trError && Array.isArray(tracksData)) {
      tracksData.forEach((row) => {
        if (!tracksByPlaylist[row.playlist_id]) {
          tracksByPlaylist[row.playlist_id] = [];
        }
        const rawData = row.track_data && typeof row.track_data === "object" ? row.track_data : {};
        const trackKey = row.track_key || rawData.id || row.track_id;

        tracksByPlaylist[row.playlist_id].push({
          ...rawData,
          id: trackKey,
          track_key: trackKey,
          position: row.position,
          title: rawData.title || row.title || "Untitled Track",
          artist: rawData.artist || row.artist || "Unknown Artist",
        });
      });
    }

    // 3. Assemble UI-compatible playlist records
    const assembled = playlists.map((pl) => {
      let plTracks = tracksByPlaylist[pl.id] || [];

      // Fallback: If playlist_tracks has no rows for this playlist, hydrate from JSONB tracks column
      if (plTracks.length === 0 && Array.isArray(pl.tracks) && pl.tracks.length > 0) {
        plTracks = pl.tracks;

        // Auto-sync into playlist_tracks so relational store is populated
        (async () => {
          try {
            const records = pl.tracks.map((t, idx) => {
              const trackKey = deriveStableTrackKey(t) || `trk_${idx}`;
              return {
                playlist_id: String(pl.id),
                track_id: String(t.id || trackKey),
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
                  await supabase
                    .from("playlist_tracks")
                    .delete()
                    .eq("playlist_id", String(pl.id))
                    .eq("track_id", item.track_id);
                  await supabase.from("playlist_tracks").insert([item]);
                }
              }
            }
          } catch (syncErr) {
            console.warn("[Playlists API] Auto-sync to playlist_tracks error:", syncErr);
          }
        })();
      }

      const isSelfMix =
        pl.kind === "mix" ||
        pl.badge === "SELF MIX" ||
        String(pl.id).startsWith("mix-") ||
        plTracks.some((t) => t.isCloud || t.source === "supabase-cloud");

      return {
        id: pl.id,
        title: pl.title,
        subtitle: `By ${pl.curator || "You"} • ${plTracks.length} tracks`,
        description:
          pl.description ||
          (isSelfMix
            ? `Personal self mix "${pl.title}" blended by You in Ceepeefy Studio Mode.`
            : `Personal playlist "${pl.title}" created in Ceepeefy Studio Mode. High-resolution lossless playback.`),
        curator: pl.curator || "You",
        curatorAvatar: pl.curator_avatar || "",
        category: pl.category || "Mixed",
        badge: pl.badge || (isSelfMix ? "SELF MIX" : "CUSTOM"),
        badgeVariant: pl.badge_variant || (isSelfMix ? "cyan" : "purple"),
        fidelity: pl.fidelity || "Personal Playlist • Hi-Res Lossless",
        spec: pl.spec || "24-Bit • 192kHz",
        coverUrl: pl.cover_url,
        customCover: pl.cover_url,
        tracks: plTracks,
        songsCount: plTracks.length,
        duration: formatPlaylistDuration(plTracks),
        isCustom: true,
        isSelfMix,
        kind: pl.kind || (isSelfMix ? "mix" : "user"),
        updatedAt: pl.updated_at,
      };
    });

    return NextResponse.json({
      success: true,
      userId: user.id,
      count: assembled.length,
      playlists: assembled,
    });
  } catch (err) {
    console.error("[Playlists API] GET exception:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch playlists." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { playlist } = body;

    if (!playlist || !playlist.id) {
      return NextResponse.json(
        { success: false, error: "Playlist data with a valid ID is required." },
        { status: 400 }
      );
    }

    // 1. Verify ownership if playlist already exists
    const { data: existing } = await supabase
      .from("user_playlists")
      .select("id, auth_user_id, user_id")
      .eq("id", String(playlist.id))
      .maybeSingle();

    if (existing) {
      if (existing.auth_user_id) {
        if (existing.auth_user_id !== user.id) {
          return NextResponse.json(
            { success: false, error: "Forbidden: You do not have permission to modify this playlist." },
            { status: 403 }
          );
        }
      } else {
        // Temporary legacy ownership check: only verified owner account tied to 'nabeeyl'
        const isVerifiedLegacyOwner = user.email === "nabeelek3603@gmail.com" && existing.user_id === "nabeeyl";
        if (!isVerifiedLegacyOwner) {
          return NextResponse.json(
            { success: false, error: "Forbidden: Unrecognized legacy playlist ownership." },
            { status: 403 }
          );
        }
      }
    }

    // 2. Whitelist fields and bind to authenticated user.id
    const isSelfMix = playlist.isSelfMix || String(playlist.id).startsWith("mix-");
    const isCloudArchive = playlist.id === "cloud-archive-playlist";
    const kind = isCloudArchive ? "cloud_archive" : (isSelfMix ? "mix" : (playlist.kind || "user"));

    const payload = {
      id: String(playlist.id),
      auth_user_id: user.id,
      user_id: user.id,
      title: String(playlist.title || "Untitled Playlist").slice(0, 150),
      description: String(playlist.description || "").slice(0, 500),
      cover_url: playlist.coverUrl || playlist.cover_url || null,
      category: String(playlist.category || "Mixed").slice(0, 50),
      curator: String(playlist.curator || "You").slice(0, 80),
      curator_avatar: String(playlist.curatorAvatar || playlist.curator_avatar || "").slice(0, 1000),
      badge: playlist.badge || (isSelfMix ? "SELF MIX" : "CUSTOM"),
      badge_variant: playlist.badgeVariant || playlist.badge_variant || (isSelfMix ? "cyan" : "purple"),
      fidelity: playlist.fidelity || "Personal Playlist • Hi-Res Lossless",
      spec: playlist.spec || "24-Bit • 192kHz",
      kind,
      source: playlist.source || (isSelfMix ? "self_mix" : "custom"),
      source_meta: typeof playlist.sourceMeta === "object" ? playlist.sourceMeta : {},
      tracks: Array.isArray(playlist.tracks) ? playlist.tracks : [],
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("user_playlists")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      console.error("[Playlists API] Upsert error:", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // If initial tracks provided on playlist creation, save them to playlist_tracks safely
    if (Array.isArray(playlist.tracks) && playlist.tracks.length > 0) {
      const records = playlist.tracks.map((t, idx) => {
        const trackKey = deriveStableTrackKey(t) || `trk_${idx}`;
        return {
          playlist_id: String(playlist.id),
          track_id: String(t.id || trackKey),
          track_key: String(trackKey),
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
            await supabase
              .from("playlist_tracks")
              .delete()
              .eq("playlist_id", String(playlist.id))
              .eq("track_id", item.track_id);
            await supabase.from("playlist_tracks").insert([item]);
          }
        }
      }
    }

    return NextResponse.json({ success: true, playlist: data });
  } catch (err) {
    console.error("[Playlists API] POST exception:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to save playlist." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Playlist ID is required." },
        { status: 400 }
      );
    }

    // Verify ownership before soft-delete
    const { data: existing } = await supabase
      .from("user_playlists")
      .select("id, auth_user_id, user_id")
      .eq("id", id)
      .maybeSingle();

    if (existing) {
      if (existing.auth_user_id) {
        if (existing.auth_user_id !== user.id) {
          return NextResponse.json(
            { success: false, error: "Forbidden: You cannot delete another user's playlist." },
            { status: 403 }
          );
        }
      } else {
        // Temporary legacy ownership check: only verified owner account tied to 'nabeeyl'
        const isVerifiedLegacyOwner = user.email === "nabeelek3603@gmail.com" && existing.user_id === "nabeeyl";
        if (!isVerifiedLegacyOwner) {
          return NextResponse.json(
            { success: false, error: "Forbidden: Unrecognized legacy playlist ownership." },
            { status: 403 }
          );
        }
      }
    }

    // Soft delete per D3.e (setting deleted_at)
    const { error } = await supabase
      .from("user_playlists")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err) {
    console.error("[Playlists API] DELETE error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to delete playlist." },
      { status: 500 }
    );
  }
}
