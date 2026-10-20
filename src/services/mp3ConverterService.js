/**
 * MP3 Converter Service
 * 
 * Handles URL parsing, platform identification (Spotify, YouTube),
 * metadata resolution, audio matching from authorized sources,
 * and audio-to-MP3 conversion pipelines.
 */

// Supported URL Patterns
export const SPOTIFY_TRACK_REGEX = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]{20,25})/i;
export const SPOTIFY_URI_REGEX = /^spotify:track:([a-zA-Z0-9]{20,25})$/i;
export const YOUTUBE_URL_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

/**
 * Identifies the platform and extracts the identifier from a URL string.
 * @param {string} input 
 * @returns {{ type: 'spotify'|'youtube'|'invalid', id: string|null, url: string }}
 */
export function identifyAudioSourceUrl(input) {
  if (!input || typeof input !== "string") {
    return { type: "invalid", id: null, url: "" };
  }

  const trimmed = input.trim();

  // 1. Spotify Track Check
  const spotifyMatch = trimmed.match(SPOTIFY_TRACK_REGEX) || trimmed.match(SPOTIFY_URI_REGEX);
  if (spotifyMatch) {
    return {
      type: "spotify",
      id: spotifyMatch[1],
      url: trimmed,
    };
  }

  // 2. YouTube Video Check
  const ytMatch = trimmed.match(YOUTUBE_URL_REGEX);
  if (ytMatch) {
    return {
      type: "youtube",
      id: ytMatch[1],
      url: trimmed,
    };
  }

  return {
    type: "invalid",
    id: null,
    url: trimmed,
  };
}

/**
 * Cleans YouTube video titles to extract genuine song title and artist.
 * Strips noise like "Official Music Video", "4K Remastered", "Lyric Video", etc.
 */
export function cleanYouTubeTitle(rawTitle = "", rawAuthor = "") {
  if (!rawTitle) return { title: "Converted Track", artist: rawAuthor || "Unknown Artist" };

  let title = rawTitle
    .replace(/\[(?:official|music|video|audio|lyrics?|visualizer|4k|hd|remastered)[^\]]*\]/gi, "")
    .replace(/\((?:official|music|video|audio|lyrics?|visualizer|4k|hd|remastered)[^\)]*\)/gi, "")
    .replace(/\s*\|\s*(?:official|music|video|audio|lyrics?).*$/gi, "")
    .replace(/\s*-\s*(?:official|music|video|audio|lyrics?).*$/gi, "")
    .trim();

  let artist = rawAuthor.replace(/\s*-\s*Topic$/i, "").trim() || "Unknown Artist";

  // Check if title contains "Artist - Title" format
  if (title.includes(" - ")) {
    const parts = title.split(" - ");
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    }
  }

  return {
    title: title || rawTitle,
    artist: artist || "Unknown Artist",
  };
}

/**
 * Audio Quality Bitrate presets (kbps)
 */
export const QUALITY_PRESETS = [
  {
    id: "128",
    label: "128 kbps",
    badge: "Standard",
    desc: "Compact file size • Quickest conversion",
    targetBitrate: 128,
  },
  {
    id: "192",
    label: "192 kbps",
    badge: "High Quality",
    desc: "Crisp acoustic fidelity • Balanced performance",
    targetBitrate: 192,
  },
  {
    id: "320",
    label: "320 kbps",
    badge: "Ultra HQ",
    desc: "Maximum bit-rate • Lossless studio punch",
    targetBitrate: 320,
  },
];

/**
 * Formats seconds into mm:ss
 */
export function formatDurationSeconds(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const remaining = s % 60;
  return `${m}:${remaining < 10 ? "0" : ""}${remaining}`;
}

/**
 * Sanitizes a title for filenames, removing illegal characters and path traversal,
 * preserving readable spaces and characters.
 * @param {string} rawTitle
 * @param {string} defaultExt
 */
export function sanitizeMediaFilename(rawTitle, defaultExt = "mp3") {
  if (!rawTitle || typeof rawTitle !== "string") {
    rawTitle = "track";
  }

  const cleanExt = defaultExt.replace(/^\./, "").toLowerCase();

  let base = rawTitle.trim();
  base = base.replace(/^(\.\.[/\\])+/g, "").replace(/^[/\\]+/g, "");
  base = base.replace(/\.(mp3|mp4|m4a|wav|aac|flac|ogg|webm|mkv|mov|avi)$/i, "").trim();
  base = base.replace(/[\x00-\x1f\x80-\x9f\\/:*?"<>|]/g, "");
  base = base.replace(/\s+/g, " ").trim();
  base = base.replace(/[.\s]+$/g, "").trim();

  if (!base) {
    base = "track";
  }

  return `${base}.${cleanExt}`;
}

/**
 * Extracts the exact filename from Content-Disposition HTTP header.
 */
export function parseFilenameFromDisposition(disposition, fallback = "media.mp3") {
  if (!disposition || typeof disposition !== "string") return fallback;
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {}
  }
  const match = disposition.match(/filename=(?:"([^"]+)"|([^;\n]+))/i);
  if (match) {
    return (match[1] || match[2] || "").trim();
  }
  return fallback;
}

