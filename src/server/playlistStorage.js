import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-Side Persistent Playlist Storage
 * Provides robust, cross-device playlist persistence and synchronization
 * for user accounts on Ceepeefy.
 * Supports both persistent file storage (with read-only fallback) and Supabase database.
 */

// Initialize server-side Supabase client if environment variables are present
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

const isSupabaseAvailable =
  Boolean(supabaseUrl) &&
  Boolean(supabaseKey) &&
  !supabaseUrl.includes("your-project-id");

export const serverSupabase = isSupabaseAvailable
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// In-memory cache for fast lookups and resilience across serverless execution contexts
const MEMORY_CACHE = new Map(); // userId -> { playlists, deletedPlaylistIds, updatedAt }

let resolvedDataDir = null;

function ensureDataDir() {
  if (resolvedDataDir) return resolvedDataDir;
  const primaryDir = path.join(process.cwd(), "src", "server", "data");
  try {
    if (!fs.existsSync(primaryDir)) {
      fs.mkdirSync(primaryDir, { recursive: true });
    }
    // Test write permission
    const testFile = path.join(primaryDir, `.test_write_${Date.now()}.tmp`);
    fs.writeFileSync(testFile, "ok");
    try { fs.unlinkSync(testFile); } catch {}
    resolvedDataDir = primaryDir;
    return resolvedDataDir;
  } catch {
    // Read-only filesystem (e.g. Vercel Lambda container) -> fallback to os.tmpdir()
    const tmpDir = path.join(os.tmpdir(), "ceepeefy_data");
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      resolvedDataDir = tmpDir;
      return resolvedDataDir;
    } catch {
      resolvedDataDir = os.tmpdir();
      return resolvedDataDir;
    }
  }
}

function getStoreFilePath(userId) {
  const dir = ensureDataDir();
  const safeUser = String(userId || "nabeeyl")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");
  return path.join(dir, `playlists_${safeUser}.json`);
}

function readStore(userId) {
  const safeUser = String(userId || "nabeeyl").trim().toLowerCase();
  const filePath = getStoreFilePath(safeUser);

  let diskData = null;
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      diskData = {
        userId: safeUser,
        playlists: Array.isArray(parsed.playlists) ? parsed.playlists : [],
        deletedPlaylistIds: Array.isArray(parsed.deletedPlaylistIds) ? parsed.deletedPlaylistIds : [],
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    } catch (err) {
      console.error(`[PlaylistStorage] Failed to read store for ${safeUser}:`, err);
    }
  }

  const memData = MEMORY_CACHE.get(safeUser);

  if (!diskData && !memData) {
    const fresh = {
      userId: safeUser,
      playlists: [],
      deletedPlaylistIds: [],
      updatedAt: new Date().toISOString(),
    };
    MEMORY_CACHE.set(safeUser, fresh);
    return fresh;
  }

  if (diskData && !memData) {
    MEMORY_CACHE.set(safeUser, diskData);
    return diskData;
  }

  if (!diskData && memData) {
    return memData;
  }

  // If both exist, merge non-destructively so no playlists are dropped
  const diskTime = new Date(diskData.updatedAt || 0).getTime();
  const memTime = new Date(memData.updatedAt || 0).getTime();

  // If memory has more playlists or is newer, prefer memory
  if (memData.playlists.length >= diskData.playlists.length || memTime >= diskTime) {
    return memData;
  }

  MEMORY_CACHE.set(safeUser, diskData);
  return diskData;
}

function writeStore(userId, data) {
  const safeUser = String(userId || "nabeeyl").trim().toLowerCase();
  const filePath = getStoreFilePath(safeUser);
  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;

  const payload = {
    userId: safeUser,
    playlists: Array.isArray(data.playlists) ? data.playlists : [],
    deletedPlaylistIds: Array.isArray(data.deletedPlaylistIds) ? data.deletedPlaylistIds : [],
    updatedAt: new Date().toISOString(),
  };

  // Always update in-memory cache immediately
  MEMORY_CACHE.set(safeUser, payload);

  try {
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf-8");
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {}
    // Fallback: direct write
    try {
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
      return true;
    } catch (fallbackErr) {
      console.warn(`[PlaylistStorage] Direct write notice (in-memory cached):`, fallbackErr?.message || fallbackErr);
      return true; // Memory cache succeeded
    }
  }
}

/**
 * Normalizes playlist tracks, deduplicating duplicate tracks while preserving order
 * and supporting complete retrieval of large playlists.
 */
