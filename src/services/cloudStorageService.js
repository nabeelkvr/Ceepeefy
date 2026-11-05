/**
 * Cloud Storage Service for Ceepeefy
 * Handles persistent synchronization with Supabase through authenticated Route Handlers:
 * - User Playlists (/api/playlists)
 * - Playlist Tracks (/api/playlists/tracks)
 * - Liked Songs (/api/library/liked)
 * - Recently Played History (/api/library/recently-played)
 *
 * Grounded in Decisions D1-D5 & Architectural Audits:
 * - Direct browser PostgREST calls replaced with authenticated Route Handlers (@supabase/ssr)
 * - Session authentication validated via HTTP-only cookies on the server
 * - Enforces zero anon write/read access (compatible with Stage B RLS)
 * - Deterministic track_key derivation
 * - Soft delete with deleted_at
 */

import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import { DEFAULT_USER_ID } from "../config/authConfig.js";

const apiFetch = async (endpoint, options = {}) => {
  const base = typeof window !== "undefined"
    ? ""
    : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  return fetch(`${base}${endpoint}`, {
    ...options,
    credentials: "include",
  });
};

/**
 * Derives a stable, deterministic track_key from track properties (D4)
 * Uses storage bucket + object path or audio URL; never Date.now() or random
 */
export const deriveStableTrackKey = (track) => {
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
};

// ============================================================================
// PLAYLISTS (user_playlists & playlist_tracks)
// ============================================================================

/**
 * Fetches all custom playlists and their ordered tracks for the authenticated user
 * @param {string} userId - Optional user identifier
 * @returns {Promise<Array|null>} Array of playlists or null on error
 */
export const fetchUserPlaylistsFromCloud = async (userId = DEFAULT_USER_ID) => {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const res = await apiFetch("/api/playlists");
    if (!res.ok) {
      if (res.status === 401) {
        // Not logged in or session expired
        return null;
      }
      const errData = await res.json().catch(() => ({}));
      console.warn("[CloudService] Failed to fetch playlists:", errData.error || res.statusText);
      return null;
    }

    const data = await res.json();
    return Array.isArray(data.playlists) ? data.playlists : [];
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
  if (!isSupabaseConfigured() || !playlistId) return [];

  try {
    const res = await apiFetch(`/api/playlists/tracks?playlistId=${encodeURIComponent(playlistId)}`);
    if (!res.ok) return [];

    const data = await res.json();
    return Array.isArray(data.tracks) ? data.tracks : [];
  } catch (err) {
    console.error("[CloudService] Error fetching playlist tracks:", err);
    return [];
  }
};

/**
 * Saves or updates playlist metadata in Supabase (user_playlists)
 * @param {Object} playlist
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export const savePlaylistToCloud = async (playlist, userId = DEFAULT_USER_ID) => {
  if (!isSupabaseConfigured() || !playlist?.id) return false;

  try {
    const res = await apiFetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[CloudService] Failed to save playlist:", err.error || res.statusText);
      return false;
    }

    const data = await res.json();
    return Boolean(data.success);
  } catch (err) {
    console.error("[CloudService] Exception in savePlaylistToCloud:", err);
    return false;
  }
};

/**
 * Adds a single track to a playlist in Supabase (playlist_tracks)
 * @param {string} playlistId
 * @param {Object} track
 * @param {number} position
 * @returns {Promise<boolean>}
 */
