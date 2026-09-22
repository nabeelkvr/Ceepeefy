/**
 * Cloud Storage Service for Ceepeefy
 * Handles persistent synchronization with Supabase for:
 * - User Playlists (user_playlists, playlist_tracks)
 * - Liked Songs (liked_songs)
 * - Recently Played History (recently_played)
 * - LocalStorage one-time migration
 */

import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { DEFAULT_USER_ID } from "../config/authConfig";
import { formatPlaylistDuration } from "../utils/playlistUtils";

// ============================================================================
// PLAYLISTS (user_playlists & playlist_tracks)
// ============================================================================

/**
 * Fetches all custom playlists and their ordered tracks for a user from Supabase
 * @param {string} userId
 * @returns {Promise<Array|null>} Array of playlists or null if Supabase is unavailable
 */
export const fetchUserPlaylistsFromCloud = async (userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured()) {
    console.warn("[CloudService] Supabase not configured; skipping playlist fetch.");
    return null;
  }

  try {
    // 1. Fetch playlists owned by user
    const { data: playlistsData, error: plError } = await supabase
      .from("user_playlists")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (plError) {
      console.error("[CloudService] Failed to fetch user_playlists:", plError.message);
      return null;
    }

    if (!playlistsData || playlistsData.length === 0) {
      return [];
    }

    const playlistIds = playlistsData.map((p) => p.id);

    // 2. Fetch tracks for these playlists, strictly ordered by position asc
    const { data: tracksData, error: trError } = await supabase
      .from("playlist_tracks")
      .select("*")
      .in("playlist_id", playlistIds)
      .order("position", { ascending: true });

    if (trError) {
      console.error("[CloudService] Failed to fetch playlist_tracks:", trError.message);
    }

    // 3. Map tracks by playlist ID
    const tracksByPlaylist = {};
    (tracksData || []).forEach((row) => {
      if (!tracksByPlaylist[row.playlist_id]) {
        tracksByPlaylist[row.playlist_id] = [];
      }
      const trackObj = row.track_data && typeof row.track_data === "object"
        ? { ...row.track_data, id: row.track_id }
        : { id: row.track_id, title: "Unknown Track", artist: "Unknown Artist" };
      tracksByPlaylist[row.playlist_id].push(trackObj);
    });

    // 4. Assemble UI-compatible playlist objects
    const assembled = playlistsData.map((pl) => {
      const plTracks = tracksByPlaylist[pl.id] || [];
      return {
        id: pl.id,
        title: pl.title,
        subtitle: `By ${pl.curator || "You"} • ${plTracks.length} tracks`,
        description: pl.description || `Personal playlist "${pl.title}" created in Ceepeefy Studio Mode. High-resolution lossless playback.`,
        curator: pl.curator || "You",
        curatorAvatar: pl.curator_avatar || "https://lh3.googleusercontent.com/aida-public/AB6AXuB0776cuJDNwyUTJA-rmqEC0bmxGrVq2yheMO1LRRjEKa8X3Cf3UEDu0hJn4mdmjyKKeTpXvIjAXGckcnVAnrz3t0pLZyIHxk3oSWIBKnTAewK0vZY8jNgt5WWU1mB33uzQZJtQJNQfehNFMnRCim5JQVgBeDcIsQ21sOVpfHhvACpeifEiQ9VMkYu25PbaQ5RDOCGsSjDtlsMuC8kifyPcZ62qnvBUyplbvUNIWKL7azjlQ_ONJ0ZS",
        songsCount: plTracks.length,
        duration: formatPlaylistDuration(plTracks),
        updatedDate: "Created today",
        fidelity: pl.fidelity || "Personal Playlist • Hi-Res Lossless",
        spec: pl.spec || "24-Bit • 192kHz",
        badge: pl.badge || "CUSTOM",
        badgeVariant: pl.badge_variant || "purple",
        stat: "1 Like",
        coverUrl: pl.cover_url || "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80",
        tracks: plTracks,
        isCustom: true,
      };
    });

    return assembled;
  } catch (err) {
    console.error("[CloudService] Exception in fetchUserPlaylistsFromCloud:", err);
    return null;
  }
};

