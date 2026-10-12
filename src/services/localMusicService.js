/**
 * Local Music Service (IndexedDB + Audio Metadata Parser)
 * 
 * Provides full local music library functionality:
 * - Scans and imports audio files directly from the user's device (MP3, M4A, FLAC, WAV, OGG, AAC)
 * - Parses ID3v2 tags (Title, Artist, Album, Cover Artwork APIC)
 * - Persists audio binary Blobs safely inside IndexedDB (never uploaded to any server)
 * - Provides organized views: All Songs, Recently Played, Artists, Albums, Folders
 * - Instant 0ms playback via URL.createObjectURL
 */

const DB_NAME = "CeepeefyLocalMusicDB";
const DB_VERSION = 2;
const STORE_TRACKS = "device_tracks";
const STORE_RECENT = "recent_played";
const STORE_PLAYLISTS = "local_playlists";

// In-memory active Object URL cache to prevent duplicate Blob allocations
const activeLocalUrlCache = new Map();

/**
 * Opens or initializes the local music IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
export function openLocalMusicDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported on this device."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        const trackStore = db.createObjectStore(STORE_TRACKS, { keyPath: "id" });
        trackStore.createIndex("artist", "artist", { unique: false });
        trackStore.createIndex("album", "album", { unique: false });
        trackStore.createIndex("folder", "folder", { unique: false });
        trackStore.createIndex("addedAt", "addedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_RECENT)) {
        db.createObjectStore(STORE_RECENT, { keyPath: "trackId" });
      }
      if (!db.objectStoreNames.contains(STORE_PLAYLISTS)) {
        const playlistStore = db.createObjectStore(STORE_PLAYLISTS, { keyPath: "id" });
        playlistStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error || new Error("Failed to open local music database"));
  });
}

/**
 * Extracts ID3v2 metadata (Title, Artist, Album, Embedded Picture) from an audio file
 * @param {File} file
 * @returns {Promise<{ title?: string, artist?: string, album?: string, coverBlob?: Blob }>}
 */
