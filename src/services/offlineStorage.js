/**
 * Ceepeefy Offline Songs Storage Service (IndexedDB)
 * 
 * Provides true, device-specific offline storage for audio tracks and playlists.
 * Audio blobs and album art are saved persistently in IndexedDB ("CeepeefyOfflineDB")
 * and revived via URL.createObjectURL for high-performance offline playback without
 * contacting Supabase or external streaming APIs.
 */

import { getLocalAudioBlob } from "./localAudioStorage";

const DB_NAME = "CeepeefyOfflineDB";
const DB_VERSION = 1;

const STORES = {
  AUDIO: "offline_audio",
  TRACKS_META: "offline_tracks_meta",
  PLAYLISTS_META: "offline_playlists_meta",
};

// Memory cache of active Object URLs to avoid redundant URL allocations
const activeOfflineUrlCache = new Map();
const activeOfflineCoverCache = new Map();

/**
 * Initializes and returns the IndexedDB instance for offline storage.
 * @returns {Promise<IDBDatabase>}
 */
export function openOfflineDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Raw Binary Audio Blobs Store
      if (!db.objectStoreNames.contains(STORES.AUDIO)) {
        db.createObjectStore(STORES.AUDIO, { keyPath: "trackId" });
      }

      // 2. Track Metadata Store (for offline rendering without network)
      if (!db.objectStoreNames.contains(STORES.TRACKS_META)) {
        const metaStore = db.createObjectStore(STORES.TRACKS_META, { keyPath: "trackId" });
        metaStore.createIndex("downloadedAt", "downloadedAt", { unique: false });
      }

      // 3. Offline Playlists Associations Store
      if (!db.objectStoreNames.contains(STORES.PLAYLISTS_META)) {
        db.createObjectStore(STORES.PLAYLISTS_META, { keyPath: "playlistId" });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error("[OfflineStorage] Failed to open IndexedDB:", event.target.error);
      reject(event.target.error || new Error("Failed to open offline database"));
    };
  });
}

/**
 * Requests persistent storage from browser to prevent automatic cache eviction.
 * @returns {Promise<boolean>}
 */
export async function requestPersistentStorage() {
  if (typeof window !== "undefined" && navigator?.storage?.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      return isPersisted;
    } catch (e) {
      console.warn("[OfflineStorage] Persistent storage request error:", e);
    }
  }
  return false;
}

/**
 * Checks if persistent storage is already granted.
 * @returns {Promise<boolean>}
 */
export async function isStoragePersisted() {
  if (typeof window !== "undefined" && navigator?.storage?.persisted) {
    try {
      return await navigator.storage.persisted();
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Checks if a specific track is available offline on this device.
 * @param {string} trackId
 * @returns {Promise<boolean>}
 */
export async function isTrackOffline(trackId) {
  if (!trackId) return false;
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.TRACKS_META, "readonly");
      const store = tx.objectStore(STORES.TRACKS_META);
      const req = store.get(String(trackId));
      req.onsuccess = (e) => resolve(Boolean(e.target.result));
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/**
 * Retrieves track metadata from offline store.
 * @param {string} trackId
 * @returns {Promise<object|null>}
 */
export async function getOfflineTrack(trackId) {
  if (!trackId) return null;
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.TRACKS_META, "readonly");
      const store = tx.objectStore(STORES.TRACKS_META);
      const req = store.get(String(trackId));
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("[OfflineStorage] getOfflineTrack error:", err);
    return null;
  }
}

/**
 * Retrieves raw audio Blob from offline storage.
 * @param {string} trackId
 * @returns {Promise<Blob|null>}
 */
export async function getOfflineAudioBlob(trackId) {
  if (!trackId) return null;
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.AUDIO, "readonly");
      const store = tx.objectStore(STORES.AUDIO);
      const req = store.get(String(trackId));
      req.onsuccess = (e) => resolve(e.target.result?.blob || null);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("[OfflineStorage] getOfflineAudioBlob error:", err);
    return null;
  }
}

