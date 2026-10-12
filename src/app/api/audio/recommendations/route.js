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
import { generateRecommendedQueue, classifySongMood, extractLanguage } from "../../../../utils/recommendationEngine";
import { classifySongDetailed } from "../../../../utils/songClassifier";

// In-memory cache for recommendation queries
const recoCache = new Map();

// Verified official JioSaavn regional top charts (India Superhits Top 50, Most Searched & Most Streamed Love Songs)
const REGIONAL_CHART_PLAYLISTS = {
  malayalam: { superhits: "1134705865", searched: "951898142", love: "1139764479" },
  telugu: { superhits: "1134643225", searched: "951897805", love: "158225216" },
  tamil: { superhits: "1134651042", searched: "1026391929", love: "1139646951" },
  hindi: { superhits: "1134543272", searched: "946682072", love: "1139074020" },
  punjabi: { superhits: "1134543511", searched: "946945296", love: "1139373783" },
  kannada: { superhits: "1134591169", searched: "948035636", love: "1139761568" },
  bengali: { superhits: "1134638573", searched: "1064016932", love: "1139680923" },
  marathi: { superhits: "1134710071", searched: "951898019", love: "1139764114" },
  bhojpuri: { superhits: "1134768973", searched: "945435329", love: "1139868403" },
  gujarati: { superhits: "1134743773" },
  english: { superhits: "1134595537", searched: "945969391", love: "87510850" },
};

const chartPlaylistCache = new Map();

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
    chartRank: song.chartRank || null,
    isTrending: Boolean(song.isTrending),
    source: song.source || "catalog_stream",
  };
}

