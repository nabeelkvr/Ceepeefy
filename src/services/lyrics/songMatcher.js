/**
 * Accurate Song Matcher & Candidate Verification Engine
 *
 * Implements Section 4:
 * - Normalized title, artist, and album comparison
 * - Duration discrepancy check
 * - Version mismatch rejection (Live vs Studio, Remix vs Original)
 * - Instrumental vs Vocal checking
 * - Match confidence scoring (0 - 100)
 */

import { REJECTION_REASONS } from "./types.js";

/**
 * Normalizes title for song matching by stripping movie tags, remaster noise, etc.
 */
export function normalizeSongTitle(title) {
  if (!title || typeof title !== "string") return "";
  return title
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s*[\(\[](?:from|feat\.?|ft\.?|with|original|soundtrack|version|remix|acoustic|live|cover|official|lyric|audio|video|ost)[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*-\s*(?:from|remix|acoustic|live|cover|soundtrack|ost|extended|version).*/gi, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Normalizes primary artist name
 */
export function normalizeArtistName(artist) {
  if (!artist || typeof artist !== "string") return "";
  const first = artist.split(/[,&/|;]|\s+feat\.?\s+|\s+ft\.?\s+|\s+with\s+/i)[0] || "";
  return first
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Checks for version indicator discrepancies (remix, acoustic, live, instrumental)
 */
export function checkVersionMismatch(seedTrack = {}, candidate = {}) {
  const seedTitle = `${seedTrack.title || ""} ${seedTrack.album || ""}`.toLowerCase();
  const candTitle = `${candidate.title || candidate.track_name || ""} ${candidate.album || candidate.album_name || ""}`.toLowerCase();

  const isSeedRemix = /\b(remix|mix|mashup)\b/i.test(seedTitle);
  const isCandRemix = /\b(remix|mix|mashup)\b/i.test(candTitle);
  if (isSeedRemix !== isCandRemix) {
    return { mismatch: true, reason: REJECTION_REASONS.VERSION_MISMATCH };
  }

  const isSeedLive = /\b(live|concert|tour)\b/i.test(seedTitle);
  const isCandLive = /\b(live|concert|tour)\b/i.test(candTitle);
  if (isSeedLive !== isCandLive) {
    return { mismatch: true, reason: REJECTION_REASONS.VERSION_MISMATCH };
  }

  const isSeedAcoustic = /\b(acoustic|unplugged)\b/i.test(seedTitle);
  const isCandAcoustic = /\b(acoustic|unplugged)\b/i.test(candTitle);
  if (isSeedAcoustic !== isCandAcoustic) {
    return { mismatch: true, reason: REJECTION_REASONS.VERSION_MISMATCH };
  }

  const isSeedExplicit = typeof seedTrack.isInstrumental === "boolean";
  const isSeedInstrumental = isSeedExplicit
    ? seedTrack.isInstrumental
    : Boolean(
        seedTrack.isBgm ||
        /\b(instrumental|bgm|karaoke)\b/i.test(seedTitle)
      );

  const isCandExplicit =
    typeof candidate.isInstrumental === "boolean" ||
    typeof candidate.instrumental === "boolean";
  const candFlag =
    typeof candidate.isInstrumental === "boolean"
      ? candidate.isInstrumental
      : candidate.instrumental;
  const isCandInstrumental = isCandExplicit
    ? Boolean(candFlag)
    : Boolean(
        /\b(instrumental|bgm|karaoke)\b/i.test(candTitle)
      );

  if (isSeedInstrumental !== isCandInstrumental) {
    return { mismatch: true, reason: REJECTION_REASONS.INSTRUMENTAL_MISMATCH };
  }

  return { mismatch: false };
}

/**
 * Parses duration in seconds from numbers or formatted strings (e.g. 193, "193", "3:13")
 */
export function parseDurationSec(raw) {
  if (typeof raw === "number" && !isNaN(raw) && raw > 0) return Math.round(raw);
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.includes(":")) {
      const parts = trimmed.split(":").map((p) => parseFloat(p));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return Math.round(parts[0] * 60 + parts[1]);
      }
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
      }
    }
    const num = parseFloat(trimmed);
    if (!isNaN(num) && num > 0) return Math.round(num);
  }
  return 0;
}

/**
 * Extracts a list of normalized artist names from a multi-artist string
 */
export function extractArtistNames(artistStr) {
  if (!artistStr || typeof artistStr !== "string") return [];
  return artistStr
    .split(/[,&/|;]|\s+feat\.?\s+|\s+ft\.?\s+|\s+with\s+|\s+and\s+/i)
    .map((a) =>
      a
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "")
        .trim()
    )
    .filter(Boolean);
}

/**
 * Computes Levenshtein-based similarity between two clean strings (0 to 1)
 */
