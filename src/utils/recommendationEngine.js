/**
 * Ceepify — Intelligent Automatic Queue Algorithm & Recommendation Engine
 *
 * Implements the deterministic Priority Hierarchy & Scoring System:
 * 1. SAME LANGUAGE — HIGHEST PRIORITY (Weight: 35)
 * 2. SAME SONG TYPE / MOOD — VERY HIGH PRIORITY (Weight: 30)
 * 3. TRENDING / POPULARITY — HIGH PRIORITY (Weight: 20)
 * 4. ARTIST DIVERSITY & PUZZLE FACTOR — LOW PRIORITY (Weight: 10)
 * 5. CONTROLLED RANDOMNESS & DISCOVERY FACTOR (Weight: 5)
 *
 * Scoring Formula:
 * Queue Score = (Language Match * 35) + (Mood Match * 30) + (Popularity * 20) + (Artist Diversity * 10) + (Discovery Factor * 5)
 */

/**
 * Normalizes text for clean string comparisons
 */
export function cleanStr(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Removes noisy qualifiers from movie / album titles
 */
export function normalizeMovieAlbum(rawAlbum) {
  if (!rawAlbum || typeof rawAlbum !== "string") return "";
  let clean = rawAlbum
    .replace(/&quot;/g, "")
    .replace(/&#039;/g, "")
    .replace(/&#39;/g, "")
    .replace(/&amp;/g, "&")
    .replace(
      /\s*[\(\[](?:original\s+motion\s+picture\s+soundtrack|motion\s+picture\s+soundtrack|original\s+soundtrack|soundtrack|ost|from\s+[^)\]]+|audio|album|ep|single|deluxe|remaster(?:ed)?|edition|vol\.?\s*\d*)[^\)\]]*[\)\]]/gi,
      ""
    )
    .replace(/\s*-\s*(?:original\s+motion\s+picture\s+soundtrack|soundtrack|ost|single|ep|deluxe).*/gi, "")
    .trim();

  return cleanStr(clean);
}

/**
 * Extracts and tokenizes all artist names associated with a song.
 * Supports primary_artist, artist, singers, music director, featured artists, and artistMap.
 */
export function extractArtists(track) {
  if (!track) return [];
  const artistsSet = new Set();

  const addName = (name) => {
    if (!name || typeof name !== "string") return;
    const parts = name.split(/[,&/|;]|\s+feat\.?\s+|\s+ft\.?\s+|\s+with\s+|\s+and\s+|\s+x\s+|\s+vs\.?\s+/i);
    for (const p of parts) {
      const cleaned = cleanStr(p);
      if (cleaned.length >= 2 && cleaned !== "various artists" && cleaned !== "various" && cleaned !== "unknown") {
        artistsSet.add(cleaned);
      }
    }
  };

  // 1. Direct string fields
  addName(track.primary_artist || track.primaryArtist);
  addName(track.artist);
  addName(track.singers);
  addName(track.music || track.composer || track.musicDirector || track.more_info?.music);

  // 2. Featured artists
  if (typeof track.featured_artists === "string") {
    addName(track.featured_artists);
  } else if (Array.isArray(track.featured_artists)) {
    track.featured_artists.forEach((a) => addName(typeof a === "object" ? a.name : a));
  }

  // 3. Structured artistMap (JioSaavn format)
  const artistMap = track.artistMap || track.more_info?.artistMap;
  if (artistMap && typeof artistMap === "object") {
    if (Array.isArray(artistMap.primary_artists)) {
      artistMap.primary_artists.forEach((a) => addName(a.name));
    }
    if (Array.isArray(artistMap.artists)) {
      artistMap.artists.forEach((a) => addName(a.name));
    }
    if (Array.isArray(artistMap.featured_artists)) {
      artistMap.featured_artists.forEach((a) => addName(a.name));
    }
    for (const [key, val] of Object.entries(artistMap)) {
      if (typeof key === "string" && isNaN(Number(key))) {
        addName(key);
      } else if (typeof val === "string" && isNaN(Number(val))) {
        addName(val);
      }
    }
  }

  return Array.from(artistsSet);
}

/**
 * Checks whether track A and track B share at least one matching artist.
 */
