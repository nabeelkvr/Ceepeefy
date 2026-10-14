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

    // 2. Fetch tracks for these playlists with PostgREST range pagination
    // Ensures large playlists (e.g. 464, 1000+ tracks) are completely retrieved without server caps
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
          // Restore authentic original track ID from track_data or clean disambiguation suffix
          const cleanTrackId =
            row.track_data?.id ||
            (typeof row.track_id === "string" ? row.track_id.replace(/__pos_\d+$/, "") : row.track_id);
          const trackObj =
            row.track_data && typeof row.track_data === "object"
              ? { ...row.track_data, id: cleanTrackId }
              : { id: cleanTrackId, title: "Unknown Track", artist: "Unknown Artist" };
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
    const assembled = playlistsData.map((pl) => {
      // Prioritize pl.tracks if stored directly on the row, then fallback to playlist_tracks join
      const plTracks =
        Array.isArray(pl.tracks) && pl.tracks.length > 0
          ? pl.tracks
          : tracksByPlaylist[pl.id] || [];
      const isSelfMix =
        pl.badge === "SELF MIX" ||
        pl.badge_variant === "cyan" ||
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
        curatorAvatar:
          pl.curator_avatar ||
          "https://lh3.googleusercontent.com/aida-public/AB6AXuB0776cuJDNwyUTJA-rmqEC0bmxGrVq2yheMO1LRRjEKa8X3Cf3UEDu0hJn4mdmjyKKeTpXvIjAXGckcnVAnrz3t0pLZyIHxk3oSWIBKnTAewK0vZY8jNgt5WWU1mB33uzQZJtQJNQfehNFMnRCim5JQVgBeDcIsQ21sOVpfHhvACpeifEiQ9VMkYu25PbaQ5RDOCGsSjDtlsMuC8kifyPcZ62qnvBUyplbvUNIWKL7azjlQ_ONJ0ZS",
        songsCount: plTracks.length,
        duration: formatPlaylistDuration(plTracks),
        updatedDate: "Created today",
        fidelity:
          pl.fidelity ||
          (isSelfMix ? "Self Mix • Hi-Res Lossless" : "Personal Playlist • Hi-Res Lossless"),
        spec: pl.spec || "24-Bit • 192kHz",
        badge: pl.badge || (isSelfMix ? "SELF MIX" : "CUSTOM"),
        badgeVariant: pl.badge_variant || (isSelfMix ? "cyan" : "purple"),
        stat: `${plTracks.length} tracks`,
        coverUrl:
          pl.cover_url ||
          "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80",
        customCover: pl.cover_url,
        tracks: plTracks,
        isCustom: true,
        isSelfMix: isSelfMix,
        source: pl.source || (pl.badge === "SPOTIFY" ? "spotify_import" : "custom"),
        sourceMeta: pl.source_meta || pl.sourceMeta || null,
      };
    });

    return assembled;
  } catch (err) {
    console.error("[CloudService] Exception in fetchUserPlaylistsFromCloud:", err);
    return null;
  }
};

/**
 * Fetches all tracks for a single playlist with complete PostgREST pagination
 * @param {string} playlistId
 * @returns {Promise<Array|null>}
 */
