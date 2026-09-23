import { NextResponse } from "next/server";
import CryptoJS from "crypto-js";
import { NOCTURNE_TRACKS } from "../../../../data/nocturneData";
import { CURATED_GENRES } from "../../../../data/genreData";
import { generateRecommendedQueue } from "../../../../utils/recommendationEngine";

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
  const excludeIdsParam = searchParams.get("excludeIds") || "";

  const excludeIdSet = new Set(
    excludeIdsParam
      ? excludeIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : []
  );
  if (songId) excludeIdSet.add(String(songId));

  if (!songId && !artist && !title) {
    return NextResponse.json(
      { success: false, error: "Missing songId, id, artist, or title parameter" },
      { status: 400 }
    );
  }

  // Handle mock Nocturne tracks
  if (songId && songId.startsWith("track-")) {
    const foundNocturne = NOCTURNE_TRACKS.find((t) => t.id === songId);
    const seed = foundNocturne || { id: songId, title, artist, album, genre: "Ambient" };
    const candidates = NOCTURNE_TRACKS.filter((t) => t.id !== songId && !excludeIdSet.has(String(t.id)));

    // Also include curated genres tracks
    for (const g of CURATED_GENRES) {
      if (Array.isArray(g.tracks)) {
        for (const tr of g.tracks) {
          if (tr.id !== songId && !excludeIdSet.has(String(tr.id))) {
            candidates.push(tr);
          }
        }
      }
    }

    const queue = generateRecommendedQueue(seed, candidates, { excludeIds: excludeIdSet });
    return NextResponse.json({
      success: true,
      source: "curated_nocturne_reco",
      seedTrack: seed,
      tracks: queue.slice(0, 15),
    });
  }

  const cacheKey = `reco_v2:::${songId}:::${album_id}:::${artist}:::${language}:::${excludeIdsParam}`;
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
    album: album || "",
    album_id: album_id || "",
    genre: genre || "",
    mood: mood || "",
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
          if (!seedDetails.genre && (songObj.genre || songObj.more_info?.genre)) {
            seedDetails.genre = cleanHtmlText(songObj.genre || songObj.more_info?.genre);
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

  const rawCandidateMap = new Map();

  // -------------------------------------------------------------
  // 1. Movie Soundtrack Extraction (Exact Album Companion Tracks)
  // -------------------------------------------------------------
  if (seedDetails.album_id) {
    try {
      const albumUrl = `https://www.jiosaavn.com/api.php?__call=content.getAlbumDetails&_format=json&albumid=${encodeURIComponent(
        seedDetails.album_id
      )}`;
      const albumRes = await fetch(albumUrl, { headers, next: { revalidate: 3600 } });
      if (albumRes.ok) {
        const albumData = await albumRes.json();
        const albumSongs = albumData.list || albumData.songs || [];
        if (Array.isArray(albumSongs)) {
          for (const s of albumSongs) {
            if (s && s.id && String(s.id) !== String(songId) && !excludeIdSet.has(String(s.id))) {
              const formatted = formatSongItem(s);
              if (formatted && formatted.title && !rawCandidateMap.has(String(formatted.id))) {
                formatted.isSameAlbum = true;
                rawCandidateMap.set(String(formatted.id), formatted);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("[Recommendations] Album companion tracks fetch failed:", err);
    }
  }

  // -------------------------------------------------------------
  // 2. Artist Track Catalog: Pull tracks by primary artist(s)
  // -------------------------------------------------------------
  if (seedDetails.primary_artist || seedDetails.artist) {
    const artistToQuery = seedDetails.primary_artist || seedDetails.artist;
    try {
      const artistUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&p=1&n=25&q=${encodeURIComponent(
        artistToQuery
      )}`;
      const artRes = await fetch(artistUrl, { headers, next: { revalidate: 1800 } });
      if (artRes.ok) {
        const artData = await artRes.json();
        const artList = artData.results || [];
        for (const s of artList) {
          if (s && s.id && String(s.id) !== String(songId) && !excludeIdSet.has(String(s.id))) {
            const formatted = formatSongItem(s);
            if (formatted && formatted.title && !rawCandidateMap.has(String(formatted.id))) {
              rawCandidateMap.set(String(formatted.id), formatted);
            }
          }
        }
      }
    } catch (err) {
      console.warn("[Recommendations] Artist tracks query failed:", err);
    }
  }

  // -------------------------------------------------------------
  // 3. WebRadio Station & Reco Endpoints
  // -------------------------------------------------------------
  if (songId) {
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
              if (
                rawItem &&
                rawItem.id &&
                String(rawItem.id) !== String(songId) &&
                !excludeIdSet.has(String(rawItem.id))
              ) {
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
            if (item && item.id && String(item.id) !== String(songId) && !excludeIdSet.has(String(item.id))) {
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

  // -------------------------------------------------------------
  // 4. Targeted Language, Album & Vibe Contextual Query
  // -------------------------------------------------------------
  if (rawCandidateMap.size < 30) {
    try {
      const queries = [];
      if (seedDetails.album) {
        queries.push(`${seedDetails.album} songs`.trim());
      }
      if (seedDetails.language && seedDetails.genre) {
        queries.push(`${seedDetails.language} ${seedDetails.genre} songs`.trim());
      } else if (seedDetails.language) {
        queries.push(`${seedDetails.language} hit songs`.trim());
      }

      for (const q of queries.slice(0, 2)) {
        if (rawCandidateMap.size >= 45) break;
        const searchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&p=1&n=20&q=${encodeURIComponent(
          q
        )}`;

        const sRes = await fetch(searchUrl, { headers, next: { revalidate: 1800 } });
        if (sRes.ok) {
          const sData = await sRes.json();
          const results = sData.results || [];
          for (const item of results) {
            if (item && item.id && String(item.id) !== String(songId) && !excludeIdSet.has(String(item.id))) {
              const formatted = formatSongItem(item);
              if (formatted && formatted.title && !rawCandidateMap.has(String(formatted.id))) {
                rawCandidateMap.set(String(formatted.id), formatted);
              }
            }
            if (rawCandidateMap.size >= 45) break;
          }
        }
      }
    } catch (err) {
      console.warn("[Recommendations] Targeted contextual search failed:", err);
    }
  }

  // -------------------------------------------------------------
  // 5. Merge Curated Nocturne & Genre Catalog Candidates
  // -------------------------------------------------------------
  for (const track of NOCTURNE_TRACKS) {
    if (track && track.id && String(track.id) !== String(songId) && !excludeIdSet.has(String(track.id))) {
      if (!rawCandidateMap.has(String(track.id))) {
        rawCandidateMap.set(String(track.id), {
          ...track,
          primary_artist: track.artist,
          primaryArtist: track.artist,
        });
      }
    }
  }

  for (const genre of CURATED_GENRES) {
    if (Array.isArray(genre.tracks)) {
      for (const track of genre.tracks) {
        if (track && track.id && String(track.id) !== String(songId) && !excludeIdSet.has(String(track.id))) {
          if (!rawCandidateMap.has(String(track.id))) {
            rawCandidateMap.set(String(track.id), {
              ...track,
              genre: genre.name,
              primary_artist: track.artist,
              primaryArtist: track.artist,
            });
          }
        }
      }
    }
  }

  const candidatePool = Array.from(rawCandidateMap.values());

  // Apply deterministic 6-Tier Recommendation Hierarchy
  const rankedQueue = generateRecommendedQueue(seedDetails, candidatePool, {
    excludeIds: excludeIdSet,
    maxResults: 25,
  });

  const responseData = {
    success: true,
    source: "spotify_6_tier_intelligent_reco",
    seedTrack: seedDetails,
    candidatePoolCount: candidatePool.length,
    tracks: rankedQueue,
  };

  recoCache.set(cacheKey, responseData);
  return NextResponse.json(responseData, {
    headers: { "Cache-Control": "public, max-age=1800, s-maxage=3600" },
  });
}