export async function GET(request) {
  try {
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
    const recentQueueIdsParam = searchParams.get("recentQueueTrackIds") || searchParams.get("recentQueueIds") || "";

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

    if (cleanSongId && (!album_id || !artist || !seedDetails.language || seedDetails.language === "english" || !year)) {
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
            const officialLang = cleanHtmlText(songObj.language || songObj.more_info?.language || "");
            if (officialLang) {
              seedDetails.language = officialLang.toLowerCase();
            }
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

    // 1. Check dictionary-based language detection from title/artist/album/movie keywords
    if (!seedDetails.language || seedDetails.language === "english") {
      const dictLang = extractLanguage(seedDetails);
      if (dictLang && dictLang !== "english") {
        seedDetails.language = dictLang;
      }
    }

    // 2. If still unverified and title exists, search JioSaavn autocomplete to extract official language
    if (!seedDetails.language && seedDetails.title) {
      try {
        const searchAutoUrl = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&query=${encodeURIComponent(
          seedDetails.title + (seedDetails.artist ? " " + seedDetails.artist : "")
        )}&_format=json`;
        const sRes = await fetch(searchAutoUrl, { headers, next: { revalidate: 3600 } });
        if (sRes.ok) {
          const sData = await sRes.json();
          const topSong = sData.songs?.data?.[0];
          if (topSong) {
            const autoLang = cleanHtmlText(topSong.more_info?.language || topSong.language || "");
            if (autoLang) {
              seedDetails.language = autoLang.toLowerCase();
            }
          }
        }
      } catch (_) { }
    }

    // Detect and classify comprehensive multi-label profile for the anchor song
    const seedProfile = classifySongDetailed(seedDetails);
    const seedLang = (seedProfile.language || seedDetails.language || extractLanguage(seedDetails) || "malayalam").toLowerCase().trim();
    seedDetails.language = seedLang;
    seedDetails.mood = seedProfile.primaryMood;

    // Cache key incorporates song ID, language, mood profile, and recent queue IDs for fresh variety
    const cacheKey = `reco_v12:::${cleanSongId || songId}:::${seedLang}:::${seedProfile.primaryMood}:::${seedProfile.energyLevel}:::${excludeIdsParam}:::${recentQueueIdsParam}`;
    if (recoCache.has(cacheKey)) {
      return NextResponse.json(recoCache.get(cacheKey));
    }

    const rawCandidateMap = new Map();

    // Helper to add candidate track with strict language and content-type validation
    const addCandidate = (item, extraMeta = {}) => {
      if (!item || !item.id) return;
      const sId = String(item.id);
      if (sId === String(songId) || sId === cleanSongId || excludeIdSet.has(sId)) return;
      if (rawCandidateMap.has(sId)) return;

      const formatted = formatSongItem({
        ...item,
        ...extraMeta,
      });
      if (formatted && formatted.title) {
        // Discard obscure tracks with fewer than 25,000 streams when play_count is known (unless from official chart)
        if (!formatted.chartRank && formatted.play_count > 0 && formatted.play_count < 25000) return;

        // Discard unverified tracks with 0 plays from open search if pool already has sufficient verified tracks
        if (!formatted.chartRank && !formatted.badge && formatted.source !== "curated" && formatted.play_count === 0 && rawCandidateMap.size >= 30) return;

        // Strict Language Filter: Never allow cross-language tracks into candidate pool
        const candProfile = classifySongDetailed(formatted);
        const candLang = candProfile.language || extractLanguage(formatted) || (formatted.language || "").toLowerCase().trim();
        if (seedLang && candLang && candLang !== seedLang) {
          return; // Strictly reject cross-language songs
        }

        // Strict Content-Type Filter: Vocal songs must follow vocal songs; BGM follows BGM
        if (seedProfile.isBgm !== candProfile.isBgm) {
          return; // Strictly reject cross-type songs
        }

        if (!formatted.language && seedLang) {
          formatted.language = seedLang;
        }
        rawCandidateMap.set(sId, formatted);
      }
    };

    // -------------------------------------------------------------
    // 1. Fetch Official Regional Top Charts for seedLang (Stage A)
    // -------------------------------------------------------------
    const chartIdsToFetch = [];
    if (REGIONAL_CHART_PLAYLISTS[seedLang]) {
      if (REGIONAL_CHART_PLAYLISTS[seedLang].superhits) {
        chartIdsToFetch.push(REGIONAL_CHART_PLAYLISTS[seedLang].superhits);
      }
      if (seedProfile.primaryMood === "love_romance" && REGIONAL_CHART_PLAYLISTS[seedLang].love) {
        chartIdsToFetch.push(REGIONAL_CHART_PLAYLISTS[seedLang].love);
      }
    }

    const chartPromises = chartIdsToFetch.map(async (cId) => {
      const cached = chartPlaylistCache.get(cId);
      if (cached && Date.now() - cached.timestamp < 3600000) {
        return cached.songs;
      }
      try {
        const cUrl = `https://www.jiosaavn.com/api.php?__call=playlist.getDetails&_format=json&listid=${encodeURIComponent(cId)}`;
        const res = await fetch(cUrl, { headers, next: { revalidate: 3600 } });
        if (res.ok) {
          const data = await res.json();
          const songs = data?.songs || [];
          chartPlaylistCache.set(cId, { songs, timestamp: Date.now() });
          return songs;
        }
      } catch (err) {
        console.warn(`[Recommendations] Chart fetch failed for listid ${cId}:`, err);
      }
      return [];
    });

    const [chartResults, recoRes, stationRes] = await Promise.allSettled([
      Promise.all(chartPromises),
      cleanSongId
        ? fetch(
          `https://www.jiosaavn.com/api.php?__call=reco.getreco&_format=json&api_version=4&_marker=0&ctx=android&pid=${encodeURIComponent(
            cleanSongId
          )}`,
          { headers, next: { revalidate: 1800 } }
        )
        : Promise.resolve(null),
      cleanSongId
        ? fetch(
          `https://www.jiosaavn.com/api.php?__call=webradio.createEntityStation&_format=json&api_version=4&_marker=0&ctx=android&entity_id=[%22${encodeURIComponent(
            cleanSongId
          )}%22]&entity_type=queue`,
          { headers, next: { revalidate: 1800 } }
        )
        : Promise.resolve(null),
    ]);

    // Ingest official regional top chart songs
    if (chartResults.status === "fulfilled" && Array.isArray(chartResults.value)) {
      for (const songList of chartResults.value) {
        if (Array.isArray(songList)) {
          songList.forEach((item, idx) => {
            addCandidate(item, { chartRank: idx + 1, isTrending: true, source: "regional_chart" });
          });
        }
      }
    }

    // Ingest algorithmic recommendations (reco.getreco)
    if (recoRes.status === "fulfilled" && recoRes.value?.ok) {
      try {
        const recoData = await recoRes.value.json();
        const rawList = Array.isArray(recoData)
          ? recoData
          : recoData[cleanSongId] || recoData[songId] || Object.values(recoData)[0] || [];
        if (Array.isArray(rawList)) {
          for (const item of rawList) addCandidate(item, { source: "reco" });
        }
      } catch (_) { }
    }

    // Ingest WebRadio entity station songs
    if (stationRes.status === "fulfilled" && stationRes.value?.ok) {
      try {
        const stationData = await stationRes.value.json();
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
              addCandidate(rawItem, { source: "webradio" });
            }
          }
        }
      } catch (_) { }
    }

    // -------------------------------------------------------------
    // 2. Targeted Anchor-Specific Contextual Queries
    // (Tailored to anchor song's specific primary artist, mood & energy level)
    // -------------------------------------------------------------
    const queries = [];
    const primaryArt = seedDetails.primary_artist || seedDetails.artist || "";

    if (seedLang) {
      // Primary artist queries
      if (primaryArt && primaryArt.length > 2 && !/various|unknown/i.test(primaryArt)) {
        queries.push(`${primaryArt} ${seedLang} hits`);
      }

      // Contextual queries tailored to anchor track's primary mood & type
      if (seedProfile.isBgm) {
        queries.push(`${seedLang} mass bgm original score`);
        queries.push(`${seedLang} top cinematic themes`);
        queries.push(`${seedLang} hit original score`);
      } else if (seedProfile.primaryMood === "energetic_hype") {
        queries.push(`${seedLang} mass hit songs`);
        queries.push(`${seedLang} top mass songs`);
        queries.push(`${seedLang} fast beat chartbusters`);
        queries.push(`${seedLang} trending dance hits`);
      } else if (seedProfile.primaryMood === "love_romance") {
        queries.push(`${seedLang} romantic melody hits`);
        queries.push(`${seedLang} love duet songs`);
        queries.push(`${seedLang} top romantic songs`);
        queries.push(`${seedLang} evergreen love melodies`);
      } else if (seedProfile.primaryMood === "sad_emotional") {
        queries.push(`${seedLang} top sad melody songs`);
        queries.push(`${seedLang} emotional melody hits`);
        queries.push(`${seedLang} soul touching songs`);
        queries.push(`${seedLang} heart touching sad songs`);
      } else if (seedProfile.primaryMood === "chill_peaceful") {
        queries.push(`${seedLang} chill acoustic melody`);
        queries.push(`${seedLang} relaxing songs`);
        queries.push(`${seedLang} lofi chill hits`);
      } else {
        queries.push(`${seedLang} top trending songs`);
        queries.push(`${seedLang} chartbuster songs`);
        queries.push(`${seedLang} superhit songs`);
      }

      if (queries.length < 4) {
        queries.push(`${seedLang} hit songs`);
      }
      if (queries.length < 4) {
        queries.push(`${seedLang} popular chartbusters`);
      }
    }

    // Execute queries in parallel with Promise.allSettled for high responsiveness
    const searchPromises = queries.slice(0, 4).map((q) => {
      const searchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&p=1&n=18&q=${encodeURIComponent(
        q
      )}`;
      return fetch(searchUrl, { headers, next: { revalidate: 1800 } })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);
    });

    const searchResults = await Promise.allSettled(searchPromises);
    for (const r of searchResults) {
      if (r.status === "fulfilled" && r.value?.results) {
        for (const item of r.value.results) {
          addCandidate(item);
          if (rawCandidateMap.size >= 80) break;
        }
      }
    }

    // -------------------------------------------------------------
    // 3. Merge Compatible Curated Catalog Candidates
    // (Strictly filtered by matching language AND mood/energy compatibility)
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

    // Filter curated catalog candidates by compatible mood and energy level
    const compatibleCurated = langCurated.filter((track) => {
      const candProfile = classifySongDetailed(track);
      if (seedProfile.isBgm !== candProfile.isBgm) return false;
      if (seedProfile.primaryMood === candProfile.primaryMood) return true;
      if (seedProfile.moodCategories.some((m) => candProfile.moodCategories.includes(m))) return true;
      if (Math.abs(seedProfile.energyLevel - candProfile.energyLevel) <= 1) return true;
      return false;
    });

    const shuffledCurated = [...compatibleCurated].sort(() => Math.random() - 0.5);
    for (const track of shuffledCurated) {
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

    // Controlled constraint relaxation: if candidate pool is still under 40, include more from langCurated
    if (rawCandidateMap.size < 40 && langCurated.length > 0) {
      const relaxedCurated = langCurated.filter((track) => {
        const candProfile = classifySongDetailed(track);
        return seedProfile.isBgm === candProfile.isBgm;
      });
      for (const track of relaxedCurated) {
        if (track && track.id && String(track.id) !== String(songId) && String(track.id) !== cleanSongId && !excludeIdSet.has(String(track.id))) {
          const tid = String(track.id);
          if (!rawCandidateMap.has(tid)) {
            rawCandidateMap.set(tid, {
              ...track,
              primary_artist: track.artist || track.primaryArtist,
              primaryArtist: track.artist || track.primaryArtist,
            });
            if (rawCandidateMap.size >= 45) break;
          }
        }
      }
    }

    const candidatePool = Array.from(rawCandidateMap.values());

    // Apply transparent 100-Point Queue Algorithm & Sequencing Layer
    const recentQueueSet = new Set(
      recentQueueIdsParam
        ? recentQueueIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
        : []
    );

    const rankedQueue = generateRecommendedQueue(seedDetails, candidatePool, {
      excludeIds: excludeIdSet,
      recentQueueTrackIds: recentQueueSet,
      maxResults: 20,
    });

    const responseData = {
      success: true,
      source: "ceepify_intelligent_queue",
      seedTrack: seedDetails,
      seedProfile,
      candidatePoolCount: candidatePool.length,
      tracks: rankedQueue,
    };

    recoCache.set(cacheKey, responseData);
    return NextResponse.json(responseData, {
      headers: { "Cache-Control": "public, max-age=1800, s-maxage=3600" },
    });
  } catch (err) {
    console.error("[Recommendations] GET handler error:", err);
    // Graceful fallback response: return matching regional catalog instead of 500
    const fallbackList = MALAYALAM_HITS.slice(0, 20);
    return NextResponse.json({
      success: true,
      source: "fallback_curated",
      seedTrack: { id: "fallback" },
      candidatePoolCount: fallbackList.length,
      tracks: fallbackList,
    });
  }
}
