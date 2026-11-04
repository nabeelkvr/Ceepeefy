import { createClient } from "@supabase/supabase-js";
import { DEFAULT_USER_ID } from "../config/authConfig.js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = () => {
  return (
    Boolean(supabaseUrl) &&
    Boolean(supabaseAnonKey) &&
    !supabaseUrl.includes("your-project-id")
  );
};

export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const BUCKET_NAME = "self-mixes";

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
 * Uploads an audio file (.mp3 or .wav) using authorized signed upload URLs
 * Scopes upload destination strictly to authenticated user's namespace
 * @param {File} file - Audio file (.mp3 or .wav)
 * @param {string} owner - Account handle (default DEFAULT_USER_ID)
 * @returns {Promise<{ publicUrl: string, filePath: string }>}
 */
export const uploadAudioToCloud = async (file, owner = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  // Validate file format (.mp3 or .wav)
  const isMp3OrWav =
    /\.(mp3|wav)$/i.test(file.name) ||
    file.type === "audio/mpeg" ||
    file.type === "audio/wav" ||
    file.type === "audio/x-wav";

  if (!isMp3OrWav) {
    throw new Error("Invalid file format. Only .mp3 and .wav audio files are supported.");
  }

  const contentType = file.name.endsWith(".wav")
    ? "audio/wav"
    : file.type || "audio/mpeg";

  // 1. Request short-lived signed upload URL from authenticated route handler
  const signRes = await apiFetch("/api/storage/signed-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileType: contentType,
      folder: "audio",
    }),
  });

  if (!signRes.ok) {
    const err = await signRes.json().catch(() => ({}));
    throw new Error(err.error || "Failed to obtain authorized upload credentials.");
  }

  const { path, token, publicUrl } = await signRes.json();

  // 2. Perform upload via signed URL token
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .uploadToSignedUrl(path, token, file, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    console.error("[Supabase Storage] uploadToSignedUrl failed:", uploadError);
    throw uploadError;
  }

  return {
    publicUrl,
    filePath: path,
  };
};

/**
 * Converts a data URL to a Blob
 */
