import { createClient } from "@supabase/supabase-js";

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

/**
 * Uploads an audio file (.mp3 or .wav) directly to the Supabase cloud storage bucket
 * @param {File} file - Audio file (.mp3 or .wav)
 * @param {string} owner - Account handle (default 'nabeeyl')
 * @returns {Promise<{ publicUrl: string, filePath: string }>}
 */
export const uploadAudioToCloud = async (file, owner = "nabeeyl") => {
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

  const cleanFileName = file.name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .toLowerCase();
  const filePath = `${owner}/${Date.now()}_${cleanFileName}`;

  const contentType = file.name.endsWith(".wav")
    ? "audio/wav"
    : file.type || "audio/mpeg";

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType,
    });

  if (error) {
    console.error("Supabase storage upload error:", error);
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(data.path);

  return {
    publicUrl: urlData.publicUrl,
    filePath: data.path,
  };
};

/**
 * Saves a Self Mix record to the cloud database
 * @param {Object} mixData - Self mix details
 * @returns {Promise<Object>}
 */
export const saveSelfMixToCloud = async (mixData) => {
  if (!supabase || !isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }

  const record = {
    id: mixData.id || `cloud-mix-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    title: mixData.title || "Untitled Self Mix",
    audio_url: mixData.audioUrl || mixData.audio_url,
    owner: mixData.owner || "nabeeyl",
    duration: typeof mixData.duration === "number" ? Math.round(mixData.duration) : 180,
    duration_formatted: mixData.durationFormatted || mixData.duration_formatted || "3:00",
    file_name: mixData.fileName || mixData.file_name || "",
    file_size: mixData.fileSize || mixData.file_size || 0,
    cover_url:
      mixData.coverUrl ||
      mixData.cover_url ||
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("self_mixes")
    .insert([record])
    .select()
    .single();

  if (error) {
    console.error("Supabase database insert error:", error);
    throw error;
  }

  return data;
};

/**
 * Fetches all Self Mix tracks for the account from Supabase
 * @param {string} owner - Account handle (default 'nabeeyl')
 * @returns {Promise<Array>}
 */
export const fetchSelfMixesFromCloud = async (owner = "nabeeyl") => {
  if (!supabase || !isSupabaseConfigured()) {
    return [];
  }

  const { data, error } = await supabase
    .from("self_mixes")
    .select("*")
    .eq("owner", owner)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase database fetch error:", error);
    throw error;
  }

  return data || [];
};

/**
 * Deletes a Self Mix track from cloud database and cloud storage
 * @param {string} id - Record ID
 * @param {string} audioUrl - Optional audio URL to purge from bucket
 */
export const deleteSelfMixFromCloud = async (id, audioUrl) => {
  if (!supabase || !isSupabaseConfigured()) return;

  // 1. Delete from database
  const { error: dbError } = await supabase
    .from("self_mixes")
    .delete()
    .eq("id", id);

  if (dbError) {
    console.error("Supabase delete error:", dbError);
  }

  // 2. Delete storage file if path can be extracted
  if (audioUrl && audioUrl.includes(BUCKET_NAME)) {
    try {
      const parts = audioUrl.split(`/${BUCKET_NAME}/`);
      if (parts[1]) {
        const decodedPath = decodeURIComponent(parts[1]);
        await supabase.storage.from(BUCKET_NAME).remove([decodedPath]);
      }
    } catch (e) {
      console.warn("Could not delete cloud storage file:", e);
    }
  }
};