/**
 * Retrieves an active Object URL for offline audio playback.
 * If already generated, returns the cached URL to save memory.
 * @param {string} trackId
 * @returns {Promise<string|null>}
 */
export async function getOfflineAudioUrl(trackId) {
  if (!trackId) return null;
  const tid = String(trackId);

  if (activeOfflineUrlCache.has(tid)) {
    return activeOfflineUrlCache.get(tid);
  }

  const blob = await getOfflineAudioBlob(tid);
  if (!blob) return null;

  try {
    const url = URL.createObjectURL(blob);
    activeOfflineUrlCache.set(tid, url);
    return url;
  } catch (err) {
    console.error("[OfflineStorage] createObjectURL error:", err);
    return null;
  }
}

/**
 * Retrieves cover art Object URL if cached locally as a Blob, or returns fallback.
 * @param {string} trackId
 * @param {string} fallbackUrl
 * @returns {Promise<string>}
 */
export async function getOfflineCoverUrl(trackId, fallbackUrl = "") {
  if (!trackId) return fallbackUrl;
  const tid = String(trackId);

  if (activeOfflineCoverCache.has(tid)) {
    return activeOfflineCoverCache.get(tid);
  }

  const meta = await getOfflineTrack(tid);
  if (meta?.coverBlob) {
    try {
      const coverUrl = URL.createObjectURL(meta.coverBlob);
      activeOfflineCoverCache.set(tid, coverUrl);
      return coverUrl;
    } catch {
      return meta.coverUrl || fallbackUrl;
    }
  }

  return meta?.coverUrl || fallbackUrl;
}

/**
 * Returns all tracks downloaded for offline listening on this device.
 * Sorted by download date (newest first).
 * @returns {Promise<Array<object>>}
 */
export async function getOfflineTracks() {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.TRACKS_META, "readonly");
      const store = tx.objectStore(STORES.TRACKS_META);
      const req = store.getAll();

      req.onsuccess = (e) => {
        const tracks = e.target.result || [];
        // Sort descending by downloadedAt
        tracks.sort((a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0));
        resolve(tracks);
      };

      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("[OfflineStorage] getOfflineTracks error:", err);
    return [];
  }
}

/**
 * Returns a Set of all offline track IDs for instantaneous O(1) checks.
 * @returns {Promise<Set<string>>}
 */
export async function getOfflineTrackIds() {
  const tracks = await getOfflineTracks();
  return new Set(tracks.map((t) => String(t.trackId || t.id)));
}

/**
 * Downloads a single track and stores its binary audio & metadata in IndexedDB.
 * Handles local Self Mix tracks and remote streaming catalog tracks.
 * 
 * @param {object} track - Track object
 * @param {string|null} [playlistId] - Optional playlist ID to associate
 * @returns {Promise<{ success: boolean, track: object, error?: string }>}
 */
