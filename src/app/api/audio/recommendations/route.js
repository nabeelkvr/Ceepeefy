import { NextResponse } from "next/server";
import CryptoJS from "crypto-js";
import { NOCTURNE_TRACKS } from "../../../../data/nocturneData";

// In-memory cache for recommendation queries
const recoCache = new Map();

function decryptMediaUrl(encryptedUrl) {
  if (!encryptedUrl) return null;
  try {
    const key = CryptoJS.enc.Utf8.parse("38346591");
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encryptedUrl) },
      key,
      {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
      }
    );
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (err) {
    console.error("DES Decryption error:", err);
    return null;
  }
}

function cleanHtmlText(str) {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function cleanStr(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function formatDuration(secs) {
  if (isNaN(secs) || secs <= 0) return "3:30";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function parsePlayCount(raw) {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number") {
    return isNaN(raw) ? 0 : Math.round(raw);
  }
  const str = String(raw).trim().toUpperCase();
  if (!str) return 0;

  const match = str.match(/^([\d,.]+)\s*([BKM])?$/);
  if (match) {
    const numPart = parseFloat(match[1].replace(/,/g, ""));
    if (isNaN(numPart)) return 0;
    const suffix = match[2];
    if (suffix === "B") return Math.round(numPart * 1000000000);
    if (suffix === "M") return Math.round(numPart * 1000000);
    if (suffix === "K") return Math.round(numPart * 1000);
    return Math.round(numPart);
  }

  const num = parseFloat(str.replace(/[^0-9.]/g, ""));
  return isNaN(num) ? 0 : Math.round(num);
}

function formatPlayCount(count) {
  if (!count || isNaN(count) || count <= 0) return null;
  if (count >= 1000000000) return `${(count / 1000000000).toFixed(1)}B`;
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return `${count}`;
}

function formatSongItem(song) {
  if (!song) return null;
  const moreInfo = song.more_info || {};
  const encryptedMediaUrl = moreInfo.encrypted_media_url || song.encrypted_media_url;
  let audioUrl = "";

  if (encryptedMediaUrl) {
    const rawDecryptedUrl = decryptMediaUrl(encryptedMediaUrl);
    if (rawDecryptedUrl && rawDecryptedUrl.startsWith("http")) {
      audioUrl = rawDecryptedUrl.replace(/_96\.mp4/, "_320.mp4");
    }
  }

  // Extract combined artist names
  let artistName = "";
  if (moreInfo.artistMap?.primary_artists && Array.isArray(moreInfo.artistMap.primary_artists)) {
    artistName = moreInfo.artistMap.primary_artists.map((a) => a.name).join(", ");
  }
  if (!artistName) {
    artistName = song.primary_artists || song.singers || moreInfo.music || "Various Artists";
  }

  // Extract lead primary artist
  let leadPrimaryArtist = "";
  if (moreInfo.artistMap?.primary_artists && Array.isArray(moreInfo.artistMap.primary_artists) && moreInfo.artistMap.primary_artists.length > 0) {
    leadPrimaryArtist = moreInfo.artistMap.primary_artists[0].name;
  } else if (song.primary_artists) {
    leadPrimaryArtist = Array.isArray(song.primary_artists)
      ? (song.primary_artists[0]?.name || song.primary_artists[0])
      : song.primary_artists.split(",")[0];
  } else {
    leadPrimaryArtist = artistName.split(",")[0];
  }

  const durationSec = parseInt(moreInfo.duration || song.duration || "210", 10);
  const cover = (song.image || "").replace(/50x50|150x150/, "500x500") || null;
  const rawYear = song.year || moreInfo.year || moreInfo.release_date?.slice(0, 4) || null;
  const parsedYear = rawYear ? parseInt(rawYear, 10) : null;
  const playCount = parsePlayCount(song.play_count || moreInfo.play_count || song.plays || "0");
  const albumId = moreInfo.album_id || song.album_id || song.albumid || "";

  return {
    id: String(song.id),
    title: cleanHtmlText(song.song || song.title || "Unknown Track"),
    artist: cleanHtmlText(artistName),
    primary_artist: cleanHtmlText(leadPrimaryArtist),
    primaryArtist: cleanHtmlText(leadPrimaryArtist),
    album: cleanHtmlText(moreInfo.album || song.album || ""),
    album_id: albumId ? String(albumId) : "",
    albumId: albumId ? String(albumId) : "",
    language: cleanHtmlText(song.language || moreInfo.language || ""),
    year: parsedYear && parsedYear > 1900 ? parsedYear : rawYear,
    coverUrl: cover,
    audioUrl: audioUrl || null,
    duration: durationSec,
    durationFormatted: formatDuration(durationSec),
    play_count: playCount,
    playCount: playCount,
    playCountFormatted: formatPlayCount(playCount),
    source: "jiosaavn_reco",
  };
}

/**
 * Strict Tiered Sorting Algorithm (ListenFree Logic):
 * 
 * Priority 1 (The Perfect Match):
 * Tracks that belong to the exact same album_id (same movie)
 * OR feature the exact same primary_artist AND match the same language and sonic type/era.
 * 
 * Priority 2 (The Artist & Universe Match):
 * Tracks from the same primary_artist (different movie)
 * OR tracks from directly related/similar movies in the same language.
 * 
 * Priority 3 (The Algorithmic Fallback):
 * The remaining general recommendations from the API, mathematically sorted by overall play count and popularity.
 */
function rankCandidateTracks(candidates, seed) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const seedAlbumId = seed.album_id ? String(seed.album_id).trim() : "";
  const seedArtistClean = cleanStr(seed.primary_artist || seed.artist || "");
  const seedLangClean = (seed.language || "").trim().toLowerCase();
  const seedYearNum = parseInt(seed.year || "0", 10) || 0;

  const isArtistMatch = (candidateArtist) => {
    if (!candidateArtist || !seedArtistClean) return false;
    const cClean = cleanStr(candidateArtist);
    if (!cClean) return false;
    return cClean === seedArtistClean || cClean.includes(seedArtistClean) || seedArtistClean.includes(cClean);
  };

  const isLanguageMatch = (candidateLang) => {
    if (!candidateLang || !seedLangClean) return false;
    return candidateLang.trim().toLowerCase() === seedLangClean;
  };

  const isEraMatch = (candidateYear) => {
    const cYear = parseInt(candidateYear || "0", 10) || 0;
    if (!cYear || !seedYearNum) return true; // If missing year data, give benefit of the doubt
    return Math.abs(cYear - seedYearNum) <= 5;
  };

  const scored = candidates.map((track) => {
    const candidateAlbumId = track.album_id ? String(track.album_id).trim() : "";
    const isSameAlbum = Boolean(seedAlbumId && candidateAlbumId && seedAlbumId === candidateAlbumId);
    const sameArtist = isArtistMatch(track.primary_artist) || isArtistMatch(track.artist);
    const sameLanguage = isLanguageMatch(track.language);
    const sameEra = isEraMatch(track.year);

    let tier = 3;
    let tierReason = "Algorithmic General Recommendation";

    // Priority 1 (The Perfect Match):
    // Tracks that belong to the exact same album_id (same movie)
    // OR feature the exact same primary_artist AND match the same language and sonic type/era.
    if (isSameAlbum) {
      tier = 1;
      tierReason = "Priority 1 (The Perfect Match): Same Movie Album";
    } else if (sameArtist && sameLanguage && sameEra) {
      tier = 1;
      tierReason = "Priority 1 (The Perfect Match): Same Artist, Language & Era";
    }
    // Priority 2 (The Artist & Universe Match):
    // Tracks from the same primary_artist (different movie)
    // OR tracks from directly related/similar movies in the same language.
    else if (sameArtist) {
      tier = 2;
      tierReason = "Priority 2 (The Artist & Universe Match): Same Primary Artist";
    } else if (sameLanguage) {
      tier = 2;
      tierReason = "Priority 2 (The Artist & Universe Match): Related Universe & Same Language";
    }
    // Priority 3 (The Algorithmic Fallback):
    // Remaining general recommendations
    else {
      tier = 3;
      tierReason = "Priority 3 (The Algorithmic Fallback): Popularity Ranked";
    }

    return {
      ...track,
      tier,
      tierReason,
      isSameAlbum,
      sameArtist,
      sameLanguage,
      sameEra,
    };
  });

  // Strict sorting function
  scored.sort((a, b) => {
    // 1. Primary: Priority Tier (Tier 1 < Tier 2 < Tier 3)
    if (a.tier !== b.tier) {
      return a.tier - b.tier;
    }

    // 2. Intra-Tier Sub-Ranking:
    if (a.tier === 1) {
      // Within Priority 1: Exact album companions first (same movie soundtrack continuity)
      if (a.isSameAlbum && !b.isSameAlbum) return -1;
      if (!a.isSameAlbum && b.isSameAlbum) return 1;
      // Secondary: Mathematical Play Count (highest first)
      if ((b.play_count || 0) !== (a.play_count || 0)) {
        return (b.play_count || 0) - (a.play_count || 0);
      }
    } else if (a.tier === 2) {
      // Within Priority 2: Same primary artist first, then same language universe
      if (a.sameArtist && !b.sameArtist) return -1;
      if (!a.sameArtist && b.sameArtist) return 1;
      // Secondary: Mathematical Play Count (highest first)
      if ((b.play_count || 0) !== (a.play_count || 0)) {
        return (b.play_count || 0) - (a.play_count || 0);
      }
    } else {
      // Priority 3: Mathematically sorted by overall play count and popularity
      if ((b.play_count || 0) !== (a.play_count || 0)) {
        return (b.play_count || 0) - (a.play_count || 0);
      }
    }

    // Tie-breaker: Recency (newest release year first)
    const yearA = parseInt(a.year || "0", 10) || 0;
    const yearB = parseInt(b.year || "0", 10) || 0;
    if (yearB !== yearA) {
      return yearB - yearA;
    }

    return 0;
  });

  return scored;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const songId = searchParams.get("songId") || searchParams.get("id") || searchParams.get("targetId") || "";
  let artist = searchParams.get("primary_artist") || searchParams.get("primaryArtist") || searchParams.get("artist") || "";
  let title = searchParams.get("title") || "";
  let album_id = searchParams.get("album_id") || searchParams.get("albumId") || "";
  let language = searchParams.get("language") || "";
  let year = searchParams.get("year") || "";

  if (!songId && !artist && !title) {
    return NextResponse.json(
      { success: false, error: "Missing songId, targetId, id, artist, or title parameter" },
      { status: 400 }
    );
  }

  // Handle mock nocturne tracks
  if (songId && songId.startsWith("track-")) {
    const foundNocturne = NOCTURNE_TRACKS.find((t) => t.id === songId);
    if (foundNocturne) {
      if (!artist) artist = foundNocturne.artist;
      if (!title) title = foundNocturne.title;
      if (!language) language = "ambient";
      if (!year) year = foundNocturne.year || "2024";
    }

    const curatedFallback = NOCTURNE_TRACKS
      .filter((t) => t.id !== songId)
      .map((t, idx) => ({
        ...t,
        primary_artist: t.artist,
        primaryArtist: t.artist,
        album_id: `album-${t.id}`,
        language: "ambient",
        tier: idx < 2 ? 1 : idx < 5 ? 2 : 3,
        tierReason: idx < 2 ? "Priority 1: Curated Nocturne Companion" : idx < 5 ? "Priority 2: Ambient Universe" : "Priority 3: Curated Library",
        play_count: 500000 - idx * 25000,
        playCount: 500000 - idx * 25000,
      }));

    return NextResponse.json({
      success: true,
      source: "curated_ambient_reco",
      seedTrack: { id: songId, title, artist, primary_artist: artist, album_id, language, year },
      tracks: curatedFallback.slice(0, 15),
    });
  }

  const cacheKey = `reco:::${songId}:::${album_id}:::${artist}:::${language}`;
  if (recoCache.has(cacheKey)) {
    return NextResponse.json(recoCache.get(cacheKey));
  }

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
  };

  // Seed Metadata Enrichment: If album_id, primary_artist, language, or year are missing, fetch song.getDetails
  let seedDetails = {
    id: songId,
    title: title || "",
    artist: artist || "",
    primary_artist: artist || "",
    album: "",
    album_id: album_id || "",
    language: language || "",
    year: year || "",
  };

  if (songId && (!album_id || !artist || !language || !year)) {
    try {
      const detailsUrl = `https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${encodeURIComponent(
        songId
      )}&_format=json`;
      const detRes = await fetch(detailsUrl, { headers, next: { revalidate: 3600 } });
      if (detRes.ok) {
        const detData = await detRes.json();
        const songObj = detData[songId] || Object.values(detData)[0];
        if (songObj) {
          if (!seedDetails.title) seedDetails.title = cleanHtmlText(songObj.song || songObj.title || "");
          if (!seedDetails.album) seedDetails.album = cleanHtmlText(songObj.more_info?.album || songObj.album || "");
          if (!seedDetails.album_id) seedDetails.album_id = String(songObj.more_info?.album_id || songObj.albumid || "");
          if (!seedDetails.language) seedDetails.language = cleanHtmlText(songObj.language || songObj.more_info?.language || "");
          if (!seedDetails.year) {
            const yr = parseInt(songObj.year || songObj.more_info?.year || songObj.more_info?.release_date?.slice(0, 4) || "0", 10);
            if (yr > 1900) seedDetails.year = yr;
          }
          if (!seedDetails.primary_artist) {
            const pa = songObj.more_info?.artistMap?.primary_artists?.[0]?.name ||
              (Array.isArray(songObj.primary_artists) ? songObj.primary_artists[0]?.name : songObj.primary_artists) ||
              songObj.singers || "";
            seedDetails.primary_artist = cleanHtmlText(pa);
            if (!seedDetails.artist) seedDetails.artist = seedDetails.primary_artist;
          }
        }
      }
    } catch (err) {
      console.warn("[Recommendations] Seed enrichment via song.getDetails failed:", err);
    }
  }

  const rawCandidateMap = new Map();

  // -------------------------------------------------------------
  // Fetch Candidate Pool: Target 30 related candidate tracks
  // -------------------------------------------------------------
  if (songId) {
    // 1. Channel / Entity Station: Pulls up to 30 radio station songs
    try {
      const stationUrl = `https://www.jiosaavn.com/api.php?__call=webradio.createEntityStation&_format=json&api_version=4&_marker=0&ctx=android&entity_id=[%22${encodeURIComponent(
        songId
      )}%22]&entity_type=queue`;

      const stationRes = await fetch(stationUrl, { headers, next: { revalidate: 1800 } });
      if (stationRes.ok) {
        const stationData = await stationRes.json();
        if (stationData?.stationid) {
          const songUrl = `https://www.jiosaavn.com/api.php?__call=webradio.getSong&_format=json&api_version=4&_marker=0&ctx=android&stationid=${encodeURIComponent(
            stationData.stationid
          )}&k=30&next=1`;

          const radioRes = await fetch(songUrl, { headers, next: { revalidate: 1800 } });
          if (radioRes.ok) {
            const radioData = await radioRes.json();
            const numericKeys = Object.keys(radioData).filter((k) => !isNaN(parseInt(k, 10)));
            for (const key of numericKeys) {
              const rawItem = radioData[key]?.song || radioData[key];
              if (rawItem && rawItem.id && String(rawItem.id) !== String(songId)) {
                const formatted = formatSongItem(rawItem);
                if (formatted && formatted.title && !rawCandidateMap.has(String(formatted.id))) {
                  rawCandidateMap.set(String(formatted.id), formatted);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("[Recommendations] webradio station fetch failed:", err);
    }

    // 2. reco.getreco endpoint: Pulls complementary recommendations (10-20 songs)
    try {
      const recoUrl = `https://www.jiosaavn.com/api.php?__call=reco.getreco&_format=json&api_version=4&_marker=0&ctx=android&pid=${encodeURIComponent(
        songId
      )}`;

      const recoRes = await fetch(recoUrl, { headers, next: { revalidate: 1800 } });
      if (recoRes.ok) {
        const recoData = await recoRes.json();
        const rawList = Array.isArray(recoData)
          ? recoData
          : recoData[songId] || Object.values(recoData)[0] || [];

        if (Array.isArray(rawList)) {
          for (const item of rawList) {
            if (item && item.id && String(item.id) !== String(songId)) {
              const formatted = formatSongItem(item);
              if (formatted && formatted.title && !rawCandidateMap.has(String(formatted.id))) {
                rawCandidateMap.set(String(formatted.id), formatted);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("[Recommendations] reco.getreco failed:", err);
    }
  }

  // 3. Fallback: If candidate pool has fewer than 20 tracks, supplement with search results
  if (rawCandidateMap.size < 20 && (seedDetails.primary_artist || seedDetails.title)) {
    try {
      const q = seedDetails.primary_artist
        ? `${seedDetails.primary_artist} ${seedDetails.language || ""} songs`.trim()
        : `${seedDetails.title} similar`;
      const searchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&p=1&n=25&q=${encodeURIComponent(
        q
      )}`;

      const sRes = await fetch(searchUrl, { headers, next: { revalidate: 1800 } });
      if (sRes.ok) {
        const sData = await sRes.json();
        const results = sData.results || [];
        for (const item of results) {
          if (item && item.id && String(item.id) !== String(songId)) {
            const formatted = formatSongItem(item);
            if (formatted && formatted.title && !rawCandidateMap.has(String(formatted.id))) {
              rawCandidateMap.set(String(formatted.id), formatted);
            }
          }
          if (rawCandidateMap.size >= 30) break;
        }
      }
    } catch (err) {
      console.warn("[Recommendations] Supplementary search failed:", err);
    }
  }

  const rawCandidateList = Array.from(rawCandidateMap.values()).slice(0, 30);

  // If we have candidates, apply the strict tiered sorting algorithm
  if (rawCandidateList.length > 0) {
    const sortedTracks = rankCandidateTracks(rawCandidateList, seedDetails);
    const responseData = {
      success: true,
      source: "jiosaavn_tiered_reco",
      seedTrack: seedDetails,
      candidatePoolCount: rawCandidateList.length,
      tracks: sortedTracks,
    };

    recoCache.set(cacheKey, responseData);
    return NextResponse.json(responseData, {
      headers: { "Cache-Control": "public, max-age=1800, s-maxage=3600" },
    });
  }

  // Final fallback to Nocturne ambient tracks if all external APIs returned empty
  const fallbackTracks = NOCTURNE_TRACKS
    .filter((t) => t.id !== songId)
    .map((t, idx) => ({
      ...t,
      primary_artist: t.artist,
      primaryArtist: t.artist,
      album_id: `album-${t.id}`,
      language: "ambient",
      tier: 3,
      tierReason: "Priority 3: Ambient Curated Fallback",
      play_count: 300000 - idx * 10000,
      playCount: 300000 - idx * 10000,
    }));

  const responseData = {
    success: true,
    source: "curated_fallback",
    seedTrack: seedDetails,
    candidatePoolCount: fallbackTracks.length,
    tracks: fallbackTracks.slice(0, 15),
  };

  recoCache.set(cacheKey, responseData);
  return NextResponse.json(responseData);
}
