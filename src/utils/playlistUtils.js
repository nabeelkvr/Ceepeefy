/**
 * Playlist & Audio Formatting Utilities
 */

/**
 * Parses duration value into seconds.
 * Supports numeric seconds (e.g. 210) or formatted strings (e.g. "3:45", "01:23:45", "45 min", "1 hr 12 min").
 * @param {number|string} duration 
 * @returns {number} duration in seconds
 */
export function parseDurationToSeconds(duration) {
  if (typeof duration === "number" && !isNaN(duration)) {
    return Math.max(0, Math.round(duration));
  }
  if (!duration || typeof duration !== "string") {
    return 0;
  }

  const str = duration.trim().toLowerCase();

  // Pattern: "1 hr 20 min" or "45 min" or "2 hrs"
  if (str.includes("hr") || str.includes("min") || str.includes("sec")) {
    let totalSecs = 0;
    const hrMatch = str.match(/(\d+)\s*hr/);
    const minMatch = str.match(/(\d+)\s*min/);
    const secMatch = str.match(/(\d+)\s*sec/);
    if (hrMatch) totalSecs += parseInt(hrMatch[1], 10) * 3600;
    if (minMatch) totalSecs += parseInt(minMatch[1], 10) * 60;
    if (secMatch) totalSecs += parseInt(secMatch[1], 10);
    if (totalSecs > 0) return totalSecs;
  }

  // Pattern: "mm:ss" or "hh:mm:ss"
  if (str.includes(":")) {
    const parts = str.split(":").map((p) => parseInt(p, 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
  }

  // Fallback: pure numeric string
  const num = parseInt(str, 10);
  return isNaN(num) ? 0 : Math.max(0, num);
}

/**
 * Calculates and formats the total duration of a track list.
 * @param {Array} tracks 
 * @returns {string} Formatted duration, e.g. "1 hr 15 min", "42 min", "3 min 20 sec", or "0 min"
 */
export function formatPlaylistDuration(tracks = []) {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return "0 min";
  }

  const totalSeconds = tracks.reduce((acc, track) => {
    const dur = parseDurationToSeconds(track?.duration);
    return acc + (dur > 0 ? dur : 210); // default to ~3.5 min if unknown track duration
  }, 0);

  if (totalSeconds <= 0) return "0 min";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }

  if (minutes > 0) {
    return `${minutes} min`;
  }

  return `${seconds} sec`;
}

/**
 * Formats tracks count and duration into uppercase string matching the design requirement.
 * Sample output: "1 TRACK , 2 MINUTES" or "5 TRACKS , 16 MINUTES"
 * @param {Array} tracks 
 * @param {string} fallbackDuration
 * @returns {string} e.g. "1 TRACK , 2 MINUTES", "5 TRACKS , 16 MINUTES"
 */
export function formatPlaylistTracksAndDurationUppercase(tracks = [], fallbackDuration = "") {
  const count = Array.isArray(tracks) ? tracks.length : 0;
  const trackLabel = count === 1 ? "1 TRACK" : `${count} TRACKS`;

  let totalSeconds = 0;
  if (Array.isArray(tracks) && tracks.length > 0) {
    totalSeconds = tracks.reduce((acc, track) => {
      const dur = parseDurationToSeconds(track?.duration);
      return acc + (dur > 0 ? dur : 210);
    }, 0);
  } else if (fallbackDuration) {
    totalSeconds = parseDurationToSeconds(fallbackDuration);
  }

  if (totalSeconds <= 0 && count === 0) {
    return `${trackLabel} , 0 MINUTES`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.ceil((totalSeconds % 3600) / 60);

  let durationLabel = "";
  if (hours > 0) {
    const hrWord = hours === 1 ? "1 HOUR" : `${hours} HOURS`;
    const minWord = minutes === 1 ? "1 MINUTE" : `${minutes} MINUTES`;
    durationLabel = minutes > 0 ? `${hrWord} ${minWord}` : hrWord;
  } else {
    const minCount = Math.max(1, minutes);
    durationLabel = minCount === 1 ? "1 MINUTE" : `${minCount} MINUTES`;
  }

  return `${trackLabel} , ${durationLabel}`;
}

/**
 * Reads and optimizes a user-selected local photo file to a base64 data URL.
 * Preserves high visual fidelity while keeping memory & storage footprint light.
 * @param {File|Blob} file 
 * @param {number} maxSize Max dimension in pixels (default: 600)
 * @param {number} quality Compression quality from 0 to 1 (default: 0.85)
 * @returns {Promise<string>} Base64 data URL
 */
export function processLocalImage(file, maxSize = 600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file provided"));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = (e) => {
      const dataUrl = e.target?.result;
      if (!dataUrl || typeof dataUrl !== "string") {
        return reject(new Error("Invalid file content"));
      }

      if (typeof window === "undefined" || !window.Image) {
        return resolve(dataUrl);
      }

      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width <= maxSize && height <= maxSize && file.size < 250 * 1024) {
          return resolve(dataUrl);
        }

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(dataUrl);

        ctx.drawImage(img, 0, 0, width, height);
        try {
          const optimized = canvas.toDataURL("image/jpeg", quality);
          resolve(optimized);
        } catch {
          resolve(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