export async function downloadTrack(track, playlistId = null) {
  if (!track || !track.id) {
    return { success: false, error: "Invalid track data" };
  }

  const trackId = String(track.id);

  try {
    // Request persistent storage in the background
    requestPersistentStorage().catch(() => {});

    const db = await openOfflineDB();

    // Check if track is already downloaded
    const existingMeta = await getOfflineTrack(trackId);
    if (existingMeta) {
      // Update playlist association if needed
      if (playlistId) {
        const currentPlaylists = Array.isArray(existingMeta.playlistIds) ? existingMeta.playlistIds : [];
        if (!currentPlaylists.includes(playlistId)) {
          existingMeta.playlistIds = [...currentPlaylists, playlistId];
          await new Promise((res) => {
            const tx = db.transaction(STORES.TRACKS_META, "readwrite");
            tx.objectStore(STORES.TRACKS_META).put(existingMeta);
            tx.oncomplete = () => res();
            tx.onerror = () => res();
          });
        }
      }
      return { success: true, track: existingMeta };
    }

    let audioBlob = null;
    let mimeType = "audio/mp4";

    // Case 1: Self Mix local upload
    const isLocal = Boolean(
      track.isLocal ||
      trackId.startsWith("local-") ||
      track.source === "local-upload"
    );

    if (isLocal) {
      audioBlob = await getLocalAudioBlob(trackId);
      if (audioBlob) {
        mimeType = audioBlob.type || "audio/mpeg";
      }
    }

    // Case 2: Direct or Catalog Audio Download
    if (!audioBlob) {
      // Use internal high-fidelity download endpoint which resolves & streams MP4/M4A/MP3
      const downloadParams = new URLSearchParams({
        title: track.title || "Track",
        artist: track.artist || "Artist",
        trackId: trackId,
        quality: "medium", // balanced audiophile quality for fast offline storage
      });

      if (track.album) downloadParams.set("album", track.album);
      if (track.coverUrl) downloadParams.set("coverUrl", track.coverUrl);
      if (track.audioUrl && track.audioUrl.startsWith("http")) {
        downloadParams.set("audioUrl", track.audioUrl);
      }

      const res = await fetch(`/api/audio/download?${downloadParams.toString()}`);
      if (!res.ok) {
        // Fallback to direct audioUrl if present
        if (track.audioUrl && track.audioUrl.startsWith("http")) {
          const directRes = await fetch(track.audioUrl);
          if (directRes.ok) {
            audioBlob = await directRes.blob();
            mimeType = directRes.headers.get("content-type") || "audio/mpeg";
          }
        }
        if (!audioBlob) {
          throw new Error(`Audio download failed with status ${res.status}`);
        }
      } else {
        audioBlob = await res.blob();
        mimeType = res.headers.get("content-type") || "audio/mp4";
      }
    }

    if (!audioBlob || audioBlob.size === 0) {
      throw new Error("Received empty audio stream");
    }

    // Attempt to download and cache cover image binary for 100% offline art display
    let coverBlob = null;
    if (track.coverUrl && track.coverUrl.startsWith("http")) {
      try {
        const coverRes = await fetch(track.coverUrl, { mode: "cors" });
        if (coverRes.ok) {
          coverBlob = await coverRes.blob();
        }
      } catch {
        // Non-fatal if cover image fetch fails; original URL will be preserved
      }
    }

    const downloadedAt = Date.now();
    const playlistIds = playlistId ? [playlistId] : [];

    // Save audio binary blob
    const audioRecord = {
      trackId,
      blob: audioBlob,
      mimeType,
      size: audioBlob.size,
      downloadedAt,
    };

    // Save metadata record
    const metaRecord = {
      trackId,
      id: trackId,
      title: track.title || "Unknown Title",
      artist: track.artist || "Unknown Artist",
      album: track.album || "",
      duration: typeof track.duration === "number" ? track.duration : 210,
      durationFormatted: track.durationFormatted || "3:30",
      coverUrl: track.coverUrl || "",
      coverBlob: coverBlob || null,
      audioMimeType: mimeType,
      originalAudioUrl: track.audioUrl || "",
      size: audioBlob.size,
      playlistIds,
      downloadedAt,
      isOffline: true,
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.AUDIO, STORES.TRACKS_META], "readwrite");
      tx.objectStore(STORES.AUDIO).put(audioRecord);
      tx.objectStore(STORES.TRACKS_META).put(metaRecord);

      tx.oncomplete = () => {
        // Cache object URL
        if (activeOfflineUrlCache.has(trackId)) {
          URL.revokeObjectURL(activeOfflineUrlCache.get(trackId));
        }
        const url = URL.createObjectURL(audioBlob);
        activeOfflineUrlCache.set(trackId, url);
        resolve();
      };

      tx.onerror = (e) => reject(e.target.error);
    });

    return { success: true, track: metaRecord };
  } catch (err) {
    console.error(`[OfflineStorage] Failed to download track ${track.title}:`, err);
    return { success: false, error: err.message || "Failed to download track" };
  }
}