export function isArtistMatch(trackA, trackB) {
  const artistsA = extractArtists(trackA);
  const artistsB = extractArtists(trackB);
  if (artistsA.length === 0 || artistsB.length === 0) return false;

  for (const a of artistsA) {
    for (const b of artistsB) {
      if (a === b) return true;
      if (a.length > 5 && b.length > 5) {
        if (a.includes(b) || b.includes(a)) return true;
      }
    }
  }
  return false;
}

/**
 * Generic album words that do not constitute a specific movie or album match
 */
const GENERIC_ALBUM_NAMES = new Set([
  "",
  "single",
  "singles",
  "unknown",
  "untitled",
  "track",
  "audio",
  "music",
  "songs",
  "album",
  "remix",
  "ep",
  "soundtrack",
]);

/**
 * Extracts normalized movie name if present in track metadata or song title.
 */
export function extractMovieName(track) {
  if (!track) return "";
  if (track.movieName && typeof track.movieName === "string") {
    return cleanStr(track.movieName);
  }
  if (track.movie && typeof track.movie === "string") {
    return cleanStr(track.movie);
  }
  if (track.more_info?.movie_name && typeof track.more_info.movie_name === "string") {
    return cleanStr(track.more_info.movie_name);
  }

  const title = track.title || track.song || "";
  const match =
    title.match(/\(\s*from\s+["']?([^"')\]]+)["']?\s*\)/i) ||
    title.match(/\[\s*from\s+["']?([^"'\]]+)["']?\s*\]/i) ||
    title.match(/-\s*from\s+["']?([^"'-]+)["']?/i);
  if (match && match[1]) {
    const extracted = cleanStr(match[1]);
    if (extracted && !GENERIC_ALBUM_NAMES.has(extracted)) {
      return extracted;
    }
  }

  const isMovie = Boolean(
    track.isMovie ||
    track.isMovieTrack ||
    track.more_info?.is_movie === "1" ||
    track.more_info?.is_movie === true ||
    track.more_info?.album_type === "movie" ||
    track.album_type === "movie"
  );
  if (isMovie) {
    const alb = normalizeMovieAlbum(track.album || track.albumName || track.more_info?.album || "");
    if (alb && !GENERIC_ALBUM_NAMES.has(alb)) {
      return alb;
    }
  }

  return "";
}

/**
 * Checks whether candidate originates from the exact same movie as seedTrack.
 */
export function isMovieMatch(trackA, trackB) {
  if (!trackA || !trackB) return false;
  const movieA = extractMovieName(trackA);
  const movieB = extractMovieName(trackB);

  if (movieA && movieB && !GENERIC_ALBUM_NAMES.has(movieA) && !GENERIC_ALBUM_NAMES.has(movieB)) {
    if (movieA === movieB) return true;
    if (movieA.length > 3 && movieB.length > 3 && (movieA.includes(movieB) || movieB.includes(movieA))) {
      return true;
    }
  }

  const isMovieA = Boolean(
    trackA.isMovie ||
    trackA.isMovieTrack ||
    trackA.more_info?.is_movie === "1" ||
    trackA.more_info?.is_movie === true ||
    trackA.more_info?.album_type === "movie" ||
    trackA.album_type === "movie" ||
    extractMovieName(trackA)
  );
  const isMovieB = Boolean(
    trackB.isMovie ||
    trackB.isMovieTrack ||
    trackB.more_info?.is_movie === "1" ||
    trackB.more_info?.is_movie === true ||
    trackB.more_info?.album_type === "movie" ||
    trackB.album_type === "movie" ||
    extractMovieName(trackB)
  );

  if ((isMovieA || isMovieB) && isAlbumMatch(trackA, trackB)) {
    return true;
  }

  return false;
}

/**
 * Checks whether track A and track B originate from the same album.
 */
export function isAlbumMatch(trackA, trackB) {
  if (!trackA || !trackB) return false;

  const idA = String(trackA.album_id || trackA.albumId || trackA.more_info?.album_id || "").trim();
  const idB = String(trackB.album_id || trackB.albumId || trackB.more_info?.album_id || "").trim();
  if (idA && idB && idA === idB) return true;

  const albumA = normalizeMovieAlbum(trackA.movieName || trackA.album || trackA.albumName || trackA.more_info?.album || "");
  const albumB = normalizeMovieAlbum(trackB.movieName || trackB.album || trackB.albumName || trackB.more_info?.album || "");

  if (albumA && albumB && !GENERIC_ALBUM_NAMES.has(albumA) && !GENERIC_ALBUM_NAMES.has(albumB)) {
    if (albumA === albumB) return true;
    if (albumA.length > 4 && albumB.length > 4) {
      if (albumA.includes(albumB) || albumB.includes(albumA)) return true;
    }
  }

  if (trackA.isSameAlbum || trackB.isSameAlbum) return true;

  return false;
}

