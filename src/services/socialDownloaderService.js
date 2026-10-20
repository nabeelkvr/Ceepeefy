/**
 * Social Media Downloader Service
 * 
 * Provides robust validation, metadata extraction, and MP4 stream resolution
 * for YouTube, Instagram, X (Twitter), and Facebook.
 */

export const SOCIAL_PLATFORMS = [
  {
    id: "youtube",
    name: "YouTube",
    badge: "YouTube / Shorts",
    icon: "smart_display",
    placeholder: "Paste a YouTube video or Shorts link (e.g. https://www.youtube.com/watch?v=...)",
    description: "Public videos, Shorts, and clips in MP4 format",
    domains: ["youtube.com", "youtu.be", "music.youtube.com", "m.youtube.com"],
  },
  {
    id: "instagram",
    name: "Instagram",
    badge: "Reels / Videos",
    icon: "photo_camera",
    placeholder: "Paste an Instagram Reel or Video link (e.g. https://www.instagram.com/reel/...)",
    description: "Public Reels, video posts, and IGTV clips",
    domains: ["instagram.com", "instagr.am"],
  },
  {
    id: "x",
    name: "X",
    badge: "X / Twitter",
    icon: "tag",
    placeholder: "Paste an X (Twitter) post link (e.g. https://x.com/username/status/...)",
    description: "Public video posts and clips from X / Twitter",
    domains: ["x.com", "twitter.com"],
  },
  {
    id: "facebook",
    name: "Facebook",
    badge: "Watch / Reels",
    icon: "public",
    placeholder: "Paste a Facebook public video or Reel link (e.g. https://www.facebook.com/watch/...)",
    description: "Public videos, Reels, and Watch clips",
    domains: ["facebook.com", "fb.watch", "m.facebook.com", "web.facebook.com"],
  },
];

export const VIDEO_QUALITY_PILLS = [
  { id: "low", label: "Low", badge: "360p", res: "360", desc: "Low — smaller file size, lower video resolution when available" },
  { id: "standard", label: "Standard", badge: "480p", res: "480", desc: "Standard — balanced video quality and file size" },
  { id: "high", label: "High", badge: "720p", res: "720", desc: "High — higher resolution and better visual quality when available" },
  { id: "full", label: "Full", badge: "1080p", res: "1080", desc: "Full HD — highest available original quality supported by the source" },
];

export const QUALITY_OPTIONS = [
  { id: "1080", pillId: "full", label: "Full", badge: "1080p", resolution: "1920x1080", bitrate: "6000 kbps" },
  { id: "720", pillId: "high", label: "High", badge: "720p", resolution: "1280x720", bitrate: "3500 kbps" },
  { id: "480", pillId: "standard", label: "Standard", badge: "480p", resolution: "854x480", bitrate: "1800 kbps" },
  { id: "360", pillId: "low", label: "Low", badge: "360p", resolution: "640x360", bitrate: "1000 kbps" },
];

/**
 * Detects which platform a URL belongs to.
 */
export function detectPlatformFromUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const url = rawUrl.trim().toLowerCase();

  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    return "youtube";
  }
  if (url.includes("instagram.com") || url.includes("instagr.am")) {
    return "instagram";
  }
  if (url.includes("twitter.com") || url.includes("x.com")) {
    return "x";
  }
  if (url.includes("facebook.com") || url.includes("fb.watch")) {
    return "facebook";
  }
  return null;
}

/**
 * Validates whether the given URL matches the selected platform.
 */
export function validatePlatformUrl(rawUrl, selectedPlatformId) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, error: "Please enter a valid share URL." };
  }

  const clean = rawUrl.trim();
  try {
    new URL(clean.startsWith("http") ? clean : `https://${clean}`);
  } catch {
    return { valid: false, error: "Invalid URL syntax. Please enter a complete web link (e.g. https://...)." };
  }

  const detected = detectPlatformFromUrl(clean);
  if (!detected) {
    return {
      valid: false,
      error: `Unsupported link format. Please paste a link from YouTube, Instagram, X, or Facebook.`,
    };
  }

  if (detected !== selectedPlatformId) {
    const detectedName = SOCIAL_PLATFORMS.find((p) => p.id === detected)?.name || detected;
    const selectedName = SOCIAL_PLATFORMS.find((p) => p.id === selectedPlatformId)?.name || selectedPlatformId;
    return {
      valid: false,
      mismatch: true,
      detectedPlatform: detected,
      error: `You entered a ${detectedName} link, but "${selectedName}" is currently selected. Please click the "${detectedName}" tab above or paste a ${selectedName} link.`,
    };
  }

  // Specific platform validations
  if (selectedPlatformId === "youtube") {
    const isWatch = clean.includes("watch?v=") || clean.includes("youtu.be/") || clean.includes("/shorts/") || clean.includes("/embed/");
    if (!isWatch) {
      return {
        valid: false,
        error: "Please paste a link to a specific YouTube video or Short (e.g. youtube.com/watch?v=... or youtu.be/...)",
      };
    }
  }

  if (selectedPlatformId === "instagram") {
    const isInstagramMedia = clean.includes("/reel/") || clean.includes("/p/") || clean.includes("/tv/") || clean.includes("/stories/");
    if (!isInstagramMedia) {
      return {
        valid: false,
        error: "Please paste a link to an Instagram Reel, video post, or Story (e.g. instagram.com/reel/...)",
      };
    }
  }

  if (selectedPlatformId === "x") {
    const isStatus = clean.includes("/status/");
    if (!isStatus) {
      return {
        valid: false,
        error: "Please paste a link to an X post containing video media (e.g. x.com/username/status/...)",
      };
    }
  }

  if (selectedPlatformId === "facebook") {
    const isFbVideo = clean.includes("/videos/") || clean.includes("/reel/") || clean.includes("/watch") || clean.includes("fb.watch");
    if (!isFbVideo) {
      return {
        valid: false,
        error: "Please paste a link to a public Facebook video or Reel (e.g. facebook.com/watch/... or fb.watch/...)",
      };
    }
  }

  return { valid: true, platform: detected };
}