export async function parseID3Tags(file) {
  try {
    // Read first 256KB for ID3 header and standard frames
    const headerChunk = await file.slice(0, Math.min(262144, file.size)).arrayBuffer();
    const bytes = new Uint8Array(headerChunk);

    if (bytes.length < 10) return {};
    // Check "ID3" identifier
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
      return {};
    }

    const majorVersion = bytes[3];
    if (majorVersion < 3 || majorVersion > 4) return {};

    // Compute tag size (syncsafe integer: 4 bytes of 7 bits each)
    const tagSize =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);

    const fullTagBuffer =
      tagSize + 10 <= bytes.length
        ? headerChunk
        : await file.slice(0, Math.min(tagSize + 10, file.size)).arrayBuffer();

    const tagBytes = new Uint8Array(fullTagBuffer);
    let offset = 10;
    const meta = {};

    const decodeText = (frameBytes, encodingByte) => {
      try {
        if (encodingByte === 1 || encodingByte === 2) {
          const dec = new TextDecoder("utf-16");
          return dec.decode(frameBytes).replace(/\0/g, "").trim();
        }
        if (encodingByte === 3) {
          const dec = new TextDecoder("utf-8");
          return dec.decode(frameBytes).replace(/\0/g, "").trim();
        }
        const dec = new TextDecoder("iso-8859-1");
        return dec.decode(frameBytes).replace(/\0/g, "").trim();
      } catch {
        return "";
      }
    };

    while (offset + 10 < tagBytes.length) {
      const frameId = String.fromCharCode(
        tagBytes[offset],
        tagBytes[offset + 1],
        tagBytes[offset + 2],
        tagBytes[offset + 3]
      );

      // Frame ID must be uppercase alphanumeric
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

      let frameSize = 0;
      if (majorVersion === 4) {
        // Syncsafe integer in v2.4
        frameSize =
          ((tagBytes[offset + 4] & 0x7f) << 21) |
          ((tagBytes[offset + 5] & 0x7f) << 14) |
          ((tagBytes[offset + 6] & 0x7f) << 7) |
          (tagBytes[offset + 7] & 0x7f);
      } else {
        // Standard 32-bit int in v2.3
        frameSize =
          (tagBytes[offset + 4] << 24) |
          (tagBytes[offset + 5] << 16) |
          (tagBytes[offset + 6] << 8) |
          tagBytes[offset + 7];
      }

      if (frameSize <= 0 || offset + 10 + frameSize > tagBytes.length) break;

      const frameData = tagBytes.slice(offset + 10, offset + 10 + frameSize);
      const encoding = frameData[0];

      if (frameId === "TIT2" && !meta.title) {
        meta.title = decodeText(frameData.slice(1), encoding);
      } else if (frameId === "TPE1" && !meta.artist) {
        meta.artist = decodeText(frameData.slice(1), encoding);
      } else if (frameId === "TALB" && !meta.album) {
        meta.album = decodeText(frameData.slice(1), encoding);
      } else if (frameId === "APIC" && !meta.coverBlob) {
        // Picture frame
        try {
          let pos = 1;
          // Find null terminator for MIME string
          let mime = "image/jpeg";
          let mimeEnd = pos;
          while (mimeEnd < frameData.length && frameData[mimeEnd] !== 0) mimeEnd++;
          if (mimeEnd > pos) {
            const mimeDec = new TextDecoder("iso-8859-1").decode(frameData.slice(pos, mimeEnd));
            if (mimeDec.includes("/")) mime = mimeDec;
          }
          pos = mimeEnd + 1;
          const picType = frameData[pos]; // e.g. 0x03 is front cover
          pos++;
          // Skip description null terminator
          if (encoding === 1 || encoding === 2) {
            while (pos + 1 < frameData.length && !(frameData[pos] === 0 && frameData[pos + 1] === 0)) {
              pos += 2;
            }
            pos += 2;
          } else {
            while (pos < frameData.length && frameData[pos] !== 0) pos++;
            pos++;
          }
          if (pos < frameData.length) {
            const rawImageBytes = frameData.slice(pos);
            meta.coverBlob = new Blob([rawImageBytes], { type: mime });
          }
        } catch {}
      }

      offset += 10 + frameSize;
    }

    return meta;
  } catch (err) {
    console.warn("[LocalMusic] Failed to parse ID3 tags:", err);
    return {};
  }
}

/**
 * Inspects audio file duration via HTML5 Audio element
 * @param {File|Blob} file
 * @returns {Promise<number>} Duration in seconds
 */
export function getAudioDuration(file) {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !file) {
      resolve(180);
      return;
    }

    try {
      const url = URL.createObjectURL(file);
      const audio = new Audio();

      const cleanup = () => {
        URL.revokeObjectURL(url);
        audio.removeAttribute("src");
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve(180);
      }, 4000);

      audio.addEventListener(
        "loadedmetadata",
        () => {
          clearTimeout(timer);
          const dur = Math.round(audio.duration) || 180;
          cleanup();
          resolve(dur);
        },
        { once: true }
      );

      audio.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          cleanup();
          resolve(180);
        },
        { once: true }
      );

      audio.preload = "metadata";
      audio.src = url;
    } catch {
      resolve(180);
    }
  });
}

/**
 * Intelligent file-name cleaner to extract Artist and Song Title when tags are missing
 * e.g. "01 - Linkin Park - In the End.mp3" -> { artist: "Linkin Park", title: "In the End" }
 */
export function cleanFileNameMetadata(fileName = "") {
  let name = fileName.replace(/\.[^/.]+$/, "").trim(); // strip extension
  name = name.replace(/^\d+[\s._-]+/, "").trim(); // strip track number prefix like "01. " or "01 - "

  if (name.includes(" - ")) {
    const parts = name.split(" - ");
    if (parts.length >= 2) {
      return {
        artist: parts[0].trim(),
        title: parts.slice(1).join(" - ").trim(),
      };
    }
  }

  return {
    artist: "Unknown Artist",
    title: name || "Untitled Track",
  };
}

