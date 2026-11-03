/**
 * Smart Queue Candidate Scorer
 *
 * Computes multi-dimensional similarity between a candidate song and a seed song
 * using the unified configuration weights, handling acoustic attributes, metadata,
 * popularity, co-listening signals, and user feedback penalties.
 */

import { SMART_QUEUE_CONFIG } from "./config.js";

/**
 * Standard mood acoustic coordinate mapping (Valence, Energy)
 */
const MOOD_COORDINATES = {
  energetic_hype: { valence: 0.75, energy: 0.88, defaultBpm: 128 },
  party_dance: { valence: 0.80, energy: 0.85, defaultBpm: 126 },
  happy_feel_good: { valence: 0.85, energy: 0.68, defaultBpm: 116 },
  love_romance: { valence: 0.72, energy: 0.45, defaultBpm: 92 },
  chill_peaceful: { valence: 0.55, energy: 0.35, defaultBpm: 88 },
  sad_emotional: { valence: 0.22, energy: 0.30, defaultBpm: 78 },
  dark_intense: { valence: 0.28, energy: 0.82, defaultBpm: 132 },
  motivational: { valence: 0.80, energy: 0.78, defaultBpm: 120 },
  neutral: { valence: 0.50, energy: 0.50, defaultBpm: 105 },
};

/**
 * Normalizes string for reliable token comparisons
 */