export function stringSimilarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const s1 = a.length < b.length ? a : b;
  const s2 = a.length < b.length ? b : a;

  if (s2.includes(s1)) {
    return s1.length / s2.length;
  }

  // Token-based Jaccard similarity fallback
  const set1 = new Set(s1.split("").filter(Boolean));
  const set2 = new Set(s2.split("").filter(Boolean));
  let intersection = 0;
  set1.forEach((char) => {
    if (set2.has(char)) intersection++;
  });
  const union = new Set([...set1, ...set2]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Validates candidate against seed track and calculates match confidence score (0 to 100)
 */
export function evaluateCandidateMatch(seedTrack, candidate) {
  if (!seedTrack || !candidate) {
    return {
      isValid: false,
      confidence: 0,
      rejectionReason: "Missing track seed or candidate object",
    };
  }

  // 1. Version and Instrumental Check
  const versionCheck = checkVersionMismatch(seedTrack, candidate);
  if (versionCheck.mismatch) {
    return {
      isValid: false,
      confidence: 0,
      rejectionReason: versionCheck.reason,
    };
  }

  const seedTitleNorm = normalizeSongTitle(seedTrack.title || seedTrack.track || "");
  const candTitleNorm = normalizeSongTitle(
    candidate.title || candidate.track_name || candidate.trackName || candidate.name || candidate.song || ""
  );

  if (!seedTitleNorm || !candTitleNorm) {
    return {
      isValid: false,
      confidence: 0,
      rejectionReason: REJECTION_REASONS.TITLE_MISMATCH,
    };
  }

  // 2. Title Similarity (Weight: 45)
  let titleScore = 0;
  if (seedTitleNorm === candTitleNorm) {
    titleScore = 45;
  } else if (seedTitleNorm.includes(candTitleNorm) || candTitleNorm.includes(seedTitleNorm)) {
    titleScore = 40;
  } else {
    const sim = stringSimilarity(seedTitleNorm, candTitleNorm);
    if (sim < 0.5) {
      return {
        isValid: false,
        confidence: Math.round(sim * 45),
        rejectionReason: REJECTION_REASONS.TITLE_MISMATCH,
      };
    }
    titleScore = Math.round(sim * 45);
  }

  // 3. Artist Matching (Weight: 30)
  const rawSeedArtist = seedTrack.artist || seedTrack.primary_artist || seedTrack.singers || "";
  const rawCandArtist =
    candidate.artist ||
    candidate.artist_name ||
    candidate.artistName ||
    candidate.primary_artists ||
    candidate.singers ||
    "";

  const seedArtists = extractArtistNames(rawSeedArtist);
  const candArtists = extractArtistNames(rawCandArtist);

  let artistScore = 0;
  let hasArtistMatch = false;

  if (seedArtists.length > 0 && candArtists.length > 0) {
    // Check if ANY artist from seed matches or includes candidate artist
    for (const sa of seedArtists) {
      for (const ca of candArtists) {
        if (sa === ca || sa.includes(ca) || ca.includes(sa)) {
          hasArtistMatch = true;
          break;
        }
      }
      if (hasArtistMatch) break;
    }

    if (hasArtistMatch) {
      artistScore = 30;
    } else {
      const fullSeed = normalizeArtistName(rawSeedArtist);
      const fullCand = normalizeArtistName(rawCandArtist);
      const artSim = stringSimilarity(fullSeed, fullCand);
      if (artSim >= 0.55) {
        artistScore = Math.round(artSim * 30);
      } else {
        // Distinct, completely different artists -> Reject candidate
        return {
          isValid: false,
          confidence: Math.max(0, titleScore - 20),
          rejectionReason: REJECTION_REASONS.ARTIST_MISMATCH,
        };
      }
    }
  } else {
    artistScore = 15; // Neutral when artist not provided
  }

  // 4. Album Matching (Weight: 15)
  const seedAlbum = normalizeSongTitle(seedTrack.album || seedTrack.albumName || seedTrack.movieName || "");
  const candAlbum = normalizeSongTitle(
    candidate.album || candidate.album_name || candidate.albumName || candidate.movieName || ""
  );
  let albumScore = 0;
  if (seedAlbum && candAlbum) {
    if (seedAlbum === candAlbum || seedAlbum.includes(candAlbum) || candAlbum.includes(seedAlbum)) {
      albumScore = 15;
    } else {
      albumScore = 5;
    }
  } else {
    albumScore = 8;
  }

  // 5. Duration Verification (Weight: 10)
  const seedDur = parseDurationSec(seedTrack.duration);
  const candDur = parseDurationSec(candidate.duration);
  let durationScore = 0;

  if (seedDur > 15 && candDur > 15) {
    const diff = Math.abs(seedDur - candDur);
    if (diff <= 4) {
      durationScore = 10;
    } else if (diff <= 10) {
      durationScore = 7;
    } else if (diff <= 18) {
      durationScore = 4;
    } else if (diff > 35) {
      // If duration discrepancy is significant, reject unless it's a very exact title + artist match
      if (diff > 50 || titleScore < 40) {
        return {
          isValid: false,
          confidence: Math.max(0, titleScore + artistScore - 30),
          rejectionReason: `${REJECTION_REASONS.DURATION_MISMATCH} (diff: ${diff.toFixed(1)}s)`,
        };
      }
    }
  } else {
    durationScore = 6; // Neutral score when duration is not yet available
  }

  const totalConfidence = Math.min(100, titleScore + artistScore + albumScore + durationScore);
  const minThreshold = 55;

  if (totalConfidence < minThreshold) {
    return {
      isValid: false,
      confidence: totalConfidence,
      rejectionReason: `Match confidence ${totalConfidence} below threshold ${minThreshold}`,
    };
  }

  return {
    isValid: true,
    confidence: totalConfidence,
    rejectionReason: null,
  };
}