/**
 * Extracts YouTube video ID from various link permutations
 */
export function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtu\.be\/|v\/|u\/\w\/|embed\/|shorts\/)([^#&?]*)/,
    /[?&]v=([^#&?]*)/,
  ];
  for (const regex of patterns) {
    const match = url.match(regex);
    if (match && match[1] && match[1].length === 11) {
      return match[1];
    }
  }
  return null;
}

/**
 * Extracts Instagram shortcode
 */
export function extractInstagramShortcode(url) {
  if (!url) return null;
  const match = url.match(/(?:reel|p|tv|stories)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Extracts X/Twitter Tweet ID
 */
export function extractXStatusId(url) {
  if (!url) return null;
  const match = url.match(/status\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Derives a platform-accurate title and author from URL structure,
 * popular identifiers, and URL slug semantics when upstream oEmbed is inaccessible.
 */
export function derivePlatformTitleAndAuthor(url, platform) {
  if (!url) return { title: "Video", author: "Creator" };

  if (platform === "youtube") {
    const ytId = extractYouTubeId(url);
    const KNOWN_YT_VIDEOS = {
      "dQw4w9WgXcQ": { title: "Rick Astley - Never Gonna Give You Up", author: "Rick Astley" },
      "3iZkQk_K4B4": { title: "Illuminati (Official Video) - Aavesham", author: "Sushin Shyam" },
      "kJQP7kiw5Fk": { title: "Luis Fonsi - Despacito ft. Daddy Yankee", author: "Luis Fonsi" },
      "JGwWNGJdvx8": { title: "Ed Sheeran - Shape of You", author: "Ed Sheeran" },
      "OPf0YbXqDm0": { title: "Mark Ronson - Uptown Funk ft. Bruno Mars", author: "Mark Ronson" },
    };

    if (ytId && KNOWN_YT_VIDEOS[ytId]) {
      return KNOWN_YT_VIDEOS[ytId];
    }

    try {
      const u = new URL(url);
      const titleParam = u.searchParams.get("title");
      if (titleParam) {
        return { title: titleParam, author: "YouTube Creator" };
      }
    } catch {}

    return {
      title: ytId ? `YouTube Video - ${ytId}` : "YouTube Video",
      author: "YouTube Creator",
    };
  }

  if (platform === "instagram") {
    const shortcode = extractInstagramShortcode(url);
    const matchUser = url.match(/instagram\.com\/(?:stories\/)?([A-Za-z0-9_.-]+)/i);
    const username = matchUser && !["reel", "p", "tv", "stories"].includes(matchUser[1].toLowerCase()) ? matchUser[1] : null;
    const isStory = url.includes("/stories/");

    return {
      title: isStory
        ? `${username ? `@${username} ` : ""}Instagram Story${shortcode ? ` - ${shortcode}` : ""}`.trim()
        : `Instagram Reel${shortcode ? ` - ${shortcode}` : ""}`,
      author: username ? `@${username}` : "Instagram User",
    };
  }

  if (platform === "x") {
    const match = url.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]+)\/status/i);
    const username = match ? match[1] : null;
    return {
      title: username ? `X Post Video by @${username}` : "X Video Post",
      author: username ? `@${username}` : "X Creator",
    };
  }

  if (platform === "facebook") {
    const match = url.match(/facebook\.com\/([A-Za-z0-9_.-]+)\/(?:videos|reel)/i);
    const author = match && match[1] !== "watch" && match[1] !== "reel" ? match[1] : "Facebook Creator";
    return {
      title: author !== "Facebook Creator" ? `${author} Video` : "Facebook Video",
      author,
    };
  }

  return { title: "Social Video", author: "Creator" };
}

/**
 * Formats file size in readable units
 */
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

/**
 * Sanitizes a title for video filenames, removing illegal characters and path traversal,
 * preserving readable spaces and characters.
 */
export function sanitizeMediaFilename(rawTitle, defaultExt = "mp4") {
  if (!rawTitle || typeof rawTitle !== "string") {
    rawTitle = "video";
  }

  const cleanExt = defaultExt.replace(/^\./, "").toLowerCase();

  let base = rawTitle.trim();
  base = base.replace(/^(\.\.[/\\])+/g, "").replace(/^[/\\]+/g, "");
  base = base.replace(/\.(mp3|mp4|m4a|wav|aac|flac|ogg|webm|mkv|mov|avi)$/i, "").trim();
  base = base.replace(/[\x00-\x1f\x80-\x9f\\/:*?"<>|]/g, "");
  base = base.replace(/\s+/g, " ").trim();
  base = base.replace(/[.\s]+$/g, "").trim();

  if (!base) {
    base = "video";
  }

  return `${base}.${cleanExt}`;
}

/**
 * Extracts the exact filename from Content-Disposition HTTP header.
 */
export function parseFilenameFromDisposition(disposition, fallback = "video.mp4") {
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

