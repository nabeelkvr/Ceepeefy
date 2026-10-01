import { NextResponse } from "next/server";
import CryptoJS from "crypto-js";
import { NOCTURNE_ARTISTS, getArtistByIdOrSlug, getTracksByArtist } from "../../../../data/nocturneData";

// In-memory cache for artist profile & song data
const artistCache = new Map();

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
    const raw = decrypted.toString(CryptoJS.enc.Utf8);
    return raw && raw.startsWith("http") ? raw.replace(/_96\.mp4/, "_320.mp4") : null;
  } catch (err) {
    console.error("DES Decryption error in artist route:", err);
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

function formatNumber(num) {
  if (!num) return null;
  const n = parseInt(String(num).replace(/[^0-9]/g, ""), 10);
  if (isNaN(n) || n <= 0) return null;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
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
  const rawId = (resolvedParams?.id || "").trim();
  const { searchParams } = new URL(request.url);
  const nameHint = searchParams.get("name")?.trim() || "";

  if (!rawId) {
    return NextResponse.json({ error: "Artist ID or name is required" }, { status: 400 });
  }

  const cacheKey = `${rawId}:::${nameHint}`.toLowerCase();
  if (artistCache.has(cacheKey)) {
    return NextResponse.json(artistCache.get(cacheKey));
  }

  try {
    let saavnArtistId = null;
    let fallbackName = nameHint;

    // 1. If rawId is purely numeric, it's directly a JioSaavn artist ID
    if (/^\d+$/.test(rawId)) {
      saavnArtistId = rawId;
    } else {
      // 2. If it's a known Nocturne artist, check if we have their details or name
      const localArtist = getArtistByIdOrSlug(rawId);
      if (localArtist?.name && !fallbackName) {
        fallbackName = localArtist.name;
      }

      // Try resolving numeric JioSaavn ID by searching with name or slug
      const searchQuery = fallbackName || rawId.replace(/^artist[-_]/i, "").replace(/-/g, " ");
      try {
        const searchUrl = `https://www.jiosaavn.com/api.php?__call=search.getArtistResults&_format=json&p=1&n=5&q=${encodeURIComponent(searchQuery)}`;
        const searchRes = await fetch(searchUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "application/json, text/plain, */*",
          },
          next: { revalidate: 3600 },
        });

        if (searchRes.ok) {
          const sData = await searchRes.json();
          const results = sData.results || [];
          if (results.length > 0) {
            saavnArtistId = results[0].id || results[0].artistId;
            if (!fallbackName) {
              fallbackName = cleanHtmlText(results[0].name);
            }
          }
        }
      } catch (err) {
        console.warn("Could not search JioSaavn artist ID:", err);
      }
    }

    // 3. If we resolved a JioSaavn artist ID, fetch full artist page details
    if (saavnArtistId) {
      const pageDetailsUrl = `https://www.jiosaavn.com/api.php?__call=artist.getArtistPageDetails&_format=json&artistId=${encodeURIComponent(saavnArtistId)}&n_song=100&n_album=20`;
      const res = await fetch(pageDetailsUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
        },
        next: { revalidate: 3600 },
      });

      if (res.ok) {
        const data = await res.json();
        if (data && !data.error && data.name) {
          const artistName = cleanHtmlText(data.name);
          const rawImage = data.image || "";
          const highResAvatar = rawImage
            ? rawImage.replace(/150x150|50x50/, "500x500")
            : "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80";

          // Format followers & listeners
          const followersFormatted = formatNumber(data.follower_count) || (data.fan_count ? `${formatNumber(data.fan_count)} Fans` : "1.2M");
          const monthlyListenersFormatted = data.fan_count
            ? parseInt(data.fan_count, 10).toLocaleString()
            : data.follower_count
            ? (parseInt(data.follower_count, 10) * 12).toLocaleString()
            : "4,500,000";

          const genreLabel = data.dominantLanguage
            ? `${data.dominantLanguage.charAt(0).toUpperCase() + data.dominantLanguage.slice(1)} • ${data.dominantType || "Artist"}`
            : data.dominantType || "Playback / Independent";

          let bioText = "";
          if (typeof data.bio === "string" && data.bio !== "[]" && data.bio.trim()) {
            bioText = cleanHtmlText(data.bio);
          } else if (Array.isArray(data.bio) && data.bio.length > 0) {
            bioText = cleanHtmlText(data.bio.join(" "));
          }
          if (!bioText) {
            bioText = `${artistName} is an acclaimed recording artist known for exceptional vocal performances, studio-grade compositions, and chart-topping musical releases.`;
          }

          // Map full top songs
          const rawSongs = data.topSongs?.songs || (Array.isArray(data.topSongs) ? data.topSongs : []);
          const mappedTracks = rawSongs.map((song, idx) => {
            const encUrl = song.encrypted_media_url || song.more_info?.encrypted_media_url;
            const audioUrl = encUrl ? decryptMediaUrl(encUrl) : null;
            const rawDuration = parseInt(song.duration || song.more_info?.duration || "210", 10);
            const duration = isNaN(rawDuration) || rawDuration <= 0 ? 210 : rawDuration;
            const thumbnail = (song.image || highResAvatar).replace(/150x150|50x50/, "500x500");
            const rawYear = song.year || "";
            const year = parseInt(rawYear, 10);

            const rawPlayCount = song.play_count || song.more_info?.play_count || "0";
            const playCount = parseInt(rawPlayCount, 10) || 0;

            return {
              id: song.id || `artist-song-${idx}-${Date.now()}`,
              title: cleanHtmlText(song.title || song.song || "Track"),
              artist: cleanHtmlText(song.primary_artists || song.more_info?.primary_artists || song.singers || artistName),
              album: cleanHtmlText(song.album || song.more_info?.album || "Single"),
              year: isNaN(year) || year <= 0 ? null : year,
              duration,
              durationFormatted: formatDuration(duration),
              thumbnail,
              coverUrl: thumbnail,
              audioUrl,
              badge: song["320kbps"] === "true" || song["320kbps"] === true ? "320kbps" : "Lossless",
              badgeType: "tertiary",
              playCount,
              playCountFormatted: formatPlayCount(playCount),
              source: "jiosaavn_artist",
            };
          });

          const payload = {
            artist: {
              id: String(data.artistId || saavnArtistId),
              name: artistName,
              avatar: highResAvatar,
              image: highResAvatar,
              role: cleanHtmlText(data.dominantType || data.subtitle?.split("•")[0]?.trim() || "Artist"),
              genre: genreLabel,
              followers: followersFormatted,
              monthlyListeners: monthlyListenersFormatted,
              isVerified: Boolean(data.isVerified),
              bio: bioText,
            },
            tracks: mappedTracks,
          };

          artistCache.set(cacheKey, payload);
          if (data.artistId) {
            artistCache.set(String(data.artistId).toLowerCase(), payload);
          }
          if (artistName) {
            artistCache.set(artistName.toLowerCase(), payload);
          }

          return NextResponse.json(payload);
        }
      }
    }

    // 4. Fallback: Check local curated Nocturne artists
    const localArtist = getArtistByIdOrSlug(rawId);
    if (localArtist) {
      const localTracks = getTracksByArtist(localArtist.id);
      const payload = {
        artist: {
          ...localArtist,
          avatar: localArtist.avatar || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
        },
        tracks: localTracks || [],
      };
      artistCache.set(cacheKey, payload);
      return NextResponse.json(payload);
    }

    // 5. Ultimate fallback if artist cannot be resolved
    const cleanDisplayName = fallbackName || (rawId.replace(/^artist[-_]/i, "").replace(/-/g, " "));
    const payload = {
      artist: {
        id: rawId,
        name: cleanDisplayName,
        avatar: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
        role: "Artist",
        genre: "Music",
        followers: "1.2M",
        monthlyListeners: "3,200,000",
        isVerified: true,
        bio: `${cleanDisplayName} is a celebrated recording artist.`,
      },
      tracks: [],
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("Fetch artist details error:", err);
    return NextResponse.json({ error: "Failed to fetch artist details" }, { status: 500 });
  }
}