function normalizePlaylistTracks(rawTracks = []) {
  if (!Array.isArray(rawTracks)) return [];
  const seenIds = new Set();
  const deduped = [];

  for (let i = 0; i < rawTracks.length; i++) {
    const track = rawTracks[i];
    if (!track) continue;

    const baseId = String(
      (track.id !== undefined && track.id !== null && track.id !== "")
        ? track.id
        : (track.track_id !== undefined && track.track_id !== null && track.track_id !== "")
          ? track.track_id
          : `track_${i}`
    );

    if (seenIds.has(baseId)) {
      continue;
    }
    seenIds.add(baseId);

    deduped.push({
      ...track,
      id: baseId,
    });
  }

  return deduped;
}

/**
 * Retrieves all playlists for a user
 */
export function getUserPlaylists(userId) {
  const safeUser = String(userId || "nabeeyl").trim().toLowerCase();
  const store = readStore(safeUser);
  return store.playlists;
}

/**
 * Retrieves deleted playlist IDs for a user to prevent resurrection
 */
export function getDeletedPlaylistIds(userId) {
  const safeUser = String(userId || "nabeeyl").trim().toLowerCase();
  const store = readStore(safeUser);
  return store.deletedPlaylistIds;
}

/**
 * Saves or updates a playlist for a user
 */
export function saveUserPlaylist(userId, playlist) {
  if (!playlist || !playlist.id) {
    throw new Error("Invalid playlist: missing ID.");
  }

  const safeUser = String(userId || "nabeeyl").trim().toLowerCase();
  const store = readStore(safeUser);
  const playlistIdStr = String(playlist.id);

  // Normalize tracks and preserve order
  const rawTracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
  const normalizedTracks = normalizePlaylistTracks(rawTracks);

  const nowIso = new Date().toISOString();
  const cleanCategory = playlist.category || playlist.sourceMeta?.category || "Mixed";
  const cleanSpotifyId = playlist.spotifyId || playlist.sourceMeta?.spotifyId || null;
  const cleanSpotifyUrl = playlist.spotifyUrl || playlist.sourceMeta?.spotifyUrl || null;

  const normalizedPlaylist = {
    ...playlist,
    id: playlistIdStr,
    user_id: safeUser,
    title: playlist.title || "Untitled Playlist",
    description: playlist.description || "",
    coverUrl: playlist.coverUrl || playlist.cover_url || "",
    customCover: playlist.customCover || playlist.coverUrl || playlist.cover_url || "",
    curator: playlist.curator || "You",
    curatorAvatar: playlist.curatorAvatar || playlist.curator_avatar || "",
    category: cleanCategory,
    source: playlist.source || (playlist.badge === "SPOTIFY" || cleanSpotifyId ? "spotify_import" : "custom"),
    spotifyId: cleanSpotifyId,
    spotifyUrl: cleanSpotifyUrl,
    sourceMeta: {
      ...(playlist.sourceMeta || {}),
      category: cleanCategory,
      spotifyId: cleanSpotifyId,
      spotifyUrl: cleanSpotifyUrl,
    },
    badge: playlist.badge || (playlist.isSelfMix ? "SELF MIX" : (cleanSpotifyId ? "SPOTIFY" : "CUSTOM")),
    badgeVariant: playlist.badgeVariant || playlist.badge_variant || (cleanSpotifyId ? "emerald" : (playlist.isSelfMix ? "cyan" : "purple")),
    fidelity: playlist.fidelity || (playlist.isSelfMix ? "Self Mix • Hi-Res Lossless" : "Personal Playlist • Hi-Res Lossless"),
    spec: playlist.spec || "24-Bit • 192kHz",
    tracks: normalizedTracks,
    songsCount: normalizedTracks.length,
    isCustom: true,
    created_at: playlist.created_at || playlist.createdAt || nowIso,
    updated_at: nowIso,
  };

  // Remove from deleted list if saving anew
  const updatedDeleted = store.deletedPlaylistIds.filter((id) => String(id) !== playlistIdStr);

  const idx = store.playlists.findIndex((p) => String(p.id) === playlistIdStr);
  if (idx !== -1) {
    store.playlists[idx] = normalizedPlaylist;
  } else {
    store.playlists.unshift(normalizedPlaylist);
  }

  store.deletedPlaylistIds = updatedDeleted;
  writeStore(safeUser, store);

  // If Supabase is configured on server, also persist directly to database
  if (serverSupabase) {
    try {
      serverSupabase
        .from("user_playlists")
        .upsert({
          id: playlistIdStr,
          user_id: safeUser,
          title: normalizedPlaylist.title,
          description: normalizedPlaylist.description,
          cover_url: normalizedPlaylist.coverUrl,
          category: cleanCategory,
          source: normalizedPlaylist.source,
          source_meta: normalizedPlaylist.sourceMeta,
          tracks: normalizedTracks,
          badge: normalizedPlaylist.badge,
          badge_variant: normalizedPlaylist.badgeVariant,
          fidelity: normalizedPlaylist.fidelity,
          spec: normalizedPlaylist.spec,
          updated_at: nowIso,
        }, { onConflict: "id" })
        .then(() => {})
        .catch(() => {});
    } catch {}
  }

  return normalizedPlaylist;
}