/**
 * Processes a list of imported Files into structured Ceepeefy local tracks.
 * Handles duplicate detection, ID3 tags extraction, filename clean fallbacks, and audio durations.
 * @param {Array<File>} files
 * @param {Array<object>|Function} [arg2] Existing tracks array or onProgress callback
 * @param {Function} [arg3] onProgress callback
 * @returns {Promise<Array<object>>} Processed tracks array with .duplicateCount and .skippedCount attached
 */
export async function processImportedFiles(files = [], arg2 = null, arg3 = null) {
  let existingTracks = [];
  let onProgress = null;

  if (typeof arg2 === "function") {
    onProgress = arg2;
  } else if (Array.isArray(arg2)) {
    existingTracks = arg2;
    if (typeof arg3 === "function") onProgress = arg3;
  }

  const existingSet = new Set(
    existingTracks.map((t) => `${(t.fileName || "").toLowerCase()}__${t.fileSize || 0}`)
  );

  const processedTracks = [];
  let duplicateCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // Check supported format
    const isAudio =
      file.type?.startsWith("audio/") ||
      /\.(mp3|m4a|aac|wav|flac|ogg|opus|webm)$/i.test(file.name);
    if (!isAudio) {
      skippedCount++;
      continue;
    }

    // Check duplicate
    const key = `${(file.name || "").toLowerCase()}__${file.size || 0}`;
    if (existingSet.has(key)) {
      duplicateCount++;
      continue;
    }
    existingSet.add(key);

    if (onProgress) {
      onProgress(i + 1, files.length, file.name);
    }

    // 1. Tag parsing & fallback
    const id3 = await parseID3Tags(file);
    const fallback = cleanFileNameMetadata(file.name);

    const title = id3.title?.trim() || fallback.title || file.name;
    const artist = id3.artist?.trim() || fallback.artist || "Device Artist";
    const album = id3.album?.trim() || "Device Music";

    // 2. Duration
    const durationSecs = await getAudioDuration(file);
    const mins = Math.floor(durationSecs / 60);
    const secs = durationSecs % 60;
    const durationFormatted = `${mins}:${secs < 10 ? "0" : ""}${secs}`;

    // 3. Folder determination (from webkitRelativePath if available)
    let folder = "All Music";
    if (file.webkitRelativePath) {
      const parts = file.webkitRelativePath.split("/");
      if (parts.length > 1) {
        folder = parts.slice(0, parts.length - 1).join("/");
      }
    }

    // 4. Artwork URL from embedded Blob or fallback
    let coverUrl = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80";
    if (id3.coverBlob) {
      try {
        coverUrl = URL.createObjectURL(id3.coverBlob);
      } catch {}
    }

    const trackId = `local-dev-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 6)}`;

    processedTracks.push({
      id: trackId,
      title,
      artist,
      album,
      duration: durationSecs,
      durationFormatted,
      folder,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || "audio/mpeg",
      coverUrl,
      coverBlob: id3.coverBlob || null,
      blob: file, // stored in IndexedDB
      isLocal: true,
      source: "local-device",
      badge: "LOCAL",
      badgeType: "cyan",
      addedAt: Date.now(),
    });
  }

  // Attach metrics
  processedTracks.duplicateCount = duplicateCount;
  processedTracks.skippedCount = skippedCount;
  processedTracks.total = files.length;
  processedTracks.tracks = processedTracks;

  return processedTracks;
}

/**
 * Saves processed local tracks into IndexedDB
 * @param {Array<object>} tracks
 * @returns {Promise<boolean>}
 */