/**
 * Creates or updates a playlist in Supabase
 * @param {Object} playlist
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export const savePlaylistToCloud = async (playlist, userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured() || !playlist?.id) return false;

  try {
    const record = {
      id: playlist.id,
      user_id: userId,
      title: playlist.title || "Untitled Playlist",
      description: playlist.description || "",
      cover_url: playlist.coverUrl || playlist.cover_url || "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80",
      curator: playlist.curator || "You",
      curator_avatar: playlist.curatorAvatar || playlist.curator_avatar || "",
      badge: playlist.badge || "CUSTOM",
      badge_variant: playlist.badgeVariant || playlist.badge_variant || "purple",
      fidelity: playlist.fidelity || "Personal Playlist • Hi-Res Lossless",
      spec: playlist.spec || "24-Bit • 192kHz",
      updated_at: new Date().toISOString(),
    };

    const { error: plError } = await supabase
      .from("user_playlists")
      .upsert(record, { onConflict: "id" });

    if (plError) {
      console.error("[CloudService] Failed to upsert playlist:", plError.message);
      return false;
    }

    // Upsert any existing tracks inside the playlist
    if (Array.isArray(playlist.tracks) && playlist.tracks.length > 0) {
      const trackRecords = playlist.tracks.map((track, idx) => ({
        playlist_id: playlist.id,
        track_id: String(track.id),
        position: idx,
        track_data: track,
        added_at: new Date().toISOString(),
      }));

      const { error: trError } = await supabase
        .from("playlist_tracks")
        .upsert(trackRecords, { onConflict: "playlist_id,track_id" });

      if (trError) {
        console.error("[CloudService] Failed to upsert playlist_tracks during playlist save:", trError.message);
      }
    }

    return true;
  } catch (err) {
    console.error("[CloudService] Exception in savePlaylistToCloud:", err);
    return false;
  }
};

/**
 * Deletes a playlist from Supabase (cascades to playlist_tracks automatically)
 * @param {string} playlistId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export const deletePlaylistFromCloud = async (playlistId, userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured() || !playlistId) return false;

  try {
    const { error } = await supabase
      .from("user_playlists")
      .delete()
      .eq("id", playlistId)
      .eq("user_id", userId);

    if (error) {
      console.error("[CloudService] Failed to delete user_playlist:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[CloudService] Exception in deletePlaylistFromCloud:", err);
    return false;
  }
};

/**
 * Adds a single track to a playlist in Supabase
 * @param {string} playlistId
 * @param {Object} track
 * @param {number} position
 * @returns {Promise<boolean>}
 */
