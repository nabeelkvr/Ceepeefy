import { NextResponse } from "next/server";
import CryptoJS from "crypto-js";

const playlistCache = new Map();

const JIOSAAVN_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

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

function formatImage(img) {
  if (!img) return "";
  const url = Array.isArray(img) ? img[img.length - 1]?.link || img[img.length - 1] : img;
  return (typeof url === "string" ? url : "").replace(/50x50|150x150/, "500x500");
}

function decryptMediaUrl(encryptedUrl) {
  try {
    const key = CryptoJS.enc.Utf8.parse("38346591");
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encryptedUrl) },
      key,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    );
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch {
    return null;
  }
}

function mapSong(song) {
  const encryptedUrl =
    song?.more_info?.encrypted_media_url || song?.encrypted_media_url;
  let audioUrl = null;
  if (encryptedUrl) {
    const raw = decryptMediaUrl(encryptedUrl);
    if (raw && raw.startsWith("http")) {
      audioUrl = raw.replace(/_96\.mp4/, "_320.mp4");
    }
  }

  return {
    id: song.id || song.song_id || "",
    title: cleanHtmlText(song.song || song.title || "Unknown"),
    artist: cleanHtmlText(
      song.primary_artists || song.singers || song.artist || "Unknown"
    ),
    album: cleanHtmlText(song.album || ""),
    duration: parseInt(song.more_info?.duration || song.duration || "210", 10),
    coverUrl: formatImage(song.image),
    audioUrl,
    year: song.year || null,
    type: "song",
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();

  if (!id) {
    return NextResponse.json({ error: "Missing playlist id" }, { status: 400 });
  }

  const cacheKey = `pl:::${id}`;
  if (playlistCache.has(cacheKey)) {
    return NextResponse.json(playlistCache.get(cacheKey));
  }

  try {
    const url = `https://www.jiosaavn.com/api.php?__call=playlist.getDetails&listid=${encodeURIComponent(id)}&_format=json`;
    const res = await fetch(url, {
      headers: JIOSAAVN_HEADERS,
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      throw new Error(`JioSaavn API responded with ${res.status}`);
    }

    const data = await res.json();

    if (!data || data.error) {
      return NextResponse.json(
        { error: "Playlist not found" },
        { status: 404 }
      );
    }

    const rawSongs = Array.isArray(data.songs) ? data.songs : (Array.isArray(data.list) ? data.list : []);
    const songs = rawSongs.map(mapSong);

    const playlist = {
      id,
      title: cleanHtmlText(data.listname || data.title || "Playlist"),
      description: cleanHtmlText(
        data.description || data.subtitle || "Curated Playlist"
      ),
      coverUrl: formatImage(data.image),
      curator: cleanHtmlText(data.firstname || data.username || "Saavn Editor"),
      songCount: data.list_count || songs.length,
      language: data.language || "",
      tracks: songs,
    };

    playlistCache.set(cacheKey, playlist);
    return NextResponse.json(playlist);
  } catch (err) {
    console.error("Playlist fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch playlist", details: err.message },
      { status: 500 }
    );
  }
}
