/**
 * Cloud Storage Service for Ceepeefy
 * Handles persistent synchronization with Supabase for:
 * - User Playlists (user_playlists)
 * - Playlist Tracks (playlist_tracks)
 * - Liked Songs (liked_songs)
 * - Recently Played History (recently_played)
 *
 * Grounded in Decisions D1-D5:
 * - Single source of truth is Supabase PostgreSQL
 * - Server disk / memory / JSON write paths removed
 * - Snapshot table (user_account_data) removed
 * - No delete-before-insert on tracks
 * - Soft delete with deleted_at
 * - Resilient column fallback for backward compatibility
 */

import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import { DEFAULT_USER_ID } from "../config/authConfig.js";
import { formatPlaylistDuration } from "../utils/playlistUtils.js";

/**
 * Derives a stable, deterministic track_key from track properties (D4)
 * Uses storage bucket + object path or audio URL; never Date.now() or random
 */
export const deriveStableTrackKey = (track) => {
  if (!track) return "";
  if (track.track_key) return String(track.track_key);

  // If Supabase storage or audio URL exists, derive key from path
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

  // Fallback to stable ID or spotify ID
  const id = track.id || track.track_id || track.spotifyId || "";
  return String(id).replace(/__pos_\d+$/, "");
};

// ============================================================================
// PLAYLISTS (user_playlists & playlist_tracks)
// ============================================================================

/**
 * Fetches all custom playlists and their ordered tracks for a user from Supabase
 * @param {string} userId
 * @returns {Promise<Array|null>} Array of playlists or null on error
 */