export const addTrackToPlaylistCloud = async (playlistId, track, position = 0) => {
  if (!isSupabaseConfigured() || !playlistId || !track) return false;

  try {
    const res = await apiFetch("/api/playlists/tracks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlistId, track, position }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[CloudService] Failed to add track to playlist:", err.error || res.statusText);
      return false;
    }

    const data = await res.json();
    return Boolean(data.success);
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
  if (!isSupabaseConfigured() || !playlistId || !Array.isArray(tracks)) return false;

  try {
    const res = await apiFetch("/api/playlists/tracks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlistId, tracks }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[CloudService] Failed to sync tracks to playlist:", err.error || res.statusText);
      return false;
    }

    const data = await res.json();
    return Boolean(data.success);
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
  if (!isSupabaseConfigured() || !playlistId || !trackId) return false;

  try {
    const res = await apiFetch(
      `/api/playlists/tracks?playlistId=${encodeURIComponent(playlistId)}&trackId=${encodeURIComponent(trackId)}`,
      { method: "DELETE" }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[CloudService] Failed to remove track from playlist:", err.error || res.statusText);
      return false;
    }

    const data = await res.json();
    return Boolean(data.success);
  } catch (err) {
    console.error("[CloudService] Exception in removeTrackFromPlaylistCloud:", err);
    return false;
  }
};

/**
 * Deletes a playlist and its associated tracks from Supabase cloud
 * @param {string} playlistId
 * @param {string} userId
 * @returns {Promise<{ success: boolean, error?: string, deletedId?: string }>}
 */
export const deletePlaylistFromCloud = async (playlistId, userId = DEFAULT_USER_ID) => {
  if (!playlistId) return { success: false, error: "Playlist ID required" };
  if (!isSupabaseConfigured()) return { success: true, deletedId: playlistId };

  try {
    const res = await apiFetch(`/api/playlists?id=${encodeURIComponent(playlistId)}`, {
      method: "DELETE",
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      const errorMsg = data.error || `Server error (${res.status}): ${res.statusText}`;
      console.error("[CloudService] Failed to delete playlist:", errorMsg);
      return { success: false, error: errorMsg };
    }

    return { success: true, deletedId: data.deletedId || playlistId };
  } catch (err) {
    console.error("[CloudService] Exception in deletePlaylistFromCloud:", err);
    return { success: false, error: err.message || "Failed to communicate with database." };
  }
};

// ============================================================================
// LIKED SONGS & RECENTLY PLAYED
// ============================================================================

export const saveLikedSongToCloud = async (track, userId = DEFAULT_USER_ID) => {
  if (!isSupabaseConfigured() || !track?.id) return false;

  try {
    const res = await apiFetch("/api/library/liked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ track }),
    });

    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.success);
  } catch (err) {
    return false;
  }
};

export const removeLikedSongFromCloud = async (trackId, userId = DEFAULT_USER_ID) => {
  if (!isSupabaseConfigured() || !trackId) return false;

  try {
    const res = await apiFetch(`/api/library/liked?trackId=${encodeURIComponent(trackId)}`, {
      method: "DELETE",
    });

    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.success);
  } catch (err) {
    return false;
  }
};

export const fetchLikedSongsFromCloud = async (userId = DEFAULT_USER_ID) => {
  if (!isSupabaseConfigured()) return null;

  try {
    const res = await apiFetch("/api/library/liked");
    if (!res.ok) return null;

    const data = await res.json();
    return Array.isArray(data.tracks) ? data.tracks : [];
  } catch (err) {
    return null;
  }
};

export const recordRecentlyPlayedToCloud = async (track, userId = DEFAULT_USER_ID) => {
  if (!isSupabaseConfigured() || !track?.id) return false;

  try {
    const res = await apiFetch("/api/library/recently-played", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ track }),
    });

    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.success);
  } catch (err) {
    return false;
  }
};

export const fetchRecentlyPlayedFromCloud = async (userId = DEFAULT_USER_ID) => {
  if (!isSupabaseConfigured()) return null;

  try {
    const res = await apiFetch("/api/library/recently-played");
    if (!res.ok) return null;

    const data = await res.json();
    return Array.isArray(data.tracks) ? data.tracks : [];
  } catch (err) {
    return null;
  }
};

export const clearRecentlyPlayedInCloud = async (userId = DEFAULT_USER_ID) => {
  if (!isSupabaseConfigured()) return false;

  try {
    const res = await apiFetch("/api/library/recently-played", {
      method: "DELETE",
    });

    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.success);
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
