import { NextResponse } from "next/server";
import {
  searchJioSaavnCatalog,
  decryptMediaUrl,
  cleanHtmlText,
  JIOSAAVN_HEADERS,
} from "../../../../services/jiosaavnSearchService.js";

// In-memory cache for audio streams
const audioCache = new Map();

// Known curated high-fidelity streams for Nocturne ambient tracks
const FALLBACK_TRACK_STREAMS = {
  "track-midnight-pulse": "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3",
  "track-shadows-in-blue": "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=chill-abstract-intention-12099.mp3",
  "track-aether-resonance": "https://cdn.pixabay.com/download/audio/2022/11/06/audio_2484643534.mp3?filename=lofi-chill-medium-version-159456.mp3",
  "track-kuroshio-current": "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=ambient-piano-amp-strings-10711.mp3",
  "track-tokyo-monorail": "https://cdn.pixabay.com/download/audio/2022/02/07/audio_1e592795f5.mp3?filename=japanese-chill-hop-115316.mp3",
};

const DEFAULT_FALLBACK_STREAM = "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim() || searchParams.get("q")?.trim() || "";
  const page = parseInt(searchParams.get("page") || searchParams.get("p") || "1", 10) || 1;

  // -------------------------------------------------------------
  // Mode 1: Federated Predictive Autocomplete Search & Catalog Search
  // -------------------------------------------------------------
  if (query) {
    const catalogResult = await searchJioSaavnCatalog(query, { page, limit: 40 });
    return NextResponse.json(catalogResult);
  }

  // -------------------------------------------------------------
  // Mode 2: Single Track Audio Stream Resolution
  // -------------------------------------------------------------
  const title = searchParams.get("title")?.trim() || "";
  const artist = searchParams.get("artist")?.trim() || "";
  const trackId = searchParams.get("trackId")?.trim() || "";

  if (!title && !trackId) {
    return NextResponse.json({ error: "query, title, or trackId is required" }, { status: 400 });
  }

  const cacheKey = trackId ? `audio-id:::${trackId}` : `audio:::${title.toLowerCase()}---${artist.toLowerCase()}`;
  if (audioCache.has(cacheKey)) {
    return NextResponse.json(audioCache.get(cacheKey));
  }

  if (trackId && FALLBACK_TRACK_STREAMS[trackId]) {
    const fallbackResponse = {
      success: true,
      source: "curated_ambient",
      title: title || "Nocturne Track",
      artist: artist || "Nocturne Audio",
      audioUrl: FALLBACK_TRACK_STREAMS[trackId],
      bitrate: "320kbps",
    };
    audioCache.set(cacheKey, fallbackResponse);
    return NextResponse.json(fallbackResponse);
  }

  // Primary Path: Resolve directly by trackId via song.getDetails (fast & high fidelity 320kbps stream)
  if (trackId) {
    try {
      const detailsUrl = `https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${encodeURIComponent(trackId)}&_format=json`;
      const res = await fetch(detailsUrl, {
        headers: JIOSAAVN_HEADERS,
        next: { revalidate: 3600 },
      });

      if (res.ok) {
        const detailsData = await res.json();
        const song = detailsData[trackId] || Object.values(detailsData).find((v) => v && typeof v === "object" && (v.id || v.song || v.more_info || v.encrypted_media_url));
        const encryptedMediaUrl = song?.more_info?.encrypted_media_url || song?.encrypted_media_url;

        if (encryptedMediaUrl) {
          const rawDecryptedUrl = decryptMediaUrl(encryptedMediaUrl);
          if (rawDecryptedUrl && rawDecryptedUrl.startsWith("http")) {
            const highBitrateUrl = rawDecryptedUrl.replace(/_96\.mp4/, "_320.mp4");
            const responseData = {
              success: true,
              source: "jiosaavn_pid",
              songId: song.id || trackId,
              title: cleanHtmlText(song.song || song.title || title),
              artist: cleanHtmlText(song.primary_artists || song.singers || artist),
              album: cleanHtmlText(song.album || ""),
              year: song.year || null,
              audioUrl: highBitrateUrl,
              fallbackAudioUrl: rawDecryptedUrl,
              bitrate: "320kbps",
              duration: parseInt(song.more_info?.duration || song.duration || "210", 10),
              coverUrl: (song.image || "").replace(/50x50|150x150/, "500x500") || null,
            };
            audioCache.set(cacheKey, responseData);
            return NextResponse.json(responseData, {
              headers: {
                "Cache-Control": "public, max-age=3600, s-maxage=3600",
              },
            });
          }
        }
      }
    } catch (err) {
      console.warn("Direct trackId resolution failed, trying fallback search:", err);
    }
  }

  // Secondary Fallback Path: Search by title & artist
  const queryStr = artist ? `${title} ${artist}` : title;
  const searchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&p=1&n=5&q=${encodeURIComponent(queryStr)}`;

  try {
    const apiRes = await fetch(searchUrl, {
      headers: JIOSAAVN_HEADERS,
      next: { revalidate: 3600 },
    });

    if (!apiRes.ok) {
      throw new Error(`JioSaavn API responded with status ${apiRes.status}`);
    }

    const data = await apiRes.json();
    const results = data.results || [];

    if (results.length > 0) {
      const topSong = results[0];
      const encryptedMediaUrl = topSong.more_info?.encrypted_media_url || topSong.encrypted_media_url;

      if (encryptedMediaUrl) {
        const rawDecryptedUrl = decryptMediaUrl(encryptedMediaUrl);

        if (rawDecryptedUrl && rawDecryptedUrl.startsWith("http")) {
          const highBitrateUrl = rawDecryptedUrl.replace(/_96\.mp4/, "_320.mp4");

          const responseData = {
            success: true,
            source: "jiosaavn_search",
            songId: topSong.id,
            title: cleanHtmlText(topSong.song || title),
            artist: cleanHtmlText(topSong.primary_artists || artist),
            album: cleanHtmlText(topSong.album || ""),
            year: topSong.year,
            audioUrl: highBitrateUrl,
            fallbackAudioUrl: rawDecryptedUrl,
            bitrate: "320kbps",
            duration: parseInt(topSong.more_info?.duration || "210", 10),
            coverUrl: topSong.image?.replace("150x150", "500x500") || null,
          };

          audioCache.set(cacheKey, responseData);
          return NextResponse.json(responseData, {
            headers: {
              "Cache-Control": "public, max-age=3600, s-maxage=3600",
            },
          });
        }
      }
    }

    const fallbackUrl = (trackId && FALLBACK_TRACK_STREAMS[trackId]) || DEFAULT_FALLBACK_STREAM;
    const fallbackData = {
      success: true,
      source: "fallback",
      title,
      artist,
      audioUrl: fallbackUrl,
      bitrate: "192kbps",
      duration: 210,
    };
    audioCache.set(cacheKey, fallbackData);
    return NextResponse.json(fallbackData);
  } catch (error) {
    console.error("Audio stream resolution error:", error);
    const fallbackUrl = (trackId && FALLBACK_TRACK_STREAMS[trackId]) || DEFAULT_FALLBACK_STREAM;
    return NextResponse.json({
      success: true,
      source: "fallback_error",
      title,
      artist,
      audioUrl: fallbackUrl,
      bitrate: "192kbps",
      duration: 210,
    });
  }
}
