import { NextResponse } from "next/server";
import CryptoJS from "crypto-js";

// In-memory cache for album details
const albumCache = new Map();

function decryptMediaUrl(encryptedUrl) {
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
  if (isNaN(secs) || secs < 0) return "3:30";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function formatPlayCount(count) {
  if (!count || isNaN(count) || count <= 0) return null;
  if (count >= 1000000000) return `${(count / 1000000000).toFixed(1)}B`;
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return `${count}`;
}

export async function GET(request, { params }) {
  const resolvedParams = await params;
  const albumId = resolvedParams?.id?.trim();

  if (!albumId) {
    return NextResponse.json({ error: "Album ID is required" }, { status: 400 });
  }

  if (albumCache.has(albumId)) {
    return NextResponse.json(albumCache.get(albumId));
  }

  try {
    let resolvedAlbumId = albumId;

    // If albumId is non-numeric or slug, resolve via autocomplete or album search
    if (!/^\d+$/.test(albumId)) {
      try {
        const autoRes = await fetch(
          `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&query=${encodeURIComponent(albumId)}`,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "application/json, text/plain, */*",
            },
            next: { revalidate: 3600 },
          }
        );
        if (autoRes.ok) {
          const autoData = await autoRes.json();
          if (autoData?.albums?.data && autoData.albums.data.length > 0) {
            resolvedAlbumId = autoData.albums.data[0].id;
          }
        }
      } catch (e) {
        console.warn("Could not resolve non-numeric album ID via autocomplete:", e);
      }
    }

    const url = `https://www.jiosaavn.com/api.php?__call=content.getAlbumDetails&_format=json&albumid=${encodeURIComponent(resolvedAlbumId)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch album details: status ${res.status}` }, { status: 502 });
    }

    const albumData = await res.json();
    if (!albumData || (!albumData.title && !albumData.name)) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    const rawSongs = Array.isArray(albumData.songs) ? albumData.songs : [];

    const mappedTracks = rawSongs.map((song, idx) => {
      const encryptedMediaUrl = song.more_info?.encrypted_media_url || song.encrypted_media_url;
      let audioUrl = null;
      if (encryptedMediaUrl) {
        const rawDecryptedUrl = decryptMediaUrl(encryptedMediaUrl);
        if (rawDecryptedUrl && rawDecryptedUrl.startsWith("http")) {
          audioUrl = rawDecryptedUrl.replace(/_96\.mp4/, "_320.mp4");
        }
      }

      const rawDuration = parseInt(song.more_info?.duration || song.duration || "210", 10);
      const duration = isNaN(rawDuration) || rawDuration <= 0 ? 210 : rawDuration;
      const thumbnail = (song.image || albumData.image || "")
        .replace("150x150", "500x500")
        .replace("50x50", "500x500");

      const rawYear = song.year || albumData.year || "";
      const year = parseInt(rawYear, 10);

      const rawPlayCount = song.play_count || song.more_info?.play_count || "0";
      const playCount = parseInt(rawPlayCount, 10);
      const validPlayCount = !isNaN(playCount) && playCount > 0 ? playCount : 0;

      const releaseDate = song.release_date || albumData.release_date || (year ? `${year}-01-01` : null);

      return {
        id: song.id || `album-track-${idx}-${Date.now()}`,
        title: cleanHtmlText(song.song || song.title || "Unknown Song"),
        artist: cleanHtmlText(song.primary_artists || song.singers || albumData.primary_artists || "Unknown Artist"),
        album: cleanHtmlText(albumData.title || albumData.name || song.album || "Soundtrack"),
        year: isNaN(year) || year <= 0 ? null : year,
        releaseDate,
        playCount: validPlayCount,
        playCountFormatted: formatPlayCount(validPlayCount),
        duration,
        durationFormatted: formatDuration(duration),
        thumbnail,
        coverUrl: thumbnail,
        audioUrl: audioUrl || null,
        badge: song["320kbps"] === "true" || song["320kbps"] === true ? "320kbps" : "Lossless",
        badgeType: "tertiary",
        source: "jiosaavn_album",
        isMovieTrack: true,
        movieName: cleanHtmlText(albumData.title || albumData.name),
      };
    });

    // Sort tracks in chronological order by release date (newest/most recent first), followed by popularity
    mappedTracks.sort((a, b) => {
      const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
      const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
      if (dateB !== dateA) return dateB - dateA;

      const yearA = a.year || 0;
      const yearB = b.year || 0;
      if (yearB !== yearA) return yearB - yearA;

      return (b.playCount || 0) - (a.playCount || 0);
    });

    const albumImg = (albumData.image || "")
      .replace("150x150", "500x500")
      .replace("50x50", "500x500");

    const payload = {
      id: albumId,
      title: cleanHtmlText(albumData.title || albumData.name),
      artist: cleanHtmlText(albumData.primary_artists || "Film Soundtrack"),
      image: albumImg || "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80",
      thumbnail: albumImg,
      coverUrl: albumImg,
      year: albumData.year || null,
      description: albumData.header_desc || albumData.description || "Original Motion Picture Soundtrack",
      language: albumData.language || "",
      trackCount: mappedTracks.length,
      tracks: mappedTracks,
    };

    albumCache.set(albumId, payload);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("Fetch album details error:", err);
    return NextResponse.json({ error: "Failed to fetch album details" }, { status: 500 });
  }
}