export function isMovieAlbumMatch(trackA, trackB) {
  return isMovieMatch(trackA, trackB) || isAlbumMatch(trackA, trackB);
}

/**
 * --------------------------------------------------------------------------
 * 1. SAME LANGUAGE — HIGHEST PRIORITY (Score: 100, 40, 0 | Weight: 35)
 * --------------------------------------------------------------------------
 */
export const RELATED_LANGUAGES = {
  malayalam: ["tamil"],
  tamil: ["malayalam", "telugu"],
  telugu: ["tamil", "kannada"],
  kannada: ["telugu", "tamil"],
  hindi: ["urdu", "punjabi", "bhojpuri"],
  urdu: ["hindi", "punjabi"],
  punjabi: ["hindi", "urdu"],
  bhojpuri: ["hindi"],
  bengali: ["hindi", "assamese"],
  marathi: ["hindi"],
  gujarati: ["hindi"],
  arabic: [],
  english: [],
  spanish: [],
};

const MALAYALAM_INDICATORS = [
  "sushin shyam", "hesham abdul wahab", "vidyasagar", "deepak dev", "jassie gift",
  "vineeth sreenivasan", "harisankar", "job kurian", "rex vijayan", "bijibal",
  "shaan rahman", "gopi sundar", "premalu", "manjummel", "avesham", "romancham",
  "bheeshma", "hridayam", "minnal murali", "lucifer", "rdx", "armadham", "illuminati"
];

const TAMIL_INDICATORS = [
  "anirudh", "a.r. rahman", "ar rahman", "yuvan", "harris jayaraj", "santhosh narayanan",
  "d. imman", "gv prakash", "g.v. prakash", "dhanush", "vijay", "leo", "jailer",
  "vikram", "master", "kaithi", "beast", "varisu", "goat", "vada chennai"
];

const HINDI_INDICATORS = [
  "arijit singh", "pritam", "sachin-jigar", "sachin jigar", "vishal mishra",
  "atif aslam", "kk", "shreya ghoshal", "badshah", "diljit", "darshan raval",
  "jawan", "brahmastra", "animal", "kabir singh", "aashiqui", "kesariya", "chaleya"
];

const PHONK_INDICATORS = [
  "kordhell", "interworld", "moondeity", "dxrk", "dvrst", "playamane", "hensonn",
  "s3bzs", "bibi babydoll", "kslv", "phonk", "drift phonk", "brazilian phonk", "pr funk"
];