export async function saveLocalDeviceTracks(tracks = []) {
  if (!Array.isArray(tracks) || tracks.length === 0) return false;

  try {
    const db = await openLocalMusicDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_TRACKS, "readwrite");
      const store = tx.objectStore(STORE_TRACKS);

      tracks.forEach((track) => {
        store.put(track);
      });

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => {
        console.error("[LocalMusic] Error storing tracks in IndexedDB:", e);
        reject(e.target.error);
      };
    });
  } catch (err) {
    console.error("[LocalMusic] saveLocalDeviceTracks error:", err);
    return false;
  }
}

/**
 * Retrieves all saved local tracks from IndexedDB
 * @returns {Promise<Array<object>>}
 */
export async function getAllLocalDeviceTracks() {
  try {
    const db = await openLocalMusicDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_TRACKS, "readonly");
      const store = tx.objectStore(STORE_TRACKS);
      const req = store.getAll();

      req.onsuccess = () => {
        const rawTracks = req.result || [];
        // Revive cover URLs if stored with coverBlob
        const revived = rawTracks.map((t) => {
          let coverUrl = t.coverUrl;
          if (t.coverBlob && (!coverUrl || coverUrl.startsWith("blob:null") || !coverUrl.startsWith("http"))) {
            try {
              coverUrl = URL.createObjectURL(t.coverBlob);
            } catch {}
          }
          return {
            ...t,
            coverUrl: coverUrl || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80",
          };
        });
        resolve(revived);
      };
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    console.error("[LocalMusic] getAllLocalDeviceTracks error:", err);
    return [];
  }
}

/**
 * Retrieves a playable Object URL for a specific local track ID
 * @param {string} trackId
 * @returns {Promise<string|null>}
 */
export async function getLocalDeviceTrackUrl(trackId) {
  if (activeLocalUrlCache.has(trackId)) {
    return activeLocalUrlCache.get(trackId);
  }

  try {
    const db = await openLocalMusicDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_TRACKS, "readonly");
      const store = tx.objectStore(STORE_TRACKS);
      const req = store.get(trackId);

      req.onsuccess = () => {
        const record = req.result;
        if (record && record.blob) {
          const url = URL.createObjectURL(record.blob);
          activeLocalUrlCache.set(trackId, url);
          resolve(url);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    console.warn("[LocalMusic] getLocalDeviceTrackUrl error:", e);
    return null;
  }
}

/**
 * Deletes a single track from the local library
 * @param {string} trackId
 * @returns {Promise<boolean>}
 */
export async function deleteLocalDeviceTrack(trackId) {
  if (activeLocalUrlCache.has(trackId)) {
    try {
      URL.revokeObjectURL(activeLocalUrlCache.get(trackId));
    } catch {}
    activeLocalUrlCache.delete(trackId);
  }

  try {
    const db = await openLocalMusicDB();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_TRACKS, STORE_RECENT], "readwrite");
      tx.objectStore(STORE_TRACKS).delete(trackId);
      tx.objectStore(STORE_RECENT).delete(trackId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.error("[LocalMusic] deleteLocalDeviceTrack error:", err);
    return false;
  }
}

/**
 * Deletes all tracks from the local music library
 * @returns {Promise<boolean>}
 */
export async function clearAllLocalDeviceTracks() {
  activeLocalUrlCache.forEach((url) => {
    try { URL.revokeObjectURL(url); } catch {}
  });
  activeLocalUrlCache.clear();

  try {
    const db = await openLocalMusicDB();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_TRACKS, STORE_RECENT], "readwrite");
      tx.objectStore(STORE_TRACKS).clear();
      tx.objectStore(STORE_RECENT).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.error("[LocalMusic] clearAllLocalDeviceTracks error:", err);
    return false;
  }
}

/**
 * Records a local track play to recently played local store
 * @param {string} trackId
 */
