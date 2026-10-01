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
const DB_VERSION = 1;
const STORE_TRACKS = "device_tracks";
const STORE_RECENT = "recent_played";

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
 * Processes a list of imported Files into structured Ceepeefy local tracks
 * @param {Array<File>} files
 * @param {Function} [onProgress]
 * @returns {Promise<Array<object>>}
 */
export async function processImportedFiles(files = [], onProgress = null) {
  const processedTracks = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
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
  if (!bytes || bytes <= 0) return "0 KB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${Math.round(kb)} KB`;
}