export function extractLanguage(track) {
  if (!track) return "";
  const raw =
    track.language ||
    track.more_info?.language ||
    (typeof track.subtitle === "string" && track.subtitle.includes("•")
      ? track.subtitle.split("•")[0]
      : "") ||
    "";
  
  const clean = cleanStr(raw);
  if (clean && clean !== "unknown" && clean !== "popular") {
    return clean;
  }

  const allText = [
    track.artist,
    track.primary_artist,
    track.title,
    track.song,
    track.album,
    track.movieName,
    track.genre,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (PHONK_INDICATORS.some((k) => allText.includes(k))) return "phonk";
  if (MALAYALAM_INDICATORS.some((k) => allText.includes(k))) return "malayalam";
  if (TAMIL_INDICATORS.some((k) => allText.includes(k))) return "tamil";
  if (HINDI_INDICATORS.some((k) => allText.includes(k))) return "hindi";

  return clean || "english";
}

export function isLanguageMatch(trackA, trackB) {
  const langA = extractLanguage(trackA);
  const langB = extractLanguage(trackB);
  if (langA && langB && langA === langB) return true;
  return false;
}

export function getLanguageMatchScore(candidate, seedTrack) {
  const langSeed = extractLanguage(seedTrack);
  const langCand = extractLanguage(candidate);

  if (!langSeed || !langCand) {
    return 40;
  }

  if (langSeed === langCand) {
    return 100; // Exact same language
  }

  const related = RELATED_LANGUAGES[langSeed];
  if (Array.isArray(related) && related.includes(langCand)) {
    return 40; // Closely related language
  }

  return 0; // Different language
}

/**
 * --------------------------------------------------------------------------
 * 2. SAME SONG TYPE / MOOD — VERY HIGH PRIORITY (Score: 100, 80, 50, 10 | Weight: 30)
 * --------------------------------------------------------------------------
 * Core categories supported:
 * - phonk (Drift Phonk, Brazilian Phonk, Heavy Bass)
 * - bgm (BGM, Instrumental, movie background themes, cinematic instrumentals)
 * - feel_good (Feel-good, happy, light, positive-energy)
 * - sad (Sad, emotional, melancholic, heartbreak)
 * - romantic (Romantic, love, soft romantic)
 * - chill (Chill, relaxing, lo-fi, calm)
 * - energetic (High-energy, dance, workout, fast-paced, mass)
 */
export function classifySongMood(track) {
  if (!track) return { primary: "feel_good", secondary: [], isBgm: false };

  const textToScan = [
    track.genre,
    track.mood,
    track.songType,
    track.category,
    Array.isArray(track.categories) ? track.categories.join(" ") : "",
    track.badge,
    track.more_info?.genre,
    track.more_info?.mood,
    track.title,
    track.song,
    track.album,
    track.more_info?.album,
    track.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const titleLower = (track.title || track.song || "").toLowerCase();
  const hasLyricsExplicit = track.has_lyrics === "false" || track.has_lyrics === false || track.has_lyrics === 0;

  // 1. Phonk Detection
  if (PHONK_INDICATORS.some((k) => textToScan.includes(k))) {
    return { primary: "phonk", secondary: ["energetic", "bass"], isBgm: false };
  }

  // 2. BGM / Instrumental Detection
  const bgmRegex = /\b(bgm|theme|instrumental|score|ost|soundtrack|cinematic|interlude|original score|flute|piano|violin|orchestral)\b/i;
  const isBgm =
    bgmRegex.test(titleLower) ||
    bgmRegex.test(track.genre || "") ||
    bgmRegex.test(track.more_info?.genre || "") ||
    (hasLyricsExplicit && /\b(theme|bgm|score|version)\b/i.test(titleLower));

  if (isBgm) {
    return { primary: "bgm", secondary: ["instrumental", "chill"], isBgm: true };
  }

  // 3. Sad / Emotional
  if (
    /\b(sad|pain|broken|tears|lonely|alone|dardi|emotional|crying|separation|judaai|maranam|viraham|heartbreak|sorrow|depress|melanchol|dard|alvida|channa mereya|khairiyat)\b/i.test(
      textToScan
    )
  ) {
    return { primary: "sad", secondary: ["chill", "slow"], isBgm: false };
  }

  // 4. Romantic / Love
  if (
    /\b(romantic|romance|love|kadhal|premam|dil|pyar|ishq|heart|duet|soulful|affection|couple|mohabbat|pranayam|anbe|kanmani|humsafar|saathiya|deewani|sanam|kesariya|apna bana le)\b/i.test(
      textToScan
    )
  ) {
    return { primary: "romantic", secondary: ["chill", "melody"], isBgm: false };
  }

  // 5. Energetic / Dance / Mass / Workout
  if (
    /\b(energy|energetic|dance|party|club|edm|mass|dappan|kuthu|workout|gym|beat|bass|drop|remix|fast|drill|trap|hip[\s-]?hop|rap|anthem|festival|dhol|illuminati|armadham|chaleya|badtameez)\b/i.test(
      textToScan
    )
  ) {
    return { primary: "energetic", secondary: ["dance", "feel_good"], isBgm: false };
  }

  // 6. Chill / Relaxing / Lo-Fi
  if (
    /\b(chill|relax|lo[\s-]?fi|lofi|calm|soothing|slow|ambient|sleep|acoustic|coffee|peace|peaceful|serene|meditat|unplugged)\b/i.test(
      textToScan
    )
  ) {
    return { primary: "chill", secondary: ["feel_good", "acoustic"], isBgm: false };
  }

  // 7. Feel-Good / Happy / Positive (Default)
  return { primary: "feel_good", secondary: ["pop", "upbeat"], isBgm: false };
}

/**
 * Returns exact mood match score (100, 80, 50, 10)
 */
export function getMoodMatchScore(candidate, seedTrack) {
  const seedMood = classifySongMood(seedTrack);
  const candMood = classifySongMood(candidate);

  // Exact same primary mood
  if (seedMood.primary === candMood.primary) {
    return 100;
  }

  // If seed is BGM, protect it strictly: vocal pop or party songs are only 10 pts
  if (seedMood.isBgm) {
    if (candMood.isBgm) return 100;
    if (candMood.primary === "chill" || candMood.secondary.includes("instrumental")) return 50;
    return 10;
  }

  // Very similar pairs (80 points)
  const p1 = seedMood.primary;
  const p2 = candMood.primary;
  const isVerySimilar =
    (p1 === "feel_good" && (p2 === "chill" || p2 === "energetic")) ||
    (p1 === "chill" && (p2 === "feel_good" || p2 === "romantic" || p2 === "sad")) ||
    (p1 === "romantic" && (p2 === "chill" || p2 === "feel_good")) ||
    (p1 === "energetic" && p2 === "feel_good") ||
    (p1 === "sad" && p2 === "chill");

  if (isVerySimilar) {
    return 80;
  }

  // Related pairs (50 points)
  const isRelated =
    (p1 === "romantic" && p2 === "sad") ||
    (p1 === "feel_good" && p2 === "romantic") ||
    seedMood.secondary.some((s) => candMood.secondary.includes(s));

  if (isRelated) {
    return 50;
  }

  // Different mood (10 points)
  return 10;
}

export function detectSongTypes(track) {
  const mood = classifySongMood(track);
  return new Set([mood.primary, ...mood.secondary]);
}

export function isSongTypeMatch(candidate, seedTrack) {
  return getMoodMatchScore(candidate, seedTrack) >= 80;
}

export function isRelatedMatch(candidate, seedTrack) {
  return getMoodMatchScore(candidate, seedTrack) >= 50;
}

/**
 * --------------------------------------------------------------------------
 * 3. TRENDING / POPULARITY — HIGH PRIORITY (Score: 0 to 100 | Weight: 20)
 * --------------------------------------------------------------------------
 * Combines play count metrics with release recency to favor current trending hits.
 */
export function calculatePopularityScore(track) {
  if (!track) return 30;

  let playCount = 0;
  if (track.play_count !== undefined && track.play_count !== null) {
    playCount = Number(track.play_count) || 0;
  } else if (track.playCount !== undefined && track.playCount !== null) {
    playCount = Number(track.playCount) || 0;
  } else if (track.more_info?.play_count) {
    playCount = Number(track.more_info.play_count) || 0;
  }

  // Play count base score (0 to 75 points)
  let playScore = 35; // Default baseline for tracks without explicit counter
  if (playCount >= 50000000) {
    playScore = 75;
  } else if (playCount >= 10000000) {
    playScore = 60 + Math.min(15, Math.floor(((playCount - 10000000) / 40000000) * 15));
  } else if (playCount >= 2000000) {
    playScore = 45 + Math.min(15, Math.floor(((playCount - 2000000) / 8000000) * 15));
  } else if (playCount >= 500000) {
    playScore = 30 + Math.min(15, Math.floor(((playCount - 500000) / 1500000) * 15));
  } else if (playCount >= 100000) {
    playScore = 20 + Math.min(10, Math.floor(((playCount - 100000) / 400000) * 10));
  } else if (playCount > 0) {
    playScore = 15;
  }

  // Recency / Trending score (0 to 25 points)
  // "Prefer current popularity over songs that were popular years ago."
  let recencyScore = 5;
  const rawYear = track.year || track.more_info?.year || track.release_date?.slice(0, 4);
  const year = parseInt(rawYear || "0", 10);
  if (year >= 2024) {
    recencyScore = 25; // Currently trending / hot release
  } else if (year >= 2022) {
    recencyScore = 20; // Recent hit
  } else if (year >= 2020) {
    recencyScore = 15;
  } else if (year >= 2017) {
    recencyScore = 10;
  }

  return Math.min(100, Math.max(0, playScore + recencyScore));
}

/**
 * --------------------------------------------------------------------------
 * 4. ARTIST DIVERSITY & PUZZLE FACTOR (Score: 0 to 100 | Weight: 10)
 * --------------------------------------------------------------------------
 * "DO NOT make the next songs primarily from the same artist."
 * Same artist is allowed occasionally (1-2 times in 8-10 songs), never back-to-back.
 */
export function calculateArtistDiversityScore(candidate, seedTrack, artistCounts = new Map(), lastArtistName = null) {
  const candArtists = extractArtists(candidate);
  const seedArtists = extractArtists(seedTrack);
  const isSeedArtistMatch = candArtists.some((ca) => seedArtists.includes(ca));

  const primaryLead = candArtists[0] || cleanStr(candidate.primary_artist || candidate.artist || "");

  // Never place back-to-back identical artist
  if (lastArtistName && primaryLead && lastArtistName === primaryLead) {
    return 0;
  }

  const timesAppeared = artistCounts.get(primaryLead) || 0;

  // Already appeared 2 or more times: drop heavily
  if (timesAppeared >= 2) {
    return 0;
  }

  // Already appeared once
  if (timesAppeared === 1) {
    return 20;
  }

  // Not yet appeared in queue
  if (isSeedArtistMatch) {
    // Reference song's artist: allowed occasionally as a pleasant surprise
    return 50;
  }

  // Fresh diverse artist
  return 100;
}

/**
 * --------------------------------------------------------------------------
 * QUEUE SCORING FORMULA
 * --------------------------------------------------------------------------
 * Queue Score =
 *     Language Match       × 35
 *   + Mood/Type Match      × 30
 *   + Trending/Popularity  × 20
 *   + Artist Diversity     × 10
 *   + Discovery Factor     × 5
 */
export function calculateQueueScore(candidate, seedTrack, options = {}) {
  const { artistCounts = new Map(), lastArtist = null } = options;

  const langMatch = getLanguageMatchScore(candidate, seedTrack);
  const moodMatch = getMoodMatchScore(candidate, seedTrack);
  const popScore = calculatePopularityScore(candidate);
  const artDiversity = calculateArtistDiversityScore(candidate, seedTrack, artistCounts, lastArtist);
  const discoveryFactor = Math.floor(Math.random() * 80) + 20; // Controlled randomness (20 to 100)

  const totalScore =
    langMatch * 35 +
    moodMatch * 30 +
    popScore * 20 +
    artDiversity * 10 +
    discoveryFactor * 5;

  return {
    totalScore,
    langMatch,
    moodMatch,
    popScore,
    artDiversity,
    discoveryFactor,
  };
}

/**
 * Backwards compatibility helper for existing references
 */
export function assignCandidateTier(candidate, seedTrack) {
  const langMatch = getLanguageMatchScore(candidate, seedTrack);
  const moodMatch = getMoodMatchScore(candidate, seedTrack);

  if (langMatch === 100 && moodMatch >= 80) {
    return { tier: 1, tierReason: "Same Language & Mood", sameLanguage: true, isRelated: true };
  }
  if (langMatch === 100 && moodMatch >= 50) {
    return { tier: 2, tierReason: "Same Language", sameLanguage: true, isRelated: true };
  }
  if (langMatch >= 40 && moodMatch >= 50) {
    return { tier: 3, tierReason: "Related Language & Mood", sameLanguage: false, isRelated: true };
  }
  return { tier: 4, tierReason: "Fallback Discovery", sameLanguage: false, isRelated: false };
}

export function calculateSecondaryScore(candidate, seedTrack, tierInfo = {}) {
  const scoreObj = calculateQueueScore(candidate, seedTrack);
  return scoreObj.totalScore;
}

/**
 * --------------------------------------------------------------------------
 * INTELLIGENT QUEUE BUILDER WITH CONTROLLED RANDOMNESS & ARTIST PUZZLE
 * --------------------------------------------------------------------------
 * 1. Filter out seed track, session history duplicates, and invalid tracks.
 * 2. Classify candidates into 4 strict Fallback Levels:
 *    - Level 1: Same language + same mood/type + popular
 *    - Level 2: Same language + similar mood/type + popular
 *    - Level 3: Same language + related music + trending
 *    - Level 4: Any language + highly suitable mood/type + popular (only when necessary)
 * 3. Enforce Artist Diversity Rule:
 *    - Same artist normally appears no more than 1–2 times within the next 8–10 songs.
 *    - Never place the same artist repeatedly back-to-back.
 *    - Seed artist appears as an occasional pleasant surprise (slot 2+, not slot 0/1).
 * 4. Controlled Randomness:
 *    - Divides into score tiers and randomly selects from the top candidate tier.
 * 5. Returns 10-15 ranked songs.
 */
export function buildIntelligentQueue(seedTrack, candidatePool, options = {}) {
  if (!seedTrack || !Array.isArray(candidatePool) || candidatePool.length === 0) {
    return [];
  }

  const maxResults = options.maxResults || 15;

  const excludeIds = new Set(
    (Array.isArray(options.excludeIds)
      ? options.excludeIds
      : options.excludeIds instanceof Set
      ? Array.from(options.excludeIds)
      : String(options.excludeIds || "").split(",")
    )
      .map((s) => String(s).trim())
      .filter(Boolean)
  );

  const sessionPlayedIds = new Set(
    (Array.isArray(options.sessionPlayedIds)
      ? options.sessionPlayedIds
      : options.sessionPlayedIds instanceof Set
      ? Array.from(options.sessionPlayedIds)
      : String(options.sessionPlayedIds || "").split(",")
    )
      .map((s) => String(s).trim())
      .filter(Boolean)
  );

  const seedId = String(seedTrack.id || "").trim();
  if (seedId) excludeIds.add(seedId);

  // 1. Clean & Deduplicate candidates
  const seenIds = new Set();
  const seenTitleArtist = new Set();
  const validCandidates = [];

  for (const track of candidatePool) {
    if (!track || !track.id) continue;
    const tid = String(track.id).trim();
    if (excludeIds.has(tid)) continue;
    if (seenIds.has(tid)) continue;

    const cleanT = cleanStr(track.title || track.song || "");
    const cleanA = cleanStr(track.artist || track.primary_artist || "");
    const taKey = `${cleanT}:::${cleanA}`;
    if (cleanT && cleanA && seenTitleArtist.has(taKey)) continue;

    seenIds.add(tid);
    if (cleanT && cleanA) seenTitleArtist.add(taKey);
    validCandidates.push(track);
  }

  // Exclude session history tracks when enough fresh candidates exist
  let pool = validCandidates.filter((t) => !sessionPlayedIds.has(String(t.id)));
  if (pool.length < maxResults) {
    const played = validCandidates.filter((t) => sessionPlayedIds.has(String(t.id)));
    pool = [...pool, ...played];
  }

  const finalQueue = [];
  const artistCounts = new Map();
  const seedArtists = extractArtists(seedTrack);
  const seedLeadArtist = seedArtists[0] || "";
  let lastArtist = seedLeadArtist; // Reference song is currently playing; slot 0 must NOT be seed artist!
  let seedArtistAppearances = 0;

  // 2. Iteratively build queue slots
  while (finalQueue.length < maxResults && pool.length > 0) {
    const queueIndex = finalQueue.length;

    // Segment remaining candidates into the 4 Fallback Levels
    const level1 = []; // Same language (100) + same mood/type (>= 80)
    const level2 = []; // Same language (100) + similar mood/type (>= 50)
    const level3 = []; // Same language (100) + related (>= 10) OR related language (40) + mood (>= 50)
    const level4 = []; // Any language + mood (>= 80)

    for (const cand of pool) {
      const lang = getLanguageMatchScore(cand, seedTrack);
      const mood = getMoodMatchScore(cand, seedTrack);

      if (lang === 100 && mood >= 80) {
        level1.push(cand);
      } else if (lang === 100 && mood >= 50) {
        level2.push(cand);
      } else if ((lang === 100 && mood >= 10) || (lang === 40 && mood >= 50)) {
        level3.push(cand);
      } else if (mood >= 80) {
        level4.push(cand);
      } else {
        level4.push(cand);
      }
    }

    // Always select from highest available non-empty Fallback Level
    const activeLevel =
      level1.length > 0
        ? level1
        : level2.length > 0
        ? level2
        : level3.length > 0
        ? level3
        : level4;

    // Calculate dynamic scores for active level items
    const scoredList = activeLevel.map((cand) => {
      const scoreObj = calculateQueueScore(cand, seedTrack, {
        artistCounts,
        lastArtist,
      });
      return {
        track: cand,
        ...scoreObj,
      };
    });

    // Apply Artist Diversity & Surprise Rules:
    // a. Never place the same artist repeatedly back-to-back
    // b. In slots 0 & 1, do NOT pick seed artist (let user discover other artists first)
    // c. Seed artist max 2 appearances in a 15-song queue
    // d. Other artists max 2 appearances in queue
    let eligible = scoredList.filter((item) => {
      const candArtists = extractArtists(item.track);
      const lead = candArtists[0] || cleanStr(item.track.primary_artist || item.track.artist || "");

      // No back-to-back identical artist
      if (lastArtist && lead && lastArtist === lead) return false;

      const isSeedArtist = candArtists.some((ca) => seedArtists.includes(ca));

      // Seed artist puzzle: do not appear in the very first 2 upcoming slots
      if (queueIndex < 2 && isSeedArtist) return false;

      // Seed artist appearance cap
      if (isSeedArtist && seedArtistAppearances >= 2) return false;

      // Other artist appearance cap
      const count = artistCounts.get(lead) || 0;
      if (count >= 2) return false;

      return true;
    });

    // If filters were too strict for the remaining pool, gently relax back-to-back or count limits
    if (eligible.length === 0) {
      eligible = scoredList.filter((item) => {
        const candArtists = extractArtists(item.track);
        const lead = candArtists[0] || cleanStr(item.track.primary_artist || item.track.artist || "");
        const count = artistCounts.get(lead) || 0;
        return count < 3;
      });
    }

    if (eligible.length === 0) {
      eligible = scoredList;
    }

    // Sort eligible by totalScore descending
    eligible.sort((a, b) => b.totalScore - a.totalScore);

    // Controlled Randomness & Variety:
    // Take a wide top-scoring slice (top 6-8 candidates) and dynamically sample
    const sliceSize = Math.min(8, eligible.length);
    const topSlice = eligible.slice(0, sliceSize);
    const selectedItem = topSlice[Math.floor(Math.random() * topSlice.length)];

    const chosenTrack = selectedItem.track;
    const chosenArtists = extractArtists(chosenTrack);
    const chosenLead = chosenArtists[0] || cleanStr(chosenTrack.primary_artist || chosenTrack.artist || "");

    // Update state tracking
    lastArtist = chosenLead;
    artistCounts.set(chosenLead, (artistCounts.get(chosenLead) || 0) + 1);
    if (chosenArtists.some((ca) => seedArtists.includes(ca))) {
      seedArtistAppearances++;
    }

    // Format output track
    const durSec = Number(chosenTrack.duration || 210);
    const m = Math.floor(durSec / 60);
    const s = Math.floor(durSec % 60);
    const durationFormatted = chosenTrack.durationFormatted || `${m}:${s < 10 ? "0" : ""}${s}`;

    finalQueue.push({
      ...chosenTrack,
      id: String(chosenTrack.id),
      title: chosenTrack.title || chosenTrack.song || "Unknown Track",
      artist: chosenTrack.artist || chosenTrack.primary_artist || "Unknown Artist",
      tier: selectedItem.langMatch === 100 ? (selectedItem.moodMatch >= 80 ? 1 : 2) : 3,
      tierReason: selectedItem.langMatch === 100 ? (selectedItem.moodMatch >= 80 ? "Same Language & Mood" : "Same Language") : "Related Music",
      queueScore: selectedItem.totalScore,
      score: selectedItem.totalScore,
      duration: durSec,
      durationFormatted,
      isManual: false,
      queueMeta: {
        score: selectedItem.totalScore,
        languageScore: selectedItem.langMatch,
        moodScore: selectedItem.moodMatch,
        popularityScore: selectedItem.popScore,
        artistScore: selectedItem.artDiversity,
        discoveryScore: selectedItem.discoveryFactor,
        isSameArtist: chosenArtists.some((ca) => seedArtists.includes(ca)),
      },
    });

    // Remove chosen track from active candidate pool
    const chosenId = String(chosenTrack.id);
    pool = pool.filter((t) => String(t.id) !== chosenId);
  }

  return finalQueue;
}

/**
 * Main external export: generateRecommendedQueue(currentSong, musicCatalog, options)
 */
export function generateRecommendedQueue(currentSong, musicCatalog, options = {}) {
  return buildIntelligentQueue(currentSong, musicCatalog, options);
}