export async function recordLocalRecentlyPlayed(trackId) {
  try {
    const db = await openLocalMusicDB();
    const tx = db.transaction(STORE_RECENT, "readwrite");
    tx.objectStore(STORE_RECENT).put({ trackId, playedAt: Date.now() });
  } catch {}
}

/**
 * Retrieves the recently played local tracks
 * @param {Array<object>} allTracks
 * @returns {Promise<Array<object>>}
 */
export async function getLocalRecentlyPlayedTracks(allTracks = []) {
  try {
    const db = await openLocalMusicDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_RECENT, "readonly");
      const store = tx.objectStore(STORE_RECENT);
      const req = store.getAll();

      req.onsuccess = () => {
        const records = req.result || [];
        records.sort((a, b) => b.playedAt - a.playedAt);
        const trackMap = new Map(allTracks.map((t) => [t.id, t]));
        const recentTracks = records
          .map((r) => trackMap.get(r.trackId))
          .filter(Boolean);
        resolve(recentTracks);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/**
 * Formats file size in bytes to readable string (e.g. 15.2 MB)
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes = 0) {
  if (!bytes || bytes <= 0) return "0 MB";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${Math.round(kb)} KB`;
}

/**
 * Retrieves all user-created local playlists.
 * Persists in IndexedDB with localStorage mirroring.
 * @returns {Promise<Array<object>>}
 */
export async function getAllLocalPlaylists() {
  try {
    const db = await openLocalMusicDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PLAYLISTS, "readonly");
      const store = tx.objectStore(STORE_PLAYLISTS);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        if (list.length === 0 && typeof localStorage !== "undefined") {
          try {
            const raw = localStorage.getItem("ceepeefy_local_playlists");
            if (raw) return resolve(JSON.parse(raw));
          } catch {}
        }
        resolve(list);
      };
      req.onerror = () => {
        if (typeof localStorage !== "undefined") {
          try {
            const raw = localStorage.getItem("ceepeefy_local_playlists");
            if (raw) return resolve(JSON.parse(raw));
          } catch {}
        }
        resolve([]);
      };
    });
  } catch (err) {
    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem("ceepeefy_local_playlists");
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return [];
  }
}

/**
 * Saves or updates a local playlist.
 * @param {object} playlist
 * @returns {Promise<boolean>}
 */
export async function saveLocalPlaylist(playlist) {
  if (!playlist || !playlist.id) return false;

  const record = {
    ...playlist,
    updatedAt: Date.now(),
  };

  try {
    const db = await openLocalMusicDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PLAYLISTS, "readwrite");
      const store = tx.objectStore(STORE_PLAYLISTS);
      store.put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn("[LocalMusic] Failed to save playlist in IndexedDB:", err);
  }

  // Mirror to localStorage
  if (typeof localStorage !== "undefined") {
    try {
      const existing = await getAllLocalPlaylists();
      const updated = existing.some((p) => p.id === record.id)
        ? existing.map((p) => (p.id === record.id ? record : p))
        : [record, ...existing];
      localStorage.setItem("ceepeefy_local_playlists", JSON.stringify(updated));
    } catch {}
  }

  return true;
}

/**
 * Deletes a local playlist from IndexedDB and localStorage.
 * CRITICAL RULE: Underlying audio files are strictly NOT deleted.
 * @param {string} playlistId
 * @returns {Promise<boolean>}
 */
export async function deleteLocalPlaylist(playlistId) {
  if (!playlistId) return false;

  try {
    const db = await openLocalMusicDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_PLAYLISTS, "readwrite");
      tx.objectStore(STORE_PLAYLISTS).delete(playlistId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn("[LocalMusic] deleteLocalPlaylist error:", err);
  }

  if (typeof localStorage !== "undefined") {
    try {
      const existing = await getAllLocalPlaylists();
      const filtered = existing.filter((p) => p.id !== playlistId);
      localStorage.setItem("ceepeefy_local_playlists", JSON.stringify(filtered));
    } catch {}
  }

  return true;
}

