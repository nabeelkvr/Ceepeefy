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
 * Backend API helper functions for persistent server-side playlist storage
 */
async function saveToBackendApi(playlist, userId) {
  if (typeof fetch === "undefined" || !playlist?.id) return false;
  try {
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist, userId }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return Boolean(data.success);
    }
  } catch (e) {
    // Expected during offline or network failure
  }
  return false;
}

async function fetchFromBackendApi(userId) {
  if (typeof fetch === "undefined") return null;
  try {
    const res = await fetch(`/api/playlists?userId=${encodeURIComponent(userId)}`, {
      method: "GET",
      headers: { "Cache-Control": "no-cache" },
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.success && Array.isArray(data.playlists)) {
        return data.playlists;
      }
    }
  } catch (e) {
    // Expected during offline or network failure
  }
  return null;
}

async function deleteFromBackendApi(playlistId, userId) {
  if (typeof fetch === "undefined" || !playlistId) return false;
  try {
    const res = await fetch(`/api/playlists?id=${encodeURIComponent(playlistId)}&userId=${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return Boolean(data.success);
    }
  } catch (e) {
    // Expected during offline or network failure
  }
  return false;
}

async function syncToBackendApi(playlists, userId) {
  if (typeof fetch === "undefined" || !Array.isArray(playlists) || playlists.length === 0) return false;
  try {
    const BATCH_SIZE = 50;
    let allOk = true;
    for (let i = 0; i < playlists.length; i += BATCH_SIZE) {
      const chunk = playlists.slice(i, i + BATCH_SIZE);
      const res = await fetch("/api/playlists", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlists: chunk, userId }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (!data.success) allOk = false;
      } else {
        allOk = false;
      }
    }
    return allOk;
  } catch (e) {
    // Expected during offline or network failure
  }
  return false;
}

/**
 * Fetches all custom playlists and their ordered tracks for a user from the shared backend / Supabase
 * Uses range pagination to support 1,000+ playlists without PostgREST row limits,
 * and chunked queries to prevent HTTP 414 URI Too Long errors.
 * @param {string} userId
 * @returns {Promise<Array|null>} Array of playlists or null if unavailable
 */
export const fetchUserPlaylistsFromCloud = async (userId = DEFAULT_USER_ID) => {
  let backendPlaylists = null;

  // 1. Fetch from Supabase PostgreSQL if configured
  if (supabase && isSupabaseConfigured()) {
    try {
      const allPlaylistsData = [];
      const PL_PAGE_SIZE = 1000;
      let plPage = 0;
      let plHasMore = true;

      // Range pagination ensures all playlists (1,000+) are fetched without PostgREST 1000-row cap
      while (plHasMore) {
        const from = plPage * PL_PAGE_SIZE;
        const to = from + PL_PAGE_SIZE - 1;

        const { data: chunk, error: plError } = await supabase
          .from("user_playlists")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .range(from, to);

        if (plError) {
          console.error("[CloudService] Failed to fetch user_playlists chunk:", plError.message);
          break;
        }

        if (Array.isArray(chunk) && chunk.length > 0) {
          allPlaylistsData.push(...chunk);
          if (chunk.length < PL_PAGE_SIZE) {
            plHasMore = false;
          } else {
            plPage++;
          }
        } else {
          plHasMore = false;
        }
      }

      if (allPlaylistsData.length > 0) {
        // Collect playlist IDs that do NOT already have tracks embedded in the JSONB column
        const playlistsNeedingTracks = allPlaylistsData.filter(
          (p) => !Array.isArray(p.tracks) || p.tracks.length === 0
        );
        const neededIds = playlistsNeedingTracks.map((p) => p.id);
        const tracksByPlaylist = {};

        // If any playlists need tracks from playlist_tracks table, query in batches of 50
        // to prevent HTTP 414 URI Too Long error from huge .in(...) lists
        if (neededIds.length > 0) {
          const BATCH_SIZE = 50;
          for (let b = 0; b < neededIds.length; b += BATCH_SIZE) {
            const batchIds = neededIds.slice(b, b + BATCH_SIZE);
            const PAGE_SIZE = 1000;
            let page = 0;
            let hasMore = true;

            while (hasMore) {
              const from = page * PAGE_SIZE;
              const to = from + PAGE_SIZE - 1;

              const { data: tracksChunk, error: trError } = await supabase
                .from("playlist_tracks")
                .select("*")
                .in("playlist_id", batchIds)
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
          }
        }

        const assembled = allPlaylistsData.map((pl) => {
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
            category: pl.category || pl.source_meta?.category || "Mixed",
            source: pl.source || (pl.badge === "SPOTIFY" || pl.source_meta?.spotifyId ? "spotify_import" : "custom"),
            sourceMeta: pl.source_meta || pl.sourceMeta || null,
            spotifyId: pl.source_meta?.spotifyId || pl.spotifyId || null,
            spotifyUrl: pl.source_meta?.spotifyUrl || pl.spotifyUrl || null,
            created_at: pl.created_at,
            updated_at: pl.updated_at,
          };
        });

        backendPlaylists = assembled;
      }
    } catch (err) {
      console.warn("[CloudService] Supabase fetch notice:", err?.message || err);
    }
  }

  // 2. Fetch from shared backend API (/api/playlists)
  const apiPlaylists = await fetchFromBackendApi(userId);
  if (Array.isArray(apiPlaylists)) {
    if (!backendPlaylists) {
      backendPlaylists = apiPlaylists;
    } else {
      // Merge backend API with Supabase without duplicates
      const existingIds = new Set(backendPlaylists.map((p) => String(p.id)));
      for (const pl of apiPlaylists) {
        if (!existingIds.has(String(pl.id))) {
          backendPlaylists.push(pl);
          existingIds.add(String(pl.id));
        }
      }
    }
  }

  return backendPlaylists;
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
  if (!playlist?.id) return false;

  let savedInAnyBackend = false;

  // 1. Persist to shared backend API (/api/playlists)
  try {
    const apiSaved = await saveToBackendApi(playlist, userId);
    if (apiSaved) {
      savedInAnyBackend = true;
    }
  } catch (apiErr) {
    console.warn("[CloudService] Notice saving to /api/playlists:", apiErr);
  }

  // 2. Persist to Supabase PostgreSQL (if configured)
  if (supabase && isSupabaseConfigured()) {
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
        category: playlist.category || playlist.sourceMeta?.category || "Mixed",
        curator: playlist.curator || "You",
        curator_avatar: playlist.curatorAvatar || playlist.curator_avatar || "",
        badge: playlist.badge || (playlist.isSelfMix ? "SELF MIX" : (playlist.source === "spotify_import" || playlist.spotifyId || playlist.sourceMeta?.spotifyId ? "SPOTIFY" : "CUSTOM")),
        badge_variant: playlist.badgeVariant || playlist.badge_variant || (playlist.badge === "SPOTIFY" || playlist.source === "spotify_import" || playlist.spotifyId || playlist.sourceMeta?.spotifyId ? "emerald" : (playlist.isSelfMix ? "cyan" : "purple")),
        fidelity:
          playlist.fidelity ||
          (playlist.isSelfMix ? "Self Mix • Hi-Res Lossless" : "Personal Playlist • Hi-Res Lossless"),
        spec: playlist.spec || "24-Bit • 192kHz",
        updated_at: new Date().toISOString(),
      };

      const resolvedCategory = playlist.category || playlist.sourceMeta?.category || "Mixed";
      const resolvedSpotifyId = playlist.spotifyId || playlist.sourceMeta?.spotifyId || null;
      const resolvedSpotifyUrl = playlist.spotifyUrl || playlist.sourceMeta?.spotifyUrl || null;

      const resolvedSourceMeta = {
        ...(playlist.sourceMeta || {}),
        category: resolvedCategory,
        spotifyId: resolvedSpotifyId,
        spotifyUrl: resolvedSpotifyUrl,
        syncedSnapshot: playlist.sourceMeta?.syncedSnapshot || [],
        lastSyncedAt: playlist.sourceMeta?.lastSyncedAt || null,
        lastSyncStatus: playlist.sourceMeta?.lastSyncStatus || null,
      };

      const fullRecord = {
        ...record,
        category: resolvedCategory,
        tracks: rawTracks,
        source: playlist.source || (playlist.badge === "SPOTIFY" || resolvedSpotifyId ? "spotify_import" : "custom"),
        source_meta: resolvedSourceMeta,
      };

      // Upsert into user_playlists with full tracks JSONB
      let plResult = await supabase
        .from("user_playlists")
        .upsert(fullRecord, { onConflict: "id" });

      if (plResult.error && (plResult.error.message?.includes("column") || plResult.error.code === "42703")) {
        plResult = await supabase
          .from("user_playlists")
          .upsert(record, { onConflict: "id" });
      }

      if (!plResult.error) {
        savedInAnyBackend = true;
      }

      // Persist tracks inside playlist_tracks table
      if (rawTracks.length > 0) {
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

        await supabase
          .from("playlist_tracks")
          .delete()
          .eq("playlist_id", playlist.id);

        const CHUNK_SIZE = 50;
        for (let i = 0; i < trackRecords.length; i += CHUNK_SIZE) {
          const chunk = trackRecords.slice(i, i + CHUNK_SIZE);
          let { error: trError } = await supabase
            .from("playlist_tracks")
            .upsert(chunk, { onConflict: "playlist_id,track_id" });

          if (trError) {
            const safeChunk = chunk.map((r, cIdx) => ({
              ...r,
              track_id: `${r.track_id}__pos_${i + cIdx}`,
            }));
            await supabase
              .from("playlist_tracks")
              .upsert(safeChunk, { onConflict: "playlist_id,track_id" });
          }
        }
      }
    } catch (err) {
      console.warn("[CloudService] Supabase save notice:", err?.message || err);
    }
  }

  return savedInAnyBackend;
};


/**
 * Deletes a playlist from the shared backend and Supabase
 * @param {string} playlistId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export const deletePlaylistFromCloud = async (playlistId, userId = DEFAULT_USER_ID) => {
  if (!playlistId) return false;
  let deletedFromAny = false;

  // 1. Delete from shared backend API (/api/playlists)
  try {
    const apiDeleted = await deleteFromBackendApi(playlistId, userId);
    if (apiDeleted) {
      deletedFromAny = true;
    }
  } catch (apiErr) {
    console.warn("[CloudService] Notice deleting from /api/playlists:", apiErr);
  }

  // 2. Delete from Supabase PostgreSQL (if configured)
  if (supabase && isSupabaseConfigured()) {
    try {
      const idStr = String(playlistId);

      // Delete playlist_tracks first
      await supabase
        .from("playlist_tracks")
        .delete()
        .eq("playlist_id", idStr);

      // Delete user_playlists record
      const { error } = await supabase
        .from("user_playlists")
        .delete()
        .eq("id", idStr)
        .eq("user_id", userId);

      if (!error) {
        deletedFromAny = true;
      }

      // Clean up user_account_data central snapshot so it does not resurrect the playlist
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
    } catch (err) {
      console.warn("[CloudService] Supabase delete error:", err?.message || err);
    }
  }

  return deletedFromAny;
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
    const allRows = [];
    const PAGE_SIZE = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from("liked_songs")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        console.error("[CloudService] Failed to fetch liked_songs:", error.message);
        break;
      }

      if (Array.isArray(data) && data.length > 0) {
        allRows.push(...data);
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    const likedSongIds = [];
    const likedSongsMap = {};

    allRows.forEach((row) => {
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
  if (typeof window === "undefined") {
    return { migrated: false, reason: "window_undefined" };
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

    // Check account-bound userData_<userId>
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

    // 2. Sync local playlists with backend API
    if (localPlaylists.length > 0) {
      const apiSyncSuccess = await syncToBackendApi(localPlaylists, userId);
      if (apiSyncSuccess) {
        migratedPlaylistsCount = localPlaylists.length;
      }
    }

    // 3. If Supabase is configured, migrate playlists & tracks to Supabase PostgreSQL as well
    if (supabase && isSupabaseConfigured()) {
      const existingPlIds = new Set();
      let plPage = 0;
      let plHasMore = true;
      while (plHasMore) {
        const from = plPage * 1000;
        const to = from + 999;
        const { data: plChunk } = await supabase
          .from("user_playlists")
          .select("id")
          .eq("user_id", userId)
          .range(from, to);
        if (Array.isArray(plChunk) && plChunk.length > 0) {
          plChunk.forEach((p) => existingPlIds.add(p.id));
          if (plChunk.length < 1000) plHasMore = false;
          else plPage++;
        } else {
          plHasMore = false;
        }
      }

      const existingLikedIds = new Set();
      let lkPage = 0;
      let lkHasMore = true;
      while (lkHasMore) {
        const from = lkPage * 1000;
        const to = from + 999;
        const { data: lkChunk } = await supabase
          .from("liked_songs")
          .select("track_id")
          .eq("user_id", userId)
          .range(from, to);
        if (Array.isArray(lkChunk) && lkChunk.length > 0) {
          lkChunk.forEach((l) => existingLikedIds.add(l.track_id));
          if (lkChunk.length < 1000) lkHasMore = false;
          else lkPage++;
        } else {
          lkHasMore = false;
        }
      }

      for (const pl of localPlaylists) {
        if (!existingPlIds.has(pl.id)) {
          const plSuccess = await savePlaylistToCloud(pl, userId);
          if (plSuccess) {
            migratedPlaylistsCount++;
          }
        }
      }

      for (const trackId of localLikedIds) {
        if (!existingLikedIds.has(trackId)) {
          const trackObj = localLikedMap[trackId] || { id: trackId, title: "Liked Song" };
          const likeSuccess = await saveLikedSongToCloud(trackObj, userId);
          if (likeSuccess) {
            migratedLikedCount++;
          }
        }
      }

      const validRecents = localRecents.slice(0, 15);
      for (const track of validRecents) {
        if (track && track.id) {
          await recordRecentlyPlayedToCloud(track, userId);
          migratedRecentsCount++;
        }
      }
    }

    // 4. Mark migration as completed ONLY after backend sync operations succeed
    localStorage.setItem(migrationKey, "true");
    console.log(
      `[CloudMigration] Migration complete! Synchronized ${migratedPlaylistsCount} playlists to backend.`
    );

    return {
      migrated: true,
      playlistsCount: migratedPlaylistsCount,
      likedCount: migratedLikedCount,
      recentsCount: migratedRecentsCount,
    };
  } catch (err) {
    console.error("[CloudMigration] Migration failed with error:", err);
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

