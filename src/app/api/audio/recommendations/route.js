import { NextResponse } from "next/server";
import CryptoJS from "crypto-js";
import {
  MALAYALAM_HITS,
  TAMIL_HITS,
  HINDI_BESTS_TRACKS,
  ENGLISH_VIBES_TRACKS,
  BEAST_PHONKS_TRACKS,
  MADE_FOR_YOU_TRACKS,
  CHILL_RELAX_TRACKS,
} from "../../../../data/curatedDiscovery";
import { generateRecommendedQueue, classifySongMood } from "../../../../utils/recommendationEngine";

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
  if (
    moreInfo.artistMap?.primary_artists &&
    Array.isArray(moreInfo.artistMap.primary_artists) &&
    moreInfo.artistMap.primary_artists.length > 0
  ) {
    leadPrimaryArtist = moreInfo.artistMap.primary_artists[0].name;
  } else if (song.primary_artists) {
    leadPrimaryArtist = Array.isArray(song.primary_artists)
      ? song.primary_artists[0]?.name || song.primary_artists[0]
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
    singers: cleanHtmlText(song.singers || moreInfo.singers || ""),
    music: cleanHtmlText(moreInfo.music || song.music || ""),
    album: cleanHtmlText(moreInfo.album || song.album || ""),
    album_id: albumId ? String(albumId) : "",
    albumId: albumId ? String(albumId) : "",
    language: cleanHtmlText(song.language || moreInfo.language || ""),
    genre: cleanHtmlText(song.genre || moreInfo.genre || ""),
    mood: cleanHtmlText(song.mood || moreInfo.mood || ""),
    year: parsedYear && parsedYear > 1900 ? parsedYear : rawYear,
    coverUrl: cover,
    audioUrl: audioUrl || null,
    duration: durationSec,
    durationFormatted: formatDuration(durationSec),
    play_count: playCount,
    playCount: playCount,
    playCountFormatted: formatPlayCount(playCount),
    source: "catalog_stream",
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const songId = searchParams.get("songId") || searchParams.get("id") || searchParams.get("targetId") || "";
  let artist = searchParams.get("primary_artist") || searchParams.get("primaryArtist") || searchParams.get("artist") || "";
  let title = searchParams.get("title") || "";
  let album_id = searchParams.get("album_id") || searchParams.get("albumId") || "";
  let album = searchParams.get("album") || "";
  let genre = searchParams.get("genre") || "";
  let mood = searchParams.get("mood") || "";
  let language = searchParams.get("language") || "";
  let year = searchParams.get("year") || "";
  let movieName = searchParams.get("movieName") || searchParams.get("movie") || "";
  const excludeIdsParam = searchParams.get("excludeIds") || "";

  // Extract movie name from title if present, e.g. "Song (From "Movie")"
  if (!movieName && title) {
    const m =
      title.match(/\(\s*from\s+["']?([^"')\]]+)["']?\s*\)/i) ||
      title.match(/\[\s*from\s+["']?([^"'\]]+)["']?\s*\]/i) ||
      title.match(/-\s*from\s+["']?([^"'-]+)["']?/i);
    if (m && m[1]) {
      movieName = m[1].trim();
    }
  }

  const excludeIdSet = new Set(
    excludeIdsParam
      ? excludeIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : []
  );
  if (songId) excludeIdSet.add(String(songId));

  const cleanSongId = String(songId || "").replace(/^track-/, "").trim();

  if (!cleanSongId && !artist && !title) {
    return NextResponse.json(
      { success: false, error: "Missing songId, id, artist, or title parameter" },
      { status: 400 }
    );
  }

  const cacheKey = `reco_v8_iq:::${cleanSongId || songId}:::${title}:::${album_id}:::${artist}:::${language}:::${mood}:::${movieName}:::${excludeIdsParam}`;
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
    cleanId: cleanSongId,
    title: title || "",
    artist: artist || "",
    primary_artist: artist || "",
    album: album || "",
    album_id: album_id || "",
    movieName: movieName || "",
    genre: genre || "",
    mood: mood || "",
    language: language || "",
    year: year || "",
  };

  if (cleanSongId && (!album_id || !artist || !language || !year)) {
    try {
      const detailsUrl = `https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${encodeURIComponent(
        cleanSongId
      )}&_format=json`;
      const detRes = await fetch(detailsUrl, { headers, next: { revalidate: 3600 } });
      if (detRes.ok) {
        const detData = await detRes.json();
        const songObj = detData[cleanSongId] || detData[songId] || (typeof detData === "object" && detData ? Object.values(detData)[0] : null);
        if (songObj && typeof songObj === "object") {
          if (!seedDetails.title) seedDetails.title = cleanHtmlText(songObj.song || songObj.title || "");
          if (!seedDetails.album) seedDetails.album = cleanHtmlText(songObj.more_info?.album || songObj.album || "");
          if (!seedDetails.album_id) seedDetails.album_id = String(songObj.more_info?.album_id || songObj.albumid || "");
          if (!seedDetails.language) seedDetails.language = cleanHtmlText(songObj.language || songObj.more_info?.language || "");
          if (!seedDetails.genre && (songObj.genre || songObj.more_info?.genre)) {
            seedDetails.genre = cleanHtmlText(songObj.genre || songObj.more_info?.genre);
          }
          if (!seedDetails.mood && (songObj.mood || songObj.more_info?.mood)) {
            seedDetails.mood = cleanHtmlText(songObj.mood || songObj.more_info?.mood);
          }
          if (!seedDetails.year) {
            const yr = parseInt(
              songObj.year || songObj.more_info?.year || songObj.more_info?.release_date?.slice(0, 4) || "0",
              10
            );
            if (yr > 1900) seedDetails.year = yr;
          }
          if (!seedDetails.primary_artist) {
            const pa =
              songObj.more_info?.artistMap?.primary_artists?.[0]?.name ||
              (Array.isArray(songObj.primary_artists) ? songObj.primary_artists[0]?.name : songObj.primary_artists) ||
              songObj.singers ||
              "";
            seedDetails.primary_artist = cleanHtmlText(pa);
            if (!seedDetails.artist) seedDetails.artist = seedDetails.primary_artist;
          }
        }
      }
    } catch (err) {
      console.warn("[Recommendations] Seed enrichment via song.getDetails failed:", err);
    }
  }

  // Detect and normalize seed language & mood
  const seedMoodObj = classifySongMood(seedDetails);
  const detectedMood = seedMoodObj.primary;
  let seedLang = (seedDetails.language || "").toLowerCase().trim();
  if (!seedLang) {
    const fallbackText = `${seedDetails.title} ${seedDetails.artist} ${seedDetails.album}`.toLowerCase();
    if (MALAYALAM_HITS.some((t) => t.title?.toLowerCase() === seedDetails.title?.toLowerCase()) || /malayalam/i.test(fallbackText)) {
      seedLang = "malayalam";
    } else if (TAMIL_HITS.some((t) => t.title?.toLowerCase() === seedDetails.title?.toLowerCase()) || /tamil/i.test(fallbackText)) {
      seedLang = "tamil";
    } else if (HINDI_BESTS_TRACKS.some((t) => t.title?.toLowerCase() === seedDetails.title?.toLowerCase()) || /hindi/i.test(fallbackText)) {
      seedLang = "hindi";
    } else {
      seedLang = "malayalam"; // default baseline for regional Indian hits catalog
    }
    seedDetails.language = seedLang;
  }

  const rawCandidateMap = new Map();

  // Helper to add candidate track with deduplication
  const addCandidate = (item) => {
    if (!item || !item.id) return;
    const sId = String(item.id);
    if (sId === String(songId) || sId === cleanSongId || excludeIdSet.has(sId)) return;
    if (rawCandidateMap.has(sId)) return;

    const formatted = formatSongItem(item);
    if (formatted && formatted.title) {
      // Discard obscure tracks with fewer than 1,000 streams when play_count is known
      if (formatted.play_count > 0 && formatted.play_count < 1000) return;

      // Validate language: strictly match seed language
      const candLang = (formatted.language || "").toLowerCase().trim();
      if (!candLang && seedLang) {
        formatted.language = seedLang; // Inherit seed language for contextual query hits
      }
      rawCandidateMap.set(sId, formatted);
    }
  };

  // -------------------------------------------------------------
  // 1. WebRadio Station & Reco Endpoints (JioSaavn Radio Recommendations)
  // -------------------------------------------------------------
  if (cleanSongId) {
    try {
      const stationUrl = `https://www.jiosaavn.com/api.php?__call=webradio.createEntityStation&_format=json&api_version=4&_marker=0&ctx=android&entity_id=[%22${encodeURIComponent(
        cleanSongId
      )}%22]&entity_type=queue`;

      const stationRes = await fetch(stationUrl, { headers, next: { revalidate: 1800 } });
      if (stationRes.ok) {
        const stationData = await stationRes.json();
        if (stationData?.stationid) {
          const songUrl = `https://www.jiosaavn.com/api.php?__call=webradio.getSong&_format=json&api_version=4&_marker=0&ctx=android&stationid=${encodeURIComponent(
            stationData.stationid
          )}&k=25&next=1`;

          const radioRes = await fetch(songUrl, { headers, next: { revalidate: 1800 } });
          if (radioRes.ok) {
            const radioData = await radioRes.json();
            const numericKeys = Object.keys(radioData).filter((k) => !isNaN(parseInt(k, 10)));
            for (const key of numericKeys) {
              const rawItem = radioData[key]?.song || radioData[key];
              addCandidate(rawItem);
            }
          }
        }
      }
    } catch (err) {
      console.warn("[Recommendations] webradio station fetch failed:", err);
    }

    try {
      const recoUrl = `https://www.jiosaavn.com/api.php?__call=reco.getreco&_format=json&api_version=4&_marker=0&ctx=android&pid=${encodeURIComponent(
        cleanSongId
      )}`;

      const recoRes = await fetch(recoUrl, { headers, next: { revalidate: 1800 } });
      if (recoRes.ok) {
        const recoData = await recoRes.json();
        const rawList = Array.isArray(recoData)
          ? recoData
          : recoData[cleanSongId] || recoData[songId] || Object.values(recoData)[0] || [];

        if (Array.isArray(rawList)) {
          for (const item of rawList) {
            addCandidate(item);
          }
        }
      }
    } catch (err) {
      console.warn("[Recommendations] reco.getreco failed:", err);
    }
  }

  // -------------------------------------------------------------
  // 2. Targeted Language & Mood Queries (Guarantees Language, Mood & Trending Consistency)
  // -------------------------------------------------------------
  const queries = [];
  if (seedLang) {
    if (detectedMood === "bgm" || seedMoodObj.isBgm) {
      queries.push(`${seedLang} theme`);
      queries.push(`${seedLang} original score`);
      queries.push(`${seedLang} bgm`);
      queries.push(`${seedLang} mass theme`);
    } else if (detectedMood === "sad") {
      queries.push(`${seedLang} sad songs`);
      queries.push(`${seedLang} sad hits`);
      queries.push(`${seedLang} emotional melody`);
      queries.push(`${seedLang} heartbreak songs`);
    } else if (detectedMood === "feeling" || detectedMood === "romantic") {
      queries.push(`${seedLang} romantic hits`);
      queries.push(`${seedLang} love melodies`);
      queries.push(`${seedLang} feeling songs`);
      queries.push(`${seedLang} melody hits`);
    } else if (detectedMood === "energetic") {
      queries.push(`${seedLang} mass songs`);
      queries.push(`${seedLang} dance party hits`);
      queries.push(`${seedLang} mass hits`);
      queries.push(`${seedLang} trending fast beat songs`);
    } else if (detectedMood === "chill") {
      queries.push(`${seedLang} chill melody songs`);
      queries.push(`${seedLang} acoustic relaxing songs`);
      queries.push(`${seedLang} lofi chill`);
    } else {
      queries.push(`${seedLang} top hits`);
      queries.push(`${seedLang} trending songs`);
      queries.push(`${seedLang} popular songs`);
    }

    // Always append top trending hits query for current popular tracks
    queries.push(`${seedLang} top hits`);
  }

  for (const q of queries) {
    if (rawCandidateMap.size >= 65) break;
    try {
      const searchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&p=1&n=18&q=${encodeURIComponent(
        q
      )}`;

      const sRes = await fetch(searchUrl, { headers, next: { revalidate: 1800 } });
      if (sRes.ok) {
        const sData = await sRes.json();
        const results = sData.results || [];
        for (const item of results) {
          addCandidate(item);
          if (rawCandidateMap.size >= 65) break;
        }
      }
    } catch (err) {
      console.warn("[Recommendations] Targeted contextual search failed for query:", q, err);
    }
  }

  // -------------------------------------------------------------
  // 3. Occasional Artist & Movie companion tracks (LIMITED to at most 2 tracks)
  // "Same artist and same movie not consider, but you can place that in song perhaps"
  // -------------------------------------------------------------
  if (seedDetails.primary_artist || seedDetails.artist) {
    const artistToQuery = seedDetails.primary_artist || seedDetails.artist;
    try {
      const artistUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&p=1&n=4&q=${encodeURIComponent(
        artistToQuery
      )}`;
      const artRes = await fetch(artistUrl, { headers, next: { revalidate: 1800 } });
      if (artRes.ok) {
        const artData = await artRes.json();
        const artList = artData.results || [];
        let addedCount = 0;
        for (const s of artList) {
          if (s && s.id && !rawCandidateMap.has(String(s.id))) {
            addCandidate(s);
            addedCount++;
            if (addedCount >= 2) break; // max 2 tracks
          }
        }
      }
    } catch (err) {
      console.warn("[Recommendations] Artist tracks query failed:", err);
    }
  }

  // -------------------------------------------------------------
  // 4. Merge Curated Catalog Candidates (Strictly filtered by seed language)
  // -------------------------------------------------------------
  let langCurated = [];
  if (seedLang === "malayalam") {
    langCurated = MALAYALAM_HITS.map((t) => ({ ...t, language: "malayalam" }));
  } else if (seedLang === "tamil") {
    langCurated = TAMIL_HITS.map((t) => ({ ...t, language: "tamil" }));
  } else if (seedLang === "hindi") {
    langCurated = HINDI_BESTS_TRACKS.map((t) => ({ ...t, language: "hindi" }));
  } else if (seedLang === "english") {
    langCurated = ENGLISH_VIBES_TRACKS.map((t) => ({ ...t, language: "english" }));
  } else if (seedLang === "phonk") {
    langCurated = BEAST_PHONKS_TRACKS.map((t) => ({ ...t, language: "phonk" }));
  }

  for (const track of langCurated) {
    if (track && track.id && String(track.id) !== String(songId) && String(track.id) !== cleanSongId && !excludeIdSet.has(String(track.id))) {
      const tid = String(track.id);
      if (!rawCandidateMap.has(tid)) {
        rawCandidateMap.set(tid, {
          ...track,
          primary_artist: track.artist || track.primaryArtist,
          primaryArtist: track.artist || track.primaryArtist,
        });
      }
    }
  }

  const candidatePool = Array.from(rawCandidateMap.values());

  // Apply deterministic Queue Algorithm & Ranking
  const rankedQueue = generateRecommendedQueue(seedDetails, candidatePool, {
    excludeIds: excludeIdSet,
    maxResults: 20,
  });

  const responseData = {
    success: true,
    source: "ceepify_intelligent_queue",
    seedTrack: seedDetails,
    candidatePoolCount: candidatePool.length,
    tracks: rankedQueue,
  };

  recoCache.set(cacheKey, responseData);
  return NextResponse.json(responseData, {
    headers: { "Cache-Control": "public, max-age=1800, s-maxage=3600" },
  });
}