/**
 * Removes an offline song from the device.
 * 
 * Does NOT unlike the song.
 * Does NOT remove it from playlists or Supabase.
 * Only deletes local offline binary and metadata.
 * 
 * @param {string} trackId
 * @param {string|null} [playlistId] - If provided, only disassociates from this playlist unless no other playlists remain.
 * @returns {Promise<boolean>}
 */
export async function removeOfflineTrack(trackId, playlistId = null) {
  if (!trackId) return false;
  const tid = String(trackId);

  try {
    const db = await openOfflineDB();
    const meta = await getOfflineTrack(tid);

    if (!meta) return true;

    // If a playlistId was specified and the track still belongs to other playlists, just unlink
    if (playlistId && Array.isArray(meta.playlistIds) && meta.playlistIds.length > 1) {
      meta.playlistIds = meta.playlistIds.filter((p) => p !== playlistId);
      await new Promise((resolve) => {
        const tx = db.transaction(STORES.TRACKS_META, "readwrite");
        tx.objectStore(STORES.TRACKS_META).put(meta);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
      return true;
    }

    // Complete removal from device
    if (activeOfflineUrlCache.has(tid)) {
      try {
        URL.revokeObjectURL(activeOfflineUrlCache.get(tid));
      } catch {}
      activeOfflineUrlCache.delete(tid);
    }

    if (activeOfflineCoverCache.has(tid)) {
      try {
        URL.revokeObjectURL(activeOfflineCoverCache.get(tid));
      } catch {}
      activeOfflineCoverCache.delete(tid);
    }

    return new Promise((resolve) => {
      const tx = db.transaction([STORES.AUDIO, STORES.TRACKS_META], "readwrite");
      tx.objectStore(STORES.AUDIO).delete(tid);
      tx.objectStore(STORES.TRACKS_META).delete(tid);

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.error("[OfflineStorage] removeOfflineTrack error:", err);
    return false;
  }
}

/**
 * Downloads all tracks in a playlist for offline listening.
 * Tracks progress live without blocking the UI.
 * 
 * @param {object} playlist - Playlist object with tracks array
 * @param {function} [onProgress] - Callback: ({ current, total, trackTitle, successCount, failedCount, failedTracks })
 * @returns {Promise<{ success: boolean, total: number, successCount: number, failedCount: number, failedTracks: Array }>}
 */
export async function downloadPlaylist(playlist, onProgress = null) {
  if (!playlist || !Array.isArray(playlist.tracks) || playlist.tracks.length === 0) {
    return { success: false, total: 0, successCount: 0, failedCount: 0, failedTracks: [] };
  }

  const playlistId = String(playlist.id);
  const total = playlist.tracks.length;
  let successCount = 0;
  let failedCount = 0;
  const failedTracks = [];
  const downloadedIds = [];

  for (let i = 0; i < total; i++) {
    const track = playlist.tracks[i];
    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        trackTitle: track.title,
        successCount,
        failedCount,
        failedTracks,
      });
    }

    const res = await downloadTrack(track, playlistId);
    if (res.success) {
      successCount++;
      downloadedIds.push(String(track.id));
    } else {
      failedCount++;
      failedTracks.push({ track, error: res.error });
    }
  }

  // Update playlist meta record in IndexedDB
  try {
    const db = await openOfflineDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORES.PLAYLISTS_META, "readwrite");
      const store = tx.objectStore(STORES.PLAYLISTS_META);
      store.put({
        playlistId,
        title: playlist.title || "Playlist",
        coverUrl: playlist.coverUrl || "",
        totalTracks: total,
        downloadedTrackIds: downloadedIds,
        updatedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    console.warn("[OfflineStorage] Could not save playlist offline meta:", e);
  }

  return {
    success: successCount === total,
    total,
    successCount,
    failedCount,
    failedTracks,
  };
}

/**
 * Retrieves all playlists downloaded for offline listening.
 * @returns {Promise<Array<object>>}
 */
export async function getOfflinePlaylists() {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PLAYLISTS_META, "readonly");
      const store = tx.objectStore(STORES.PLAYLISTS_META);
      const req = store.getAll();
      req.onsuccess = (e) => {
        const playlists = e.target.result || [];
        playlists.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        resolve(playlists);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("[OfflineStorage] getOfflinePlaylists error:", err);
    return [];
  }
}

/**
 * Checks the offline download status of a playlist.
 * 
 * @param {string} playlistId
 * @param {Array<object>} tracks
 * @returns {Promise<{ isOffline: boolean, downloadedCount: number, totalCount: number, isPartial: boolean }>}
 */
export async function getPlaylistOfflineStatus(playlistId, tracks = []) {
  if (!playlistId || !Array.isArray(tracks) || tracks.length === 0) {
    return { isOffline: false, downloadedCount: 0, totalCount: 0, isPartial: false };
  }

  const offlineTrackIds = await getOfflineTrackIds();
  const totalCount = tracks.length;
  const downloadedCount = tracks.filter((t) => offlineTrackIds.has(String(t.id))).length;

  return {
    isOffline: downloadedCount > 0 && downloadedCount === totalCount,
    downloadedCount,
    totalCount,
    isPartial: downloadedCount > 0 && downloadedCount < totalCount,
  };
}

/**
 * Removes an entire playlist from offline storage.
 * Does NOT delete the playlist from Supabase or library.
 * Cleans up local audio blobs for tracks that do not belong to other offline playlists.
 * 
 * @param {string} playlistId
 * @param {Array<object>} [tracks]
 * @returns {Promise<boolean>}
 */
export async function removePlaylistOffline(playlistId, tracks = []) {
  if (!playlistId) return false;
  const pid = String(playlistId);

  try {
    const db = await openOfflineDB();

    // 1. Remove from offline_playlists_meta
    await new Promise((resolve) => {
      const tx = db.transaction(STORES.PLAYLISTS_META, "readwrite");
      tx.objectStore(STORES.PLAYLISTS_META).delete(pid);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });

    // 2. Disassociate tracks from this playlist
    const targetTracks = Array.isArray(tracks) && tracks.length > 0
      ? tracks
      : await getOfflineTracks();

    for (const track of targetTracks) {
      const tid = String(track.id || track.trackId);
      await removeOfflineTrack(tid, pid);
    }

    return true;
  } catch (err) {
    console.error("[OfflineStorage] removePlaylistOffline error:", err);
    return false;
  }
}

/**
 * Calculates current offline storage statistics.
 * @returns {Promise<{ totalBytes: number, trackCount: number, formattedSize: string, isPersisted: boolean }>}
 */
export async function getOfflineStorageStats() {
  try {
    const db = await openOfflineDB();
    const tracks = await getOfflineTracks();
    let totalBytes = 0;

    await new Promise((resolve) => {
      const tx = db.transaction(STORES.AUDIO, "readonly");
      const store = tx.objectStore(STORES.AUDIO);
      const req = store.openCursor();

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          totalBytes += cursor.value?.size || 0;
          cursor.continue();
        } else {
          resolve();
        }
      };

      req.onerror = () => resolve();
    });

    const persisted = await isStoragePersisted();

    return {
      totalBytes,
      trackCount: tracks.length,
      formattedSize: formatStorageSize(totalBytes),
      isPersisted: persisted,
    };
  } catch (err) {
    console.error("[OfflineStorage] getOfflineStorageStats error:", err);
    return {
      totalBytes: 0,
      trackCount: 0,
      formattedSize: "0 MB",
      isPersisted: false,
    };
  }
}

/**
 * Formats byte size into human readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatStorageSize(bytes = 0) {
  if (!bytes || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}