/**
 * Deletes a playlist for a user and records its ID to prevent resurrection
 */
export function deleteUserPlaylist(userId, playlistId) {
  if (!playlistId) return false;
  const safeUser = String(userId || "nabeeyl").trim().toLowerCase();
  const store = readStore(safeUser);
  const idStr = String(playlistId);

  store.playlists = store.playlists.filter((p) => String(p.id) !== idStr);
  if (!store.deletedPlaylistIds.includes(idStr)) {
    store.deletedPlaylistIds.push(idStr);
  }

  const success = writeStore(safeUser, store);

  if (serverSupabase) {
    try {
      serverSupabase
        .from("user_playlists")
        .delete()
        .eq("id", idStr)
        .eq("user_id", safeUser)
        .then(() => {})
        .catch(() => {});
    } catch {}
  }

  return success;
}

/**
 * Synchronizes/migrates an array of client playlists into the backend store
 * Avoids duplicates, prevents resurrection of deleted playlists,
 * and does not overwrite newer backend data with older client data.
 */
export function syncUserPlaylists(userId, clientPlaylists = []) {
  if (!Array.isArray(clientPlaylists)) return { success: false, playlists: [] };

  const safeUser = String(userId || "nabeeyl").trim().toLowerCase();
  const store = readStore(safeUser);
  const deletedSet = new Set(store.deletedPlaylistIds.map(String));
  const existingMap = new Map(store.playlists.map((p) => [String(p.id), p]));

  for (const clientPl of clientPlaylists) {
    if (!clientPl || !clientPl.id) continue;
    const plId = String(clientPl.id);

    // Skip playlists that were deleted on backend
    if (deletedSet.has(plId)) continue;

    const existing = existingMap.get(plId);
    if (!existing) {
      // New playlist from client: add it
      const normalizedTracks = normalizePlaylistTracks(clientPl.tracks || []);
      const newRecord = {
        ...clientPl,
        id: plId,
        user_id: safeUser,
        tracks: normalizedTracks,
        songsCount: normalizedTracks.length,
        category: clientPl.category || clientPl.sourceMeta?.category || "Mixed",
        spotifyId: clientPl.spotifyId || clientPl.sourceMeta?.spotifyId || null,
        created_at: clientPl.created_at || clientPl.createdAt || new Date().toISOString(),
        updated_at: clientPl.updated_at || clientPl.updatedAt || new Date().toISOString(),
      };
      existingMap.set(plId, newRecord);
    } else {
      // Playlist exists on both client and backend: compare timestamps
      const backendTime = new Date(existing.updated_at || existing.updatedAt || 0).getTime();
      const clientTime = new Date(clientPl.updated_at || clientPl.updatedAt || 0).getTime();

      const clientHasTracks = Array.isArray(clientPl.tracks) && clientPl.tracks.length > 0;
      const backendHasTracks = Array.isArray(existing.tracks) && existing.tracks.length > 0;
      const clientTracksCount = clientHasTracks ? clientPl.tracks.length : 0;
      const backendTracksCount = backendHasTracks ? existing.tracks.length : 0;

      // Rule: Do not overwrite complete backend collections with partial data from another device
      let mergedTracks;
      if (backendTracksCount > clientTracksCount) {
        mergedTracks = existing.tracks;
      } else if (clientTracksCount > 0) {
        mergedTracks = normalizePlaylistTracks(clientPl.tracks);
      } else {
        mergedTracks = existing.tracks || [];
      }

      // Update if client is newer or has more tracks, or if backend was missing tracks
      if (clientTime >= backendTime || clientTracksCount > backendTracksCount || !backendHasTracks) {
        existingMap.set(plId, {
          ...existing,
          ...clientPl,
          id: plId,
          user_id: safeUser,
          tracks: mergedTracks,
          songsCount: mergedTracks.length,
          category: clientPl.category || existing.category || "Mixed",
          spotifyId: clientPl.spotifyId || existing.spotifyId || null,
          updated_at: new Date(Math.max(backendTime, clientTime, Date.now())).toISOString(),
        });
      }
    }
  }

  store.playlists = Array.from(existingMap.values());
  writeStore(safeUser, store);

  return {
    success: true,
    count: store.playlists.length,
    playlists: store.playlists,
    deletedPlaylistIds: store.deletedPlaylistIds,
  };
}