export function cleanStr(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts and tokenizes all artist names associated with a song
 */
export function extractArtists(track) {
  if (!track) return [];
  const set = new Set();

  const add = (name) => {
    if (!name || typeof name !== "string") return;
    const parts = name.split(/[,&/|;]|\s+feat\.?\s+|\s+ft\.?\s+|\s+with\s+|\s+and\s+|\s+x\s+|\s+vs\.?\s+/i);
    for (const p of parts) {
      const c = cleanStr(p);
      if (c && c.length >= 2 && !/^(various|unknown|artist|artists)$/.test(c)) {
        set.add(c);
      }
    }
  };

  add(track.primary_artist || track.primaryArtist || track.artist);
  add(track.singers);
  add(track.music || track.composer || track.musicDirector || track.more_info?.music);
  if (Array.isArray(track.featured_artists)) {
    track.featured_artists.forEach((a) => add(typeof a === "object" ? a.name : a));
  } else if (typeof track.featured_artists === "string") {
    add(track.featured_artists);
  }

  return Array.from(set);
}

/**
 * Extracts normalized features with reliable cold-start fallbacks
 */
export function extractSongFeatures(track, config = SMART_QUEUE_CONFIG) {
  if (!track) return null;

  const id = String(track.id || track.songId || "").replace(/^track-/, "").trim();
  const title = (track.title || track.song || track.name || "").trim();
  const album = cleanStr(track.album || track.albumName || track.movie || track.movieName || "");
  const language = (track.language || track.more_info?.language || "").toLowerCase().trim();

  const allArtists = extractArtists(track);
  const primaryArtist = allArtists[0] || cleanStr(track.artist || track.primary_artist || "");
  const composer = cleanStr(track.music || track.composer || track.musicDirector || track.more_info?.music || "");

  // Genre & subgenres
  const rawGenre = track.genre || track.sub_genre || track.category || track.more_info?.genre || "";
  const genres = Array.isArray(rawGenre)
    ? rawGenre.map(cleanStr).filter(Boolean)
    : cleanStr(rawGenre).split(" ").filter((g) => g.length > 2);

  // Mood detection & valence/energy coordinates
  const rawMood = cleanStr(track.mood || track.more_info?.mood || "");
  const moodCoord = MOOD_COORDINATES[rawMood] || MOOD_COORDINATES[config.coldStart.defaultMood];

  const valence = typeof track.valence === "number" && !isNaN(track.valence)
    ? Math.max(0, Math.min(1, track.valence))
    : moodCoord.valence;

  const energy = typeof track.energy === "number" && !isNaN(track.energy)
    ? Math.max(0, Math.min(1, track.energy))
    : moodCoord.energy;

  // Tempo (BPM)
  let tempo = Number(track.tempo || track.bpm || track.more_info?.tempo || 0);
  if (!tempo || isNaN(tempo) || tempo <= 40 || tempo >= 240) {
    tempo = moodCoord.defaultBpm || config.coldStart.defaultBpm;
  }

  // Release year
  let year = parseInt(track.year || track.releaseDate?.slice(0, 4) || "0", 10);
  if (!year || isNaN(year) || year < 1950 || year > 2030) {
    year = config.coldStart.defaultYear;
  }

  // Tags
  let tags = [];
  if (Array.isArray(track.tags)) {
    tags = track.tags.map(cleanStr).filter(Boolean);
  } else if (typeof track.tags === "string") {
    tags = track.tags.split(/[,#\s]+/).map(cleanStr).filter(Boolean);
  }

  // Play count
  const playCount = Number(track.play_count || track.playCount || track.plays || 0);

  return {
    id,
    title,
    album,
    language,
    allArtists,
    primaryArtist,
    composer,
    genres,
    mood: rawMood || config.coldStart.defaultMood,
    valence,
    energy,
    tempo,
    year,
    tags,
    playCount,
    rawTrack: track,
  };
}

/**
 * Calculates genre similarity (Jaccard index + hierarchical fallback)
 */
export function calculateGenreSimilarity(featA, featB) {
  if (!featA.genres.length || !featB.genres.length) return 0.5; // Neutral cold-start fallback

  const setA = new Set(featA.genres);
  const setB = new Set(featB.genres);

  let intersection = 0;
  for (const g of setA) {
    if (setB.has(g)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  if (union === 0) return 0.5;

  const jaccard = intersection / union;
  return intersection > 0 ? Math.max(0.6, jaccard) : 0.2;
}

/**
 * Calculates artist & creator similarity
 */
export function calculateArtistSimilarity(featA, featB) {
  if (featA.primaryArtist && featB.primaryArtist && featA.primaryArtist === featB.primaryArtist) {
    return 1.0; // Same primary artist
  }

  if (featA.composer && featB.composer && featA.composer === featB.composer) {
    return 0.85; // Same composer / music director
  }

  if (featA.album && featB.album && featA.album === featB.album) {
    return 0.70; // Same album or soundtrack
  }

  // Check collaborator overlap
  const setA = new Set(featA.allArtists);
  for (const art of featB.allArtists) {
    if (setA.has(art)) return 0.50; // Shared featured singer or musician
  }

  return 0.0;
}

/**
 * Calculates acoustic mood similarity (Valence and Energy Euclidean distance)
 */
export function calculateMoodSimilarity(featA, featB) {
  const dValence = featA.valence - featB.valence;
  const dEnergy = featA.energy - featB.energy;
  const dist = Math.sqrt(dValence * dValence + dEnergy * dEnergy);
  // Maximum distance in [0,1]x[0,1] square is sqrt(2) approx 1.414
  const normDist = dist / 1.4142;
  return Math.max(0, 1.0 - normDist);
}

/**
 * Calculates tempo closeness with harmonic half/double time handling
 */
export function calculateTempoSimilarity(featA, featB) {
  const tA = featA.tempo;
  const tB = featB.tempo;

  // Harmonic distance: min of direct difference, half-time, or double-time difference
  const directDiff = Math.abs(tA - tB);
  const halfDiff = Math.abs(tA * 2 - tB);
  const doubleDiff = Math.abs(tA - tB * 2);
  const effectiveDiff = Math.min(directDiff, halfDiff, doubleDiff);

  // 0 distance = 1.0; 40+ BPM distance = 0.0
  return Math.max(0, 1.0 - effectiveDiff / 40);
}

/**
 * Calculates release era proximity
 */
export function calculateEraCloseness(featA, featB) {
  const yearDiff = Math.abs(featA.year - featB.year);
  // Songs within 15 years get proportional score
  return Math.max(0, 1.0 - yearDiff / 15);
}

/**
 * Calculates shared tags similarity
 */
export function calculateSharedTagsSimilarity(featA, featB) {
  if (!featA.tags.length || !featB.tags.length) return 0.5; // Neutral cold-start

  const setA = new Set(featA.tags);
  let common = 0;
  for (const t of featB.tags) {
    if (setA.has(t)) common++;
  }
  const union = new Set([...featA.tags, ...featB.tags]).size;
  return union > 0 ? common / union : 0.5;
}

/**
 * Calculates log-scaled popularity score
 */
export function calculateLogPopularity(feat, maxExpectedPlays = 50000000) {
  const count = Math.max(0, feat.playCount);
  if (count <= 0) return 0.15;
  const logScore = Math.log10(count + 1) / Math.log10(maxExpectedPlays + 1);
  return Math.max(0, Math.min(1.0, logScore));
}

/**
 * Full Pairwise Similarity between any two tracks (used in MMR)
 */
export function calculatePairwiseSimilarity(trackA, trackB, config = SMART_QUEUE_CONFIG) {
  const featA = extractSongFeatures(trackA, config);
  const featB = extractSongFeatures(trackB, config);
  if (!featA || !featB) return 0;

  const w = config.weights;
  const genreSim = calculateGenreSimilarity(featA, featB);
  const artistSim = calculateArtistSimilarity(featA, featB);
  const moodSim = calculateMoodSimilarity(featA, featB);
  const tempoSim = calculateTempoSimilarity(featA, featB);
  const eraSim = calculateEraCloseness(featA, featB);

  // Normalize weights for pairwise acoustic/content similarity
  const baseWeightSum = w.genreSimilarity + w.artistSimilarity + w.moodSimilarity + w.tempoSimilarity + w.eraCloseness;
  const sim = (
    genreSim * w.genreSimilarity +
    artistSim * w.artistSimilarity +
    moodSim * w.moodSimilarity +
    tempoSim * w.tempoSimilarity +
    eraSim * w.eraCloseness
  ) / baseWeightSum;

  return Math.max(0, Math.min(1.0, sim));
}

/**
 * Scores a candidate song against the seed song using the full pipeline
 */
export function scoreCandidate(candidate, seedTrack, context = {}, config = SMART_QUEUE_CONFIG) {
  const featSeed = extractSongFeatures(seedTrack, config);
  const featCand = extractSongFeatures(candidate, config);
  if (!featSeed || !featCand) {
    return { score: 0, featureScores: {}, candidate };
  }

  const w = config.weights;
  const p = config.penalties;

  // 1. Feature similarities
  const genreSim = calculateGenreSimilarity(featCand, featSeed);
  const artistSim = calculateArtistSimilarity(featCand, featSeed);
  const moodSim = calculateMoodSimilarity(featCand, featSeed);
  const tempoSim = calculateTempoSimilarity(featCand, featSeed);
  const eraSim = calculateEraCloseness(featCand, featSeed);
  const tagsSim = calculateSharedTagsSimilarity(featCand, featSeed);

  // 2. Co-listening signal (transition probability matrix if available)
  let coListeningSim = 0;
  if (context.coListeningMatrix && context.coListeningMatrix[featSeed.id]) {
    coListeningSim = Number(context.coListeningMatrix[featSeed.id][featCand.id] || 0);
  }

  // 3. Log-scaled popularity
  const popScore = calculateLogPopularity(featCand, config.thresholds.maxExpectedPlays);

  // 4. User taste affinity bonus
  let userTasteBonus = 0;
  if (context.userLikes && context.userLikes.has(featCand.id)) {
    userTasteBonus += 0.60;
  }
  if (context.userCompletions && context.userCompletions.has(featCand.id)) {
    userTasteBonus += 0.25;
  }
  if (context.userReplays && context.userReplays.has(featCand.id)) {
    userTasteBonus += 0.35;
  }
  userTasteBonus = Math.min(1.0, userTasteBonus);

  // Base raw score
  let score =
    genreSim * w.genreSimilarity +
    artistSim * w.artistSimilarity +
    moodSim * w.moodSimilarity +
    tempoSim * w.tempoSimilarity +
    eraSim * w.eraCloseness +
    tagsSim * w.sharedTags +
    coListeningSim * w.coListeningSignal +
    popScore * w.popularity +
    userTasteBonus * w.userTasteBonus;

  // 5. Behavioral Penalties
  // Quick skip dampening: lower score if this candidate shares artist or mood with a quick-skipped song in this session
  if (context.skippedProfiles && context.skippedProfiles.length > 0) {
    for (const skip of context.skippedProfiles) {
      const sharesArtist = skip.primaryArtist && featCand.primaryArtist === skip.primaryArtist;
      const sharesMood = skip.mood && featCand.mood === skip.mood;
      if (sharesArtist || sharesMood) {
        score -= p.quickSkipSimilarDampen;
        break;
      }
    }
  }

  // Recently played earlier in session penalty
  if (context.sessionPlayedIds && context.sessionPlayedIds.has(featCand.id)) {
    score -= p.recentlyPlayed;
  }

  return {
    score: Math.max(0.001, score),
    featureScores: {
      genreSim,
      artistSim,
      moodSim,
      tempoSim,
      eraSim,
      tagsSim,
      coListeningSim,
      popScore,
      userTasteBonus,
    },
    features: featCand,
    candidate,
  };
}