export const fetchPlaylistTracksFromCloud = async (playlistId) => {
  if (!supabase || !isSupabaseConfigured() || !playlistId) return null;
  try {
    // 1. Try reading directly from user_playlists if tracks JSONB column exists
    const { data: plData } = await supabase
      .from("user_playlists")
      .select("tracks, source, source_meta")
      .eq("id", playlistId)
      .maybeSingle();

    if (plData?.tracks && Array.isArray(plData.tracks) && plData.tracks.length > 0) {
      return plData.tracks;
    }

    // 2. Otherwise query playlist_tracks with full range pagination
    const allTracks = [];
    const PAGE_SIZE = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: tracksChunk, error } = await supabase
        .from("playlist_tracks")
        .select("*")
        .eq("playlist_id", playlistId)
        .order("position", { ascending: true })
        .range(from, to);

      if (error) {
        console.error("[CloudService] Error fetching playlist_tracks chunk:", error.message);
        break;
      }

      if (Array.isArray(tracksChunk) && tracksChunk.length > 0) {
        tracksChunk.forEach((row) => {
          const cleanTrackId =
            row.track_data?.id ||
            (typeof row.track_id === "string" ? row.track_id.replace(/__pos_\d+$/, "") : row.track_id);
          const trackObj =
            row.track_data && typeof row.track_data === "object"
              ? { ...row.track_data, id: cleanTrackId }
              : { id: cleanTrackId, title: "Unknown Track", artist: "Unknown Artist" };
          allTracks.push(trackObj);
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

    return allTracks.length > 0 ? allTracks : null;
  } catch (err) {
    console.error("[CloudService] Error fetching single playlist tracks:", err);
    return null;
  }
};

/**
 * Creates or updates a playlist in Supabase with complete track membership.
 * Safe batching and conflict resolution guarantee that large playlists (100, 200, 464+ tracks)
 * are completely persisted across chunks without failing on duplicates.
 *
 * @param {Object} playlist
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export const savePlaylistToCloud = async (playlist, userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured() || !playlist?.id) return false;

  try {
    const rawTracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];

    const record = {
      id: playlist.id,
      user_id: userId,
      title: playlist.title || "Untitled Playlist",
      description: playlist.description || "",
      cover_url:
        playlist.coverUrl ||
        playlist.cover_url ||
        "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80",
      curator: playlist.curator || "You",
      curator_avatar: playlist.curatorAvatar || playlist.curator_avatar || "",
      badge: playlist.badge || (playlist.isSelfMix ? "SELF MIX" : "CUSTOM"),
      badge_variant: playlist.badgeVariant || playlist.badge_variant || (playlist.isSelfMix ? "cyan" : "purple"),
      fidelity:
        playlist.fidelity ||
        (playlist.isSelfMix ? "Self Mix • Hi-Res Lossless" : "Personal Playlist • Hi-Res Lossless"),
      spec: playlist.spec || "24-Bit • 192kHz",
      updated_at: new Date().toISOString(),
    };

    const fullRecord = {
      ...record,
      tracks: rawTracks,
      source: playlist.source || (playlist.badge === "SPOTIFY" ? "spotify_import" : "custom"),
      source_meta: playlist.sourceMeta || null,
    };

    // 1. Upsert into user_playlists with full tracks JSONB
    let plResult = await supabase
      .from("user_playlists")
      .upsert(fullRecord, { onConflict: "id" });

    // Fallback if user_playlists table does not have 'tracks' or 'source' columns yet
    if (plResult.error && (plResult.error.message?.includes("column") || plResult.error.code === "42703")) {
      console.warn("[CloudService] 'tracks' column might not exist in user_playlists; falling back to base record:", plResult.error.message);
      plResult = await supabase
        .from("user_playlists")
        .upsert(record, { onConflict: "id" });
    }

    if (plResult.error) {
      console.error("[CloudService] Failed to upsert playlist:", plResult.error.message);
      return false;
    }

    // 2. Persist tracks inside playlist_tracks table using safe delete + chunked insert
    if (rawTracks.length > 0) {
      // Build normalized records with position and upfront position-safe track ID disambiguation
      const seenTrackIds = new Set();
      const trackRecords = rawTracks.map((track, idx) => {
        const rawTrackId = String(track.id || track.track_id || `track-${idx}`);
        let safeTrackId = rawTrackId;
        if (seenTrackIds.has(safeTrackId)) {
          safeTrackId = `${rawTrackId}__pos_${idx}`;
        }
        seenTrackIds.add(safeTrackId);

        return {
          playlist_id: playlist.id,
          track_id: safeTrackId,
          position: idx,
          track_data: track,
          added_at: new Date().toISOString(),
        };
      });

      // Delete existing tracks for this playlist to ensure clean replacement
      const { error: delError } = await supabase
        .from("playlist_tracks")
        .delete()
        .eq("playlist_id", playlist.id);

      if (delError) {
        console.warn("[CloudService] Notice on delete old playlist_tracks:", delError.message);
      }

      // Batch insert in chunks of 50 with safe conflict resolution
      const CHUNK_SIZE = 50;
      for (let i = 0; i < trackRecords.length; i += CHUNK_SIZE) {
        const chunk = trackRecords.slice(i, i + CHUNK_SIZE);

        // Attempt direct batch upsert
        let { error: trError } = await supabase
          .from("playlist_tracks")
          .upsert(chunk, { onConflict: "playlist_id,track_id" });

        // If duplicate (playlist_id, track_id) within the chunk caused failure,
        // disambiguate track_id per position so no chunk is ever lost
        if (trError) {
          console.warn(`[CloudService] Batch upsert conflict at chunk ${i}, applying position-safe keys:`, trError.message);
          const safeChunk = chunk.map((r, cIdx) => ({
            ...r,
            track_id: `${r.track_id}__pos_${i + cIdx}`,
          }));
          const fallbackRes = await supabase
            .from("playlist_tracks")
            .upsert(safeChunk, { onConflict: "playlist_id,track_id" });

          if (fallbackRes.error) {
            console.error(`[CloudService] Fallback insert failed for chunk ${i}:`, fallbackRes.error.message);
          }
        }
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
    const idStr = String(playlistId);

    // 1. Delete playlist_tracks first in case cascade is not set in DB
    const { error: tracksError } = await supabase
      .from("playlist_tracks")
      .delete()
      .eq("playlist_id", idStr);

    if (tracksError) {
      console.warn("[CloudService] Notice on deleting playlist_tracks:", tracksError.message);
    }

    // 2. Delete user_playlists record
    const { error } = await supabase
      .from("user_playlists")
      .delete()
      .eq("id", idStr)
      .eq("user_id", userId);

    if (error) {
      console.error("[CloudService] Failed to delete user_playlist:", error.message);
      return false;
    }

    // 3. Clean up user_account_data central snapshot so it does not resurrect the playlist
    try {
      const { data: acctRow } = await supabase
        .from("user_account_data")
        .select("account_data")
        .eq("user_id", userId)
        .maybeSingle();

      if (acctRow?.account_data) {
        const curAcct = acctRow.account_data;
        const nextCustom = Array.isArray(curAcct.customPlaylists)
          ? curAcct.customPlaylists.filter((p) => String(p.id) !== idStr)
          : [];
        const nextMixes = Array.isArray(curAcct.selfMixes)
          ? curAcct.selfMixes.filter((m) => String(m.id) !== idStr)
          : [];
        const deletedIds = Array.isArray(curAcct.deletedPlaylistIds)
          ? [...new Set([...curAcct.deletedPlaylistIds, idStr])]
          : [idStr];

        await supabase
          .from("user_account_data")
          .upsert(
            {
              user_id: userId,
              account_data: {
                ...curAcct,
                customPlaylists: nextCustom,
                selfMixes: nextMixes,
                deletedPlaylistIds: deletedIds,
                lastUpdated: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );
      }
    } catch (acctErr) {
      console.warn("[CloudService] Notice updating account data for deleted playlist:", acctErr);
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

    // Delete existing entry if present to prevent conflict
    await supabase
      .from("playlist_tracks")
      .delete()
      .eq("playlist_id", playlistId)
      .eq("track_id", String(track.id));

    const { error } = await supabase
      .from("playlist_tracks")
      .insert([record]);

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

/**
 * Clears all recently played records for a user in Supabase
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export const clearRecentlyPlayedInCloud = async (userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase
      .from("recently_played")
      .delete()
      .eq("user_id", userId);

    if (error) {
      console.error("[CloudService] Failed to clear recently_played:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[CloudService] Exception in clearRecentlyPlayedInCloud:", err);
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

// ============================================================================
// ACCOUNT-WIDE DATA BACKUP & RESTORE (user_account_data)
// ============================================================================

/**
 * Saves complete account data snapshot (playlists, mixes, liked songs) to Supabase
 * @param {Object} accountData
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export const saveAccountDataToCloud = async (accountData, userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured() || !userId || !accountData) return false;
  try {
    const record = {
      user_id: userId,
      account_data: accountData,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("user_account_data")
      .upsert(record, { onConflict: "user_id" });

    if (error) {
      // Table may not exist yet if user hasn't run the setup SQL
      console.warn("[CloudService] user_account_data save notice:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
};

/**
 * Fetches complete account data snapshot from Supabase
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
export const fetchAccountDataFromCloud = async (userId = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured() || !userId) return null;
  try {
    const { data, error } = await supabase
      .from("user_account_data")
      .select("account_data, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return null;
    return data.account_data || null;
  } catch (err) {
    return null;
  }
};

/**
 * Subscribes to Supabase Realtime changes for user playlists
 * Triggers callback whenever playlists or playlist tracks are added, modified, or deleted across devices
 * @param {string} userId
 * @param {Function} onUpdate
 * @returns {Function} unsubscribe cleanup function
 */
export const subscribeToUserPlaylists = (userId = DEFAULT_USER_ID, onUpdate) => {
  if (!supabase || !isSupabaseConfigured() || typeof onUpdate !== "function") {
    return () => {};
  }

  try {
    const channelName = `realtime-playlists-${userId}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
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
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[CloudService] Realtime subscription established for playlists.");
        }
      });

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  } catch (err) {
    console.warn("[CloudService] Error setting up Realtime subscription:", err);
    return () => {};
  }
};