const dataUrlToBlob = (dataUrl) => {
  const parts = dataUrl.split(",");
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

/**
 * Uploads a playlist cover image using authorized signed upload URLs
 * Accepts File, Blob, or base64 data URL
 * @param {File|Blob|string} imageFileOrData - Image file, blob, or data URL
 * @param {string} playlistId - Associated playlist ID
 * @param {string} owner - Account handle (default DEFAULT_USER_ID)
 * @returns {Promise<{ publicUrl: string, filePath: string }>}
 */
export const uploadPlaylistCoverToCloud = async (imageFileOrData, playlistId, owner = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  if (!imageFileOrData) {
    throw new Error("No cover image provided.");
  }

  let fileToUpload = imageFileOrData;
  let contentType = "image/jpeg";
  let extension = "jpg";

  if (typeof imageFileOrData === "string" && imageFileOrData.startsWith("data:")) {
    fileToUpload = dataUrlToBlob(imageFileOrData);
    contentType = fileToUpload.type || "image/jpeg";
  } else if (imageFileOrData instanceof Blob || (typeof File !== "undefined" && imageFileOrData instanceof File)) {
    contentType = imageFileOrData.type || "image/jpeg";
  }

  if (contentType.includes("png")) extension = "png";
  else if (contentType.includes("webp")) extension = "webp";
  else if (contentType.includes("gif")) extension = "gif";

  const cleanId = String(playlistId || `cover-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, "_");

  // 1. Request short-lived signed upload URL from authenticated route handler
  const signRes = await apiFetch("/api/storage/signed-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: `cover_${cleanId}.${extension}`,
      fileType: contentType,
      folder: "covers",
      playlistId: cleanId,
      upsert: true,
    }),
  });

  if (!signRes.ok) {
    const err = await signRes.json().catch(() => ({}));
    throw new Error(err.error || "Failed to obtain cover upload credentials.");
  }

  const { path, token, publicUrl } = await signRes.json();

  // 2. Perform upload via signed URL token
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .uploadToSignedUrl(path, token, fileToUpload, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    console.error("[Supabase Storage] Cover uploadToSignedUrl failed:", uploadError);
    throw uploadError;
  }

  return {
    publicUrl,
    filePath: path,
  };
};

/**
 * Mirrors a remote image (e.g. Spotify original cover art) into Supabase cloud storage
 * Returns the durable Supabase public URL if successful, or null on error
 * @param {string} remoteUrl - URL of remote artwork
 * @param {string} playlistId - Associated playlist ID
 * @param {string} owner - Account handle (default DEFAULT_USER_ID)
 * @returns {Promise<string|null>} Durable Supabase storage URL or null
 */
export const mirrorRemoteArtworkToCloud = async (remoteUrl, playlistId, owner = DEFAULT_USER_ID) => {
  if (!supabase || !isSupabaseConfigured() || !remoteUrl || typeof remoteUrl !== "string") {
    return null;
  }
  if (remoteUrl.includes(BUCKET_NAME) && remoteUrl.includes("supabase.co")) {
    return remoteUrl; // Already in Supabase Storage
  }

  try {
    let res;
    try {
      res = await fetch(remoteUrl, { cache: "no-store" });
    } catch {
      const proxyUrl = `/api/spotify/image-proxy?url=${encodeURIComponent(remoteUrl)}`;
      res = await fetch(proxyUrl, { cache: "no-store" });
    }

    if (!res || !res.ok) return null;
    const blob = await res.blob();
    const result = await uploadPlaylistCoverToCloud(blob, playlistId, owner);
    return result?.publicUrl || null;
  } catch (err) {
    console.warn("[Supabase Storage] Notice mirroring artwork to storage:", err?.message || err);
    return null;
  }
};

/**
 * Saves a Self Mix record through authenticated API Route
 * @param {Object} mixData - Self mix details
 * @returns {Promise<Object>}
 */
export const saveSelfMixToCloud = async (mixData) => {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }

  const res = await apiFetch("/api/library/self-mixes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mix: mixData }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save self mix.");
  }

  const data = await res.json();
  return data.mix;
};

/**
 * Fetches all Self Mix tracks for the account from authenticated API Route
 * @param {string} owner - Account handle (default DEFAULT_USER_ID)
 * @returns {Promise<Array>}
 */
export const fetchSelfMixesFromCloud = async (owner = DEFAULT_USER_ID) => {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    const res = await apiFetch("/api/library/self-mixes");
    if (!res.ok) return [];

    const data = await res.json();
    return Array.isArray(data.mixes) ? data.mixes : [];
  } catch (err) {
    console.error("[SupabaseClient] Error fetching self mixes:", err);
    return [];
  }
};

/**
 * Deletes a Self Mix track from cloud database and cloud storage through authenticated endpoints
 * @param {string} id - Record ID
 * @param {string} audioUrl - Optional audio URL to purge from bucket
 */
export const deleteSelfMixFromCloud = async (id, audioUrl) => {
  if (!isSupabaseConfigured()) return;

  try {
    // 1. Delete from database via authenticated API
    await apiFetch(`/api/library/self-mixes?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    // 2. Delete storage file if path can be extracted
    if (audioUrl && audioUrl.includes(BUCKET_NAME)) {
      const parts = audioUrl.split(`/${BUCKET_NAME}/`);
      if (parts[1]) {
        const decodedPath = decodeURIComponent(parts[1]);
        await apiFetch(`/api/storage?path=${encodeURIComponent(decodedPath)}`, {
          method: "DELETE",
        });
      }
    }
  } catch (e) {
    console.warn("[SupabaseClient] Notice deleting self mix:", e);
  }
};
