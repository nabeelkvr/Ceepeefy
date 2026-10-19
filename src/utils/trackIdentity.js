/**
 * Robust Track Identity and Deduplication Utility
 * 
 * Provides stable, canonical identity resolution and multi-strategy deduplication
 * across provider IDs (JioSaavn raw IDs vs curated "track-" IDs), normalized title/artist pairs,
 * and version indicators (remix, acoustic, live).
 */

/**
 * Normalizes a raw track identifier by stripping provider/curated prefixes,
 * trailing spaces, and position tags (e.g. "__pos_40").
 */
export function normalizeTrackId(id) {
  if (id === null || id === undefined) return "";
  let str = String(id).trim();
  // Strip position tag if present (from playlist storage)
  if (str.includes("__pos_")) {
    str = str.split("__pos_")[0];
  }
  // Strip curated or local prefix
  str = str.replace(/^track-/, "").trim();
  return str;
}

/**
 * Normalizes song title for identity comparison while distinguishing legitimate versions (remix, acoustic, live).
 */
export function normalizeTitleForIdentity(title) {
  if (!title || typeof title !== "string") return "";
  
  let clean = title
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

  // Extract version indicators before cleaning so we distinguish versions
  const isRemix = /\b(remix|mix|mashup)\b/i.test(clean);
  const isAcoustic = /\b(acoustic|unplugged)\b/i.test(clean);
  const isLive = /\b(live|concert|tour)\b/i.test(clean);
  const isLofi = /\b(lofi|lo-fi|chillout)\b/i.test(clean);
  const isBgm = /\b(bgm|theme|score|instrumental)\b/i.test(clean);

  // Strip movie/album qualifiers like (From "Movie"), [From Movie], - From Movie
  clean = clean
    .replace(/\s*[\(\[](?:from|feat\.?|ft\.?|with|official|video|audio|lyrical|soundtrack|original)[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*-\s*(?:from|feat\.?|ft\.?|official|video|audio|lyrical).*/gi, "");

  // Normalize characters
  clean = clean
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9]/g, "")
    .trim();

  const versionSuffix = [
    isRemix ? "remix" : "",
    isAcoustic ? "acoustic" : "",
    isLive ? "live" : "",
    isLofi ? "lofi" : "",
    isBgm ? "bgm" : "",
  ].filter(Boolean).join("_");

  return versionSuffix ? `${clean}__${versionSuffix}` : clean;
}

/**
 * Extracts and normalizes the primary artist for identity comparisons.
 */
export function normalizePrimaryArtist(artist) {
  if (!artist || typeof artist !== "string") return "";
  
  // Clean HTML entities
  const clean = artist
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

  // Extract first primary artist
  const first = clean.split(/[,&/|;]|\s+feat\.?\s+|\s+ft\.?\s+|\s+with\s+|\s+and\s+/i)[0] || "";
  
  return first
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Generates a stable composite key for a track.
 */
export function getTrackCompositeKey(track) {
  if (!track) return "";
  const title = track.title || track.song || track.name || "";
  const artist = track.primary_artist || track.primaryArtist || track.artist || track.singers || "";
  
  const normTitle = normalizeTitleForIdentity(title);
  const normArtist = normalizePrimaryArtist(artist);
  
  if (!normTitle) return "";
  return `${normTitle}:::${normArtist}`;
}

/**
 * Determines whether two tracks represent the same logical track.
 */
export function areTracksEqual(trackA, trackB) {
  if (!trackA || !trackB) return false;
  if (trackA === trackB) return true;

  const idA = normalizeTrackId(trackA.id || trackA.songId);
  const idB = normalizeTrackId(trackB.id || trackB.songId);

  // 1. Direct canonical ID match (when valid)
  if (idA && idB && idA === idB) {
    return true;
  }

  // 2. Composite normalized title + artist match
  const keyA = getTrackCompositeKey(trackA);
  const keyB = getTrackCompositeKey(trackB);

  if (keyA && keyB && keyA === keyB) {
    return true;
  }

  return false;
}

/**
 * Creates an intelligent track deduplicator that maintains both ID sets and composite key sets.
 */
export function createTrackDeduplicator(initialTracks = []) {
  const seenIds = new Set();
  const seenKeys = new Set();

  const add = (track) => {
    if (!track) return;
    const cid = normalizeTrackId(track.id || track.songId);
    if (cid) seenIds.add(cid);
    
    // Also store raw ID if string
    if (track.id) seenIds.add(String(track.id).trim());

    const compKey = getTrackCompositeKey(track);
    if (compKey) seenKeys.add(compKey);
  };

  initialTracks.forEach(add);

  return {
    has(track) {
      if (!track) return false;
      const cid = normalizeTrackId(track.id || track.songId);
      if (cid && seenIds.has(cid)) return true;
      if (track.id && seenIds.has(String(track.id).trim())) return true;

      const compKey = getTrackCompositeKey(track);
      if (compKey && seenKeys.has(compKey)) return true;

      return false;
    },
    add(track) {
      if (this.has(track)) return false;
      add(track);
      return true;
    },
    filterUnique(tracks) {
      if (!Array.isArray(tracks)) return [];
      const result = [];
      for (const track of tracks) {
        if (!this.has(track)) {
          this.add(track);
          result.push(track);
        }
      }
      return result;
    },
    getExcludedIds() {
      return Array.from(seenIds);
    },
    getExcludedKeys() {
      return Array.from(seenKeys);
    }
  };
}