/**
 * Adds tracks to a local playlist.
 * @param {string} playlistId
 * @param {Array<string>} trackIds
 * @returns {Promise<boolean>}
 */
export async function addTracksToLocalPlaylist(playlistId, trackIds = []) {
  if (!playlistId || !Array.isArray(trackIds) || trackIds.length === 0) return false;
  const playlists = await getAllLocalPlaylists();
  const playlist = playlists.find((p) => p.id === playlistId);
  if (!playlist) return false;

  const currentIds = Array.isArray(playlist.trackIds) ? [...playlist.trackIds] : [];
  trackIds.forEach((id) => {
    if (!currentIds.includes(id)) {
      currentIds.push(id);
    }
  });

  return saveLocalPlaylist({
    ...playlist,
    trackIds: currentIds,
  });
}

/**
 * Removes a track from a local playlist by track ID or index.
 * CRITICAL RULE: Removes membership only; does NOT delete local file.
 * @param {string} playlistId
 * @param {string|number} trackIdOrIndex
 * @returns {Promise<boolean>}
 */
export async function removeTrackFromLocalPlaylist(playlistId, trackIdOrIndex) {
  if (!playlistId || trackIdOrIndex === undefined || trackIdOrIndex === null) return false;
  const playlists = await getAllLocalPlaylists();
  const playlist = playlists.find((p) => p.id === playlistId);
  if (!playlist) return false;

  let currentIds = Array.isArray(playlist.trackIds) ? [...playlist.trackIds] : [];
  if (typeof trackIdOrIndex === "number") {
    currentIds.splice(trackIdOrIndex, 1);
  } else {
    currentIds = currentIds.filter((id) => id !== trackIdOrIndex);
  }

  return saveLocalPlaylist({
    ...playlist,
    trackIds: currentIds,
  });
}

/**
 * Reorders tracks in a local playlist.
 * @param {string} playlistId
 * @param {Array<string>} newTrackIds
 * @returns {Promise<boolean>}
 */
export async function reorderLocalPlaylistTracks(playlistId, newTrackIds = []) {
  if (!playlistId || !Array.isArray(newTrackIds)) return false;
  const playlists = await getAllLocalPlaylists();
  const playlist = playlists.find((p) => p.id === playlistId);
  if (!playlist) return false;

  return saveLocalPlaylist({
    ...playlist,
    trackIds: newTrackIds,
  });
}

/**
 * Scans a folder using File System Access API where supported by browser/device.
 * Gracefully handles abort or unsupported platforms (e.g. mobile sandbox).
 */
export async function scanDirectoryWithFSA(onProgress = null) {
  if (typeof window === "undefined" || !window.showDirectoryPicker) {
    return {
      supported: false,
      error: "Directory scanning is not supported by your browser sandbox. Mobile devices require manual file selection.",
    };
  }

  try {
    const dirHandle = await window.showDirectoryPicker();
    const files = [];

    async function scanDir(handle, path = "") {
      for await (const entry of handle.values()) {
        if (entry.kind === "file") {
          if (/\.(mp3|m4a|aac|wav|flac|ogg|opus|webm)$/i.test(entry.name)) {
            const file = await entry.getFile();
            Object.defineProperty(file, "webkitRelativePath", {
              value: path ? `${path}/${entry.name}` : entry.name,
              configurable: true,
            });
            files.push(file);
            if (onProgress) onProgress(files.length, entry.name);
          }
        } else if (entry.kind === "directory") {
          await scanDir(entry, path ? `${path}/${entry.name}` : entry.name);
        }
      }
    }

    await scanDir(dirHandle, dirHandle.name);
    return { supported: true, files };
  } catch (err) {
    if (err.name === "AbortError") {
      return { supported: true, cancelled: true, files: [] };
    }
    console.warn("[LocalMusic] FSA scan error:", err);
    return { supported: false, error: err.message };
  }
}

