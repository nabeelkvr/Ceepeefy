import fs from "node:fs";
import path from "node:path";

/**
 * Server-Side Persistent Playlist Storage
 * Provides robust, cross-device playlist persistence and synchronization
 * for user accounts on Ceepeefy.
 */

const DATA_DIR = path.join(process.cwd(), "src", "server", "data");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getStoreFilePath(userId) {
  ensureDataDir();
  const safeUser = String(userId || "default")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");
  return path.join(DATA_DIR, `playlists_${safeUser}.json`);
}

function readStore(userId) {
  const filePath = getStoreFilePath(userId);
  if (!fs.existsSync(filePath)) {
    return {
      userId: String(userId).toLowerCase(),
      playlists: [],
      deletedPlaylistIds: [],
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      userId: String(userId).toLowerCase(),
      playlists: Array.isArray(parsed.playlists) ? parsed.playlists : [],
      deletedPlaylistIds: Array.isArray(parsed.deletedPlaylistIds) ? parsed.deletedPlaylistIds : [],
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[PlaylistStorage] Failed to read store for ${userId}:`, err);
    return {
      userId: String(userId).toLowerCase(),
      playlists: [],
      deletedPlaylistIds: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

function writeStore(userId, data) {
  const filePath = getStoreFilePath(userId);
  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;

  const payload = {
    userId: String(userId).toLowerCase(),
    playlists: Array.isArray(data.playlists) ? data.playlists : [],
    deletedPlaylistIds: Array.isArray(data.deletedPlaylistIds) ? data.deletedPlaylistIds : [],
    updatedAt: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf-8");
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err) {
    console.error(`[PlaylistStorage] Failed to write store for ${userId}:`, err);
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {}
    // Fallback: direct write
    try {
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
      return true;
    } catch (fallbackErr) {
      console.error(`[PlaylistStorage] Direct write fallback also failed:`, fallbackErr);
      return false;
    }
  }
}

/**
 * Normalizes playlist tracks, deduplicating duplicate tracks while preserving order
 * and supporting complete retrieval of large (1,000+ track) playlists.
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
      // Avoid duplicate tracks during migration or synchronization
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
  const store = readStore(userId);
  return store.playlists;
}

/**
 * Retrieves deleted playlist IDs for a user to prevent resurrection
 */
export function getDeletedPlaylistIds(userId) {
  const store = readStore(userId);
  return store.deletedPlaylistIds;
}

/**
 * Saves or updates a playlist for a user
 */
export function saveUserPlaylist(userId, playlist) {
  if (!playlist || !playlist.id) {
    throw new Error("Invalid playlist: missing ID.");
  }

  const store = readStore(userId);
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
    user_id: String(userId).toLowerCase(),
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
  writeStore(userId, store);

  return normalizedPlaylist;
}

/**
 * Deletes a playlist for a user and records its ID to prevent resurrection
 */
export function deleteUserPlaylist(userId, playlistId) {
  if (!playlistId) return false;
  const store = readStore(userId);
  const idStr = String(playlistId);

  store.playlists = store.playlists.filter((p) => String(p.id) !== idStr);
  if (!store.deletedPlaylistIds.includes(idStr)) {
    store.deletedPlaylistIds.push(idStr);
  }

  return writeStore(userId, store);
}

/**
 * Synchronizes/migrates an array of client playlists into the backend store
 * Avoids duplicates, prevents resurrection of deleted playlists,
 * and does not overwrite newer backend data with older client data.
 */
export function syncUserPlaylists(userId, clientPlaylists = []) {
  if (!Array.isArray(clientPlaylists)) return { success: false, playlists: [] };

  const store = readStore(userId);
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
        user_id: String(userId).toLowerCase(),
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
          user_id: String(userId).toLowerCase(),
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
  writeStore(userId, store);

  return {
    success: true,
    count: store.playlists.length,
    playlists: store.playlists,
    deletedPlaylistIds: store.deletedPlaylistIds,
  };
}
