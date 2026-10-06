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