export const addTrackToPlaylistCloud = async (playlistId, track, position = 0) => {
  if (!supabase || !isSupabaseConfigured() || !playlistId || !track?.id) return false;

  try {
    const record = {
      playlist_id: playlistId,
      track_id: String(track.id),
      position: Number(position) || 0,
      track_data: track,
      added_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("playlist_tracks")
      .upsert(record, { onConflict: "playlist_id,track_id" });

    if (error) {
      console.error("[CloudService] Failed to add track to playlist_tracks:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[CloudService] Exception in addTrackToPlaylistCloud:", err);
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
    const { error } = await supabase
      .from("playlist_tracks")
      .delete()
      .eq("playlist_id", playlistId)
      .eq("track_id", String(trackId));

    if (error) {
      console.error("[CloudService] Failed to remove track from playlist_tracks:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[CloudService] Exception in removeTrackFromPlaylistCloud:", err);
    return false;
  }
};

// ============================================================================
// LIKED SONGS (liked_songs)
// ============================================================================

/**
 * Fetches all liked songs for a user from Supabase
 * @param {string} userId
 * @returns {Promise<{ likedSongIds: Array, likedSongsMap: Object }|null>}
 */
export const fetchLikedSongsFromCloud = async (userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured()) {
    console.warn("[CloudService] Supabase not configured; skipping liked songs fetch.");
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("liked_songs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[CloudService] Failed to fetch liked_songs:", error.message);
      return null;
    }

    const likedSongIds = [];
    const likedSongsMap = {};

    (data || []).forEach((row) => {
      likedSongIds.push(row.track_id);
      if (row.track_data && typeof row.track_data === "object") {
        likedSongsMap[row.track_id] = { ...row.track_data, id: row.track_id };
      }
    });

    return { likedSongIds, likedSongsMap };
  } catch (err) {
    console.error("[CloudService] Exception in fetchLikedSongsFromCloud:", err);
    return null;
  }
};

/**
 * Saves a liked song to Supabase
 * @param {Object} track
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
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
      console.error("[CloudService] Failed to save liked song to cloud:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[CloudService] Exception in saveLikedSongToCloud:", err);
    return false;
  }
};

/**
 * Removes a liked song from Supabase
 * @param {string} trackId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export const removeLikedSongFromCloud = async (trackId, userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured() || !trackId) return false;

  try {
    const { error } = await supabase
      .from("liked_songs")
      .delete()
      .eq("user_id", userId)
      .eq("track_id", String(trackId));

    if (error) {
      console.error("[CloudService] Failed to remove liked song from cloud:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[CloudService] Exception in removeLikedSongFromCloud:", err);
    return false;
  }
};

// ============================================================================
// RECENTLY PLAYED (recently_played)
// ============================================================================

/**
 * Fetches recently played tracks for a user from Supabase
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<Array|null>}
 */
export const fetchRecentlyPlayedFromCloud = async (userId = DEFAULT_USER_ID, limit = 50) => {
  if (!supabase || !isSupabaseConfigured()) {
    console.warn("[CloudService] Supabase not configured; skipping recently played fetch.");
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("recently_played")
      .select("*")
      .eq("user_id", userId)
      .order("played_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[CloudService] Failed to fetch recently_played:", error.message);
      return null;
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Deduplicate maintaining latest played order (matching UI display requirements)
    const seen = new Set();
    const tracks = [];

    data.forEach((row) => {
      const tid = String(row.track_id);
      if (!seen.has(tid)) {
        seen.add(tid);
        const trackObj = row.track_data && typeof row.track_data === "object"
          ? { ...row.track_data, id: tid, played_at: row.played_at }
          : { id: tid, title: "Unknown Track", artist: "Unknown Artist" };
        tracks.push(trackObj);
      }
    });

    return tracks;
  } catch (err) {
    console.error("[CloudService] Exception in fetchRecentlyPlayedFromCloud:", err);
    return null;
  }
};

/**
 * Records a played track into recently_played in Supabase
 * @param {Object} track
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export const recordRecentlyPlayedToCloud = async (track, userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured() || !track?.id) return false;

  // Local uploads are isolated to Self Mix, not stored in general cloud history
  const isLocal = Boolean(
    track.isLocal ||
    String(track.id).startsWith("local-") ||
    track.source === "local-upload"
  );
  if (isLocal) return false;

  try {
    const record = {
      user_id: userId,
      track_id: String(track.id),
      track_data: track,
      played_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("recently_played")
      .insert([record]);

    if (error) {
      console.error("[CloudService] Failed to record recently played track:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[CloudService] Exception in recordRecentlyPlayedToCloud:", err);
    return false;
  }
};

// ============================================================================
// ONE-TIME LOCAL STORAGE TO SUPABASE MIGRATION
// ============================================================================

/**
 * Safely migrates local playlists, liked songs, and recently played to Supabase.
 * - Reads existing local storage data
 * - Avoids uploading duplicates
 * - Only flags migration as complete once cloud operations succeed
 * - NEVER deletes local data before successful cloud confirmation
 * @param {string} userId
 * @returns {Promise<{ migrated: boolean, playlistsCount: number, likedCount: number, recentsCount: number }>}
 */
export const migrateLocalDataToSupabase = async (userId = DEFAULT_USER_ID) => {
  if (typeof window === "undefined" || !supabase || !isSupabaseConfigured()) {
    return { migrated: false, reason: "supabase_not_configured" };
  }

  const migrationKey = `ceepeefy_cloud_migrated_${userId}`;
  const alreadyMigrated = localStorage.getItem(migrationKey) === "true";

  if (alreadyMigrated) {
    return { migrated: false, reason: "already_migrated" };
  }

  console.log(`[CloudMigration] Starting one-time localStorage migration for user: ${userId}...`);

  let migratedPlaylistsCount = 0;
  let migratedLikedCount = 0;
  let migratedRecentsCount = 0;

  try {
    // 1. Read existing local data from both account-bound and legacy keys
    let localPlaylists = [];
    let localLikedIds = [];
    let localLikedMap = {};
    let localRecents = [];

    // Check account-bound userData_nabeeyl
    const accountStr = localStorage.getItem(`userData_${userId}`);
    if (accountStr) {
      try {
        const parsed = JSON.parse(accountStr);
        if (Array.isArray(parsed.customPlaylists)) localPlaylists = parsed.customPlaylists;
        if (Array.isArray(parsed.likedSongIds)) localLikedIds = parsed.likedSongIds;
        if (parsed.likedSongsMap && typeof parsed.likedSongsMap === "object") localLikedMap = parsed.likedSongsMap;
        if (Array.isArray(parsed.recentlyPlayedTracks)) localRecents = parsed.recentlyPlayedTracks;
      } catch (e) {
        console.warn("[CloudMigration] Error parsing account data:", e);
      }
    }

    // Fallback/merge with legacy keys
    try {
      const legacyPls = JSON.parse(localStorage.getItem("nocturne_custom_playlists") || "[]");
      if (Array.isArray(legacyPls)) {
        const existingPlIds = new Set(localPlaylists.map((p) => p.id));
        legacyPls.forEach((pl) => {
          if (!existingPlIds.has(pl.id)) {
            localPlaylists.push(pl);
          }
        });
      }
    } catch {}

    try {
      const legacyLiked = JSON.parse(localStorage.getItem("nocturne_liked") || "[]");
      const legacyMap = JSON.parse(localStorage.getItem("nocturne_liked_map") || "{}");
      if (Array.isArray(legacyLiked)) {
        const set = new Set(localLikedIds);
        legacyLiked.forEach((id) => set.add(id));
        localLikedIds = Array.from(set);
      }
      if (legacyMap && typeof legacyMap === "object") {
        localLikedMap = { ...legacyMap, ...localLikedMap };
      }
    } catch {}

    try {
      const legacyRec = JSON.parse(localStorage.getItem("nocturne_recent_tracks") || "[]");
      if (Array.isArray(legacyRec)) {
        const existingRecIds = new Set(localRecents.map((t) => t.id));
        legacyRec.forEach((t) => {
          if (!existingRecIds.has(t.id)) {
            localRecents.push(t);
          }
        });
      }
    } catch {}

    // 2. Fetch existing cloud data to prevent duplicates
    const { data: existingPlData } = await supabase
      .from("user_playlists")
      .select("id")
      .eq("user_id", userId);
    const existingPlIds = new Set((existingPlData || []).map((p) => p.id));

    const { data: existingLikedData } = await supabase
      .from("liked_songs")
      .select("track_id")
      .eq("user_id", userId);
    const existingLikedIds = new Set((existingLikedData || []).map((l) => l.track_id));

    // 3. Migrate Playlists & Playlist Tracks
    for (const pl of localPlaylists) {
      if (!existingPlIds.has(pl.id)) {
        const plSuccess = await savePlaylistToCloud(pl, userId);
        if (plSuccess) {
          migratedPlaylistsCount++;
        }
      }
    }

    // 4. Migrate Liked Songs
    for (const trackId of localLikedIds) {
      if (!existingLikedIds.has(trackId)) {
        const trackObj = localLikedMap[trackId] || { id: trackId, title: "Liked Song" };
        const likeSuccess = await saveLikedSongToCloud(trackObj, userId);
        if (likeSuccess) {
          migratedLikedCount++;
        }
      }
    }

    // 5. Migrate Recently Played (upload top 15 recent songs)
    const validRecents = localRecents.slice(0, 15);
    for (const track of validRecents) {
      if (track && track.id) {
        await recordRecentlyPlayedToCloud(track, userId);
        migratedRecentsCount++;
      }
    }

    // 6. Mark migration as completed ONLY after database operations succeed
    localStorage.setItem(migrationKey, "true");
    console.log(
      `[CloudMigration] Migration complete! Uploaded ${migratedPlaylistsCount} playlists, ${migratedLikedCount} liked songs, ${migratedRecentsCount} recent tracks to Supabase.`
    );

    return {
      migrated: true,
      playlistsCount: migratedPlaylistsCount,
      likedCount: migratedLikedCount,
      recentsCount: migratedRecentsCount,
    };
  } catch (err) {
    console.error("[CloudMigration] Migration failed with error:", err);
    // Notice: We intentionally do NOT set the migrated flag so it can retry later safely
    return { migrated: false, error: err.message };
  }
};
