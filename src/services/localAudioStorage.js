/**
 * Local Audio Storage Service (IndexedDB)
 * 
 * Provides persistent offline storage for user-uploaded audio files
 * (mashups, DJ mixes, YouTube audio downloads) with support for files of any size.
 * Audio blobs are kept safely in IndexedDB and revived on demand via URL.createObjectURL.
 */

const DB_NAME = "CeepeefyAudioDB";
const DB_VERSION = 1;
const STORE_NAME = "audio_files";

// Cache active Object URLs to prevent redundant Blob-to-URL allocations
const activeUrlCache = new Map();

/**
 * Initializes and returns the IndexedDB instance.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "trackId" });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error || new Error("Failed to open IndexedDB"));
    };
  });
}

/**
 * Saves an audio file or blob into IndexedDB.
 * @param {string} trackId Unique track ID
 * @param {Blob|File} fileOrBlob Raw audio binary
 * @param {object} meta Optional metadata (fileName, fileType, fileSize)
 * @returns {Promise<boolean>}
 */
export async function saveLocalAudioFile(trackId, fileOrBlob, meta = {}) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const record = {
        trackId,
        blob: fileOrBlob,
        fileName: meta.fileName || fileOrBlob.name || "mix.mp3",
        fileType: meta.fileType || fileOrBlob.type || "audio/mpeg",
        fileSize: meta.fileSize || fileOrBlob.size || 0,
        updatedAt: Date.now(),
      };

      const request = store.put(record);

      request.onsuccess = () => {
        // Pre-cache object URL for instant playback
        if (activeUrlCache.has(trackId)) {
          URL.revokeObjectURL(activeUrlCache.get(trackId));
        }
        const url = URL.createObjectURL(fileOrBlob);
        activeUrlCache.set(trackId, url);
        resolve(true);
      };

      request.onerror = (e) => {
        console.error("[LocalAudio] Error saving audio blob:", e);
        reject(e.target.error);
      };
    });
  } catch (err) {
    console.error("[LocalAudio] saveLocalAudioFile error:", err);
    return false;
  }
}

/**
 * Retrieves the raw Audio Blob from IndexedDB.
 * @param {string} trackId
 * @returns {Promise<Blob|null>}
 */
export async function getLocalAudioBlob(trackId) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(trackId);

      request.onsuccess = (e) => {
        const result = e.target.result;
        resolve(result?.blob || null);
      };

      request.onerror = (e) => {
        console.error("[LocalAudio] Error retrieving audio blob:", e);
        reject(e.target.error);
      };
    });
  } catch (err) {
    console.error("[LocalAudio] getLocalAudioBlob error:", err);
    return null;
  }
}

/**
 * Retrieves a playable Object URL for the stored audio track.
 * Caches URLs in memory and revives them from IndexedDB across page reloads.
 * @param {string} trackId
 * @returns {Promise<string|null>}
 */
export async function getLocalAudioUrl(trackId) {
  if (activeUrlCache.has(trackId)) {
    return activeUrlCache.get(trackId);
  }

  const blob = await getLocalAudioBlob(trackId);
  if (!blob) {
    console.warn(`[LocalAudio] No stored blob found for trackId: ${trackId}`);
    return null;
  }

  const url = URL.createObjectURL(blob);
  activeUrlCache.set(trackId, url);
  return url;
}

/**
 * Deletes a stored audio file and revokes its Object URL.
 * @param {string} trackId
 * @returns {Promise<boolean>}
 */
export async function deleteLocalAudioFile(trackId) {
  if (activeUrlCache.has(trackId)) {
    try {
      URL.revokeObjectURL(activeUrlCache.get(trackId));
    } catch {}
    activeUrlCache.delete(trackId);
  }

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(trackId);

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    console.error("[LocalAudio] deleteLocalAudioFile error:", err);
    return false;
  }
}

/**
 * Deletes multiple audio files in batch (e.g. when an entire Self Mix is deleted).
 * @param {Array<string>} trackIds
 * @returns {Promise<void>}
 */
export async function deleteLocalAudioFiles(trackIds = []) {
  if (!Array.isArray(trackIds) || trackIds.length === 0) return;
  await Promise.all(trackIds.map((id) => deleteLocalAudioFile(id)));
}

/**
 * Inspects an audio file/blob and determines its playback duration in seconds.
 * @param {Blob|File} file
 * @returns {Promise<number>} Duration in seconds (rounded)
 */
export function getAudioFileDuration(file) {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !file) {
      resolve(180);
      return;
    }

    try {
      const tempUrl = URL.createObjectURL(file);
      const audio = new Audio();

      const cleanup = () => {
        URL.revokeObjectURL(tempUrl);
        audio.removeAttribute("src");
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve(180); // fallback if metadata hangs
      }, 5000);

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
      audio.src = tempUrl;
    } catch {
      resolve(180);
    }
  });
}

/**
 * Formats file size in bytes to human-readable string (e.g. 15.2 MB).
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