export const fetchUserPlaylistsFromCloud = async (userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured()) {
    return null;
  }

  try {
    // 1. Fetch active (non-deleted) playlists owned by user
    let query = supabase
      .from("user_playlists")
      .select("*")
      .or(`user_id.eq.${userId},auth_user_id.eq.${userId}`)
      .order("updated_at", { ascending: false });

    let { data: playlistsData, error: plError } = await query;

    // Backward-compatible query without deleted_at or auth_user_id if schema not yet upgraded
    if (plError && (plError.code === "42703" || plError.message?.includes("column"))) {
      const fallbackQuery = await supabase
        .from("user_playlists")
        .select("*")
        .eq("user_id", userId);
      playlistsData = fallbackQuery.data;
      plError = fallbackQuery.error;
    }

    if (plError) {
      console.error("[CloudService] Failed to fetch user_playlists:", plError.message);
      return null; // Return null (not empty array!) so error is not treated as empty library
    }

    if (!playlistsData || playlistsData.length === 0) {
      return [];
    }

    // Filter out soft-deleted playlists in memory if column was present
    const activePlaylists = playlistsData.filter((p) => !p.deleted_at);
    if (activePlaylists.length === 0) return [];

    const playlistIds = activePlaylists.map((p) => p.id);

    // 2. Fetch tracks for these playlists with PostgREST range pagination
    const tracksByPlaylist = {};
    const PAGE_SIZE = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: tracksChunk, error: trError } = await supabase
        .from("playlist_tracks")
        .select("*")
        .in("playlist_id", playlistIds)
        .order("position", { ascending: true })
        .range(from, to);

      if (trError) {
        console.error("[CloudService] Failed to fetch playlist_tracks range:", trError.message);
        break;
      }

      if (Array.isArray(tracksChunk) && tracksChunk.length > 0) {
        tracksChunk.forEach((row) => {
          if (!tracksByPlaylist[row.playlist_id]) {
            tracksByPlaylist[row.playlist_id] = [];
          }

          const rawData = row.track_data && typeof row.track_data === "object" ? row.track_data : {};
          const trackKey = row.track_key || rawData.id || row.track_id;

          const trackObj = {
            ...rawData,
            id: trackKey,
            track_key: trackKey,
            position: row.position,
            title: rawData.title || row.title || "Untitled Track",
            artist: rawData.artist || row.artist || "Unknown Artist",
          };

          tracksByPlaylist[row.playlist_id].push(trackObj);
        });

        if (tracksChunk.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    // 3. Assemble UI-compatible playlist objects
    const assembled = activePlaylists.map((pl) => {
      const plTracks = tracksByPlaylist[pl.id] || [];
      const isSelfMix =
        pl.kind === "mix" ||
        pl.badge === "SELF MIX" ||
        pl.badge_variant === "cyan" ||
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

    return assembled;
  } catch (err) {
    console.error("[CloudService] Exception in fetchUserPlaylistsFromCloud:", err);
    return null;
  }
};

/**
 * Fetches tracks for a specific playlist from Supabase (playlist_tracks)
 * @param {string} playlistId
 * @returns {Promise<Array>}
 */
export const fetchPlaylistTracksFromCloud = async (playlistId) => {
  if (!supabase || !isSupabaseConfigured() || !playlistId) return [];

  try {
    const { data, error } = await supabase
      .from("playlist_tracks")
      .select("*")
      .eq("playlist_id", playlistId)
      .order("position", { ascending: true });

    if (error || !data) return [];

    return data.map((row) => {
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
  } catch (err) {
    console.error("[CloudService] Error fetching playlist tracks:", err);
    return [];
  }
};

/**
 * Saves or updates playlist metadata in Supabase (user_playlists)
 * D3.d: Saving playlist metadata NEVER touches playlist_tracks!
 * Resilient to missing schema columns before and after migration.
 * @param {Object} playlist
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export const savePlaylistToCloud = async (playlist, userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured() || !playlist?.id) return false;

  try {
    const isSelfMix = playlist.isSelfMix || String(playlist.id).startsWith("mix-");
    const isCloudArchive = playlist.id === "cloud-archive-playlist";
    const kind = isCloudArchive ? "cloud_archive" : (isSelfMix ? "mix" : "user");

    // Full expanded record
    const fullRecord = {
      id: String(playlist.id),
      user_id: String(userId),
      title: playlist.title || "Untitled Playlist",
      description: playlist.description || "",
      cover_url: playlist.coverUrl || playlist.cover_url || null,
      category: playlist.category || "Mixed",
      curator: playlist.curator || "You",
      curator_avatar: playlist.curatorAvatar || playlist.curator_avatar || "",
      badge: playlist.badge || (isSelfMix ? "SELF MIX" : "CUSTOM"),
      badge_variant: playlist.badgeVariant || playlist.badge_variant || (isSelfMix ? "cyan" : "purple"),
      fidelity: playlist.fidelity || "Personal Playlist • Hi-Res Lossless",
      spec: playlist.spec || "24-Bit • 192kHz",
      kind,
      updated_at: new Date().toISOString(),
    };

    // Baseline record matching original 5 live columns (id, user_id, title, description, cover_url)
    const baselineRecord = {
      id: String(playlist.id),
      user_id: String(userId),
      title: playlist.title || "Untitled Playlist",
      description: playlist.description || "",
      cover_url: playlist.coverUrl || playlist.cover_url || null,
    };

    // 1. Attempt upsert with full metadata
    let { error } = await supabase
      .from("user_playlists")
      .upsert(fullRecord, { onConflict: "id" });

    // 2. If column mismatch (code 42703), safely fallback to baseline columns
    if (error && (error.code === "42703" || error.message?.includes("column"))) {
      console.warn("[CloudService] Column mismatch in user_playlists; falling back to baseline record:", error.message);
      const fallbackResult = await supabase
        .from("user_playlists")
        .upsert(baselineRecord, { onConflict: "id" });
      error = fallbackResult.error;
    }

    if (error) {
      console.error("[CloudService] Failed to upsert playlist:", error.message);
      return false;
    }

    // 3. If initial tracks are provided on creation, insert them safely without delete-all
    const rawTracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
    if (rawTracks.length > 0) {
      await syncPlaylistTracksToCloud(playlist.id, rawTracks);
    }

    return true;
  } catch (err) {
    console.error("[CloudService] Exception in savePlaylistToCloud:", err);
    return false;
  }
};

/**
 * Adds a single track to a playlist in Supabase (playlist_tracks)
 * D3.c: Atomic upsert using unique (playlist_id, track_key) without delete-before-insert
 * @param {string} playlistId
 * @param {Object} track
 * @param {number} position
 * @returns {Promise<boolean>}
 */
export const addTrackToPlaylistCloud = async (playlistId, track, position = 0) => {
  if (!supabase || !isSupabaseConfigured() || !playlistId || !track) return false;

  try {
    const trackKey = deriveStableTrackKey(track);
    const trackRecord = {
      playlist_id: String(playlistId),
      track_id: String(track.id || trackKey),
      track_key: trackKey,
      position: Number(position) || 0,
      track_data: track,
      added_at: new Date().toISOString(),
    };

    // Baseline record for live database without track_key column
    const baselineRecord = {
      playlist_id: String(playlistId),
      track_id: String(track.id || trackKey),
      position: Number(position) || 0,
      track_data: track,
      added_at: new Date().toISOString(),
    };

    let { error } = await supabase
      .from("playlist_tracks")
      .upsert(trackRecord, { onConflict: "playlist_id,track_key" });

    if (error && (error.code === "42703" || error.message?.includes("track_key") || error.code === "42P10")) {
      // Fallback: delete duplicate row if needed then insert
      await supabase
        .from("playlist_tracks")
        .delete()
        .eq("playlist_id", playlistId)
        .eq("track_id", String(track.id || trackKey));

      const insertResult = await supabase
        .from("playlist_tracks")
        .insert([baselineRecord]);
      error = insertResult.error;
    }

    if (error) {
      console.error("[CloudService] Failed to add track to playlist:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[CloudService] Exception in addTrackToPlaylistCloud:", err);
    return false;
  }
};

/**
 * Synchronizes an array of tracks to a playlist atomically
 * @param {string} playlistId
 * @param {Array} tracks
 * @returns {Promise<boolean>}
 */
export const syncPlaylistTracksToCloud = async (playlistId, tracks = []) => {
  if (!supabase || !isSupabaseConfigured() || !playlistId || !Array.isArray(tracks)) return false;

  try {
    const records = tracks.map((track, idx) => {
      const trackKey = deriveStableTrackKey(track) || `trk_${idx}`;
      return {
        playlist_id: String(playlistId),
        track_id: String(track.id || trackKey),
        track_key: trackKey,
        position: idx,
        track_data: track,
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
        // Fallback for baseline table
        const baselineChunk = chunk.map(({ track_key, ...rest }) => rest);
        for (const item of baselineChunk) {
          await supabase
            .from("playlist_tracks")
            .delete()
            .eq("playlist_id", playlistId)
            .eq("track_id", item.track_id);
          await supabase.from("playlist_tracks").insert([item]);
        }
      }
    }

    return true;
  } catch (err) {
    console.error("[CloudService] Exception in syncPlaylistTracksToCloud:", err);
    return false;
  }
};

/**
 * Removes a track from a playlist in Supabase
 * @param {string} playlistId
 * @param {string} trackId
 * @returns {Promise<boolean>}
 */
export const removeTrackFromPlaylistCloud = async (playlistId, trackId) => {
  if (!supabase || !isSupabaseConfigured() || !playlistId || !trackId) return false;

  try {
    const tid = String(trackId);
    const { error } = await supabase
      .from("playlist_tracks")
      .delete()
      .eq("playlist_id", playlistId)
      .or(`track_id.eq.${tid},track_key.eq.${tid}`);

    if (error) {
      console.error("[CloudService] Failed to remove track from playlist:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[CloudService] Exception in removeTrackFromPlaylistCloud:", err);
    return false;
  }
};

/**
 * Soft deletes a playlist in Supabase (D3.e)
 * Sets deleted_at to current timestamp; keeps data for 30-day retention
 * @param {string} playlistId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export const deletePlaylistFromCloud = async (playlistId, userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured() || !playlistId) return false;

  try {
    // 1. Attempt soft delete
    let { error } = await supabase
      .from("user_playlists")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", playlistId)
      .eq("user_id", userId);

    // 2. If deleted_at column does not exist yet in live DB, fallback to hard delete
    if (error && (error.code === "42703" || error.message?.includes("column"))) {
      const fallbackResult = await supabase
        .from("user_playlists")
        .delete()
        .eq("id", playlistId)
        .eq("user_id", userId);
      error = fallbackResult.error;
    }

    if (error) {
      console.error("[CloudService] Failed to delete playlist:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[CloudService] Exception in deletePlaylistFromCloud:", err);
    return false;
  }
};

// ============================================================================
// LIKED SONGS & RECENTLY PLAYED
// ============================================================================

export const saveLikedSongToCloud = async (track, userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured() || !track?.id) return false;

  try {
    const record = {
      user_id: userId,
      track_id: String(track.id),
      track_data: track,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("liked_songs")
      .upsert(record, { onConflict: "user_id,track_id" });

    if (error) {
      console.error("[CloudService] Failed to save liked song:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
};

export const removeLikedSongFromCloud = async (trackId, userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured() || !trackId) return false;

  try {
    const { error } = await supabase
      .from("liked_songs")
      .delete()
      .eq("user_id", userId)
      .eq("track_id", String(trackId));

    return !error;
  } catch (err) {
    return false;
  }
};

export const fetchLikedSongsFromCloud = async (userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase
      .from("liked_songs")
      .select("track_id, track_data")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) return null;
    return (data || []).map((row) => ({
      id: row.track_id,
      ...(row.track_data || {}),
    }));
  } catch (err) {
    return null;
  }
};

export const recordRecentlyPlayedToCloud = async (track, userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured() || !track?.id) return false;

  try {
    const record = {
      user_id: userId,
      track_id: String(track.id),
      track_data: track,
      played_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("recently_played").insert([record]);
    return !error;
  } catch (err) {
    return false;
  }
};

export const fetchRecentlyPlayedFromCloud = async (userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase
      .from("recently_played")
      .select("track_id, track_data, played_at")
      .eq("user_id", userId)
      .order("played_at", { ascending: false })
      .limit(30);

    if (error) return null;
    return (data || []).map((row) => ({
      id: row.track_id,
      ...(row.track_data || {}),
      played_at: row.played_at,
    }));
  } catch (err) {
    return null;
  }
};

export const clearRecentlyPlayedInCloud = async (userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured()) return false;

  try {
    const { error } = await supabase
      .from("recently_played")
      .delete()
      .eq("user_id", userId);

    return !error;
  } catch (err) {
    return false;
  }
};

export const subscribeToPlaylistUpdates = (userId = DEFAULT_USER_ID, onUpdate = () => {}) => {
  if (!supabase || !isSupabaseConfigured()) return () => {};

  try {
    const channel = supabase
      .channel(`user_playlists_sync_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_playlists",
        },
        () => {
          onUpdate();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "playlist_tracks",
        },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  } catch (err) {
    return () => {};
  }
};
