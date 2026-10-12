import { getSpotifyAccessToken } from "../lib/spotify.js";

/**
 * Extracts a Spotify playlist ID from various URL formats or raw URIs.
 * Supports:
 * - https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=...
 * - https://open.spotify.com/intl-ja/playlist/37i9dQZF1DXcBWIGoYBM5M
 * - https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M
 * - spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
 * - 37i9dQZF1DXcBWIGoYBM5M (direct ID)
 */
export function parseSpotifyPlaylistId(input) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  // Match spotify:playlist:<id>
  const uriMatch = trimmed.match(/^spotify:playlist:([a-zA-Z0-9]{15,30})$/);
  if (uriMatch) return uriMatch[1];

  // Match open.spotify.com/(?:intl-[a-z]{2}/)?(?:embed/)?playlist/([a-zA-Z0-9]{15,30})
  const urlMatch = trimmed.match(/open\.spotify\.com\/(?:[a-zA-Z0-9_-]+\/)?(?:embed\/)?playlist\/([a-zA-Z0-9]{15,30})/);
  if (urlMatch) return urlMatch[1];

  // Raw alphanumeric ID (typically 22 chars in base62)
  if (/^[a-zA-Z0-9]{20,25}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Strips HTML entities from strings.
 */
function cleanText(str) {
  if (!str) return "";
  return str
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * Fetches playlist metadata and tracks from Spotify.
 * 1. Checks if official API credentials exist and retrieves playlist (with pagination up to 500 items).
 * 2. Falls back to public Spotify embed page if credentials are not configured or official API fails.
 */
export async function getSpotifyPlaylistMetadata(playlistId) {
  if (!playlistId || typeof playlistId !== "string") {
    return {
      success: false,
      error: "Invalid or missing Spotify playlist ID.",
      code: "INVALID_ID",
    };
  }

  const cleanId = playlistId.trim();

  // Attempt 1: Official Spotify Web API if client credentials are configured
  try {
    const token = await getSpotifyAccessToken();
    if (token) {
      console.log(`[Spotify Playlist] Fetching via official API for ID: ${cleanId}`);
      const res = await fetch(`https://api.spotify.com/v1/playlists/${cleanId}?market=IN`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        let allItems = Array.isArray(data.tracks?.items) ? [...data.tracks.items] : [];
        let nextUrl = data.tracks?.next;
        let pageCount = 1;
        const maxPages = 5; // Support up to 500 songs safely

        while (nextUrl && pageCount < maxPages) {
          try {
            const nextRes = await fetch(nextUrl, {
              headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
              cache: "no-store",
            });
            if (!nextRes.ok) break;
            const nextData = await nextRes.json();
            if (Array.isArray(nextData.items)) {
              allItems.push(...nextData.items);
            }
            nextUrl = nextData.next;
            pageCount++;
          } catch (pErr) {
            console.warn("[Spotify Playlist] Pagination error:", pErr);
            break;
          }
        }

        const validTracks = allItems
          .map((item, index) => {
            const t = item?.track || item;
            if (!t || !t.name) return null;
            const primaryArtist = t.artists?.[0]?.name || "Unknown Artist";
            const artistNames = Array.isArray(t.artists) ? t.artists.map((a) => a.name).filter(Boolean) : [primaryArtist];
            const cover = t.album?.images?.[0]?.url || t.album?.images?.[1]?.url || data.images?.[0]?.url || "";

            return {
              spotifyId: t.id || `spotify-track-${index}`,
              originalIndex: index,
              name: cleanText(t.name),
              artists: artistNames,
              primaryArtist: primaryArtist,
              album: cleanText(t.album?.name || ""),
              duration_ms: t.duration_ms || 0,
              durationFormatted: formatDuration(Math.round((t.duration_ms || 0) / 1000)),
              coverUrl: cover,
              isrc: t.external_ids?.isrc || null,
              spotifyUrl: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
              isLocal: Boolean(t.is_local),
            };
          })
          .filter(Boolean);

        return {
          success: true,
          source: "official_api",
          playlist: {
            id: cleanId,
            name: cleanText(data.name || "Imported Playlist"),
            description: cleanText(data.description || ""),
            owner: data.owner?.display_name || "Spotify User",
            coverUrl: data.images?.[0]?.url || (validTracks[0]?.coverUrl || ""),
            totalTracks: data.tracks?.total || validTracks.length,
            tracks: validTracks,
          },
        };
      } else {
        console.warn(`[Spotify Playlist] Official API returned ${res.status}. Falling back to embed parser.`);
      }
    }
  } catch (err) {
    console.warn("[Spotify Playlist] Official API error:", err?.message || err);
  }

  // Attempt 2: Public Embed Endpoint fallback (extracts up to 50 tracks without credentials)
  try {
    console.log(`[Spotify Playlist] Fetching via public embed fallback for ID: ${cleanId}`);
    const embedUrl = `https://open.spotify.com/embed/playlist/${cleanId}`;
    const embedRes = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    });

    if (embedRes.ok) {
      const html = await embedRes.text();
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (nextDataMatch) {
        const json = JSON.parse(nextDataMatch[1]);
        const entity = json?.props?.pageProps?.state?.data?.entity;
        if (entity && Array.isArray(entity.trackList)) {
          let coverArt =
            entity.coverArt?.sources?.[0]?.url ||
            entity.coverArt?.sources?.[entity.coverArt?.sources?.length - 1]?.url ||
            entity.visualIdentity?.image?.[0]?.url ||
            (Array.isArray(entity.images) && entity.images[0]?.url) ||
            "";

          if (!coverArt && html) {
            const ogMatch =
              html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
              html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
              html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
            if (ogMatch && ogMatch[1]) {
              coverArt = ogMatch[1];
            }
          }

          const validTracks = entity.trackList
            .map((t, index) => {
              if (!t || !t.title) return null;
              // In embed data, subtitle usually holds artist name(s) e.g. "The Weeknd" or "Anirudh Ravichander, Super Subu"
              const subtitle = cleanText(t.subtitle || "");
              const artistNames = subtitle
                ? subtitle.split(/,\s*/).map((a) => a.trim()).filter(Boolean)
                : ["Various Artists"];
              const primaryArtist = artistNames[0] || "Various Artists";

              return {
                spotifyId: t.uri ? t.uri.replace("spotify:track:", "") : `embed-track-${index}`,
                originalIndex: index,
                name: cleanText(t.title),
                artists: artistNames,
                primaryArtist: primaryArtist,
                album: cleanText(entity.name || ""),
                duration_ms: t.duration || 0,
                durationFormatted: formatDuration(Math.round((t.duration || 0) / 1000)),
                coverUrl: coverArt,
                spotifyUrl: t.uri ? `https://open.spotify.com/track/${t.uri.replace("spotify:track:", "")}` : "",
              };
            })
            .filter(Boolean);

          return {
            success: true,
            source: "public_embed",
            playlist: {
              id: cleanId,
              name: cleanText(entity.name || "Spotify Playlist"),
              description: cleanText(entity.subtitle || ""),
              owner: cleanText(entity.subtitle || "Spotify"),
              coverUrl: coverArt,
              totalTracks: validTracks.length,
              tracks: validTracks,
            },
          };
        }
      }
    }
  } catch (embedErr) {
    console.warn("[Spotify Playlist] Embed parser error:", embedErr?.message || embedErr);
  }

  return {
    success: false,
    error: "Unable to retrieve Spotify playlist. The playlist might be private, deleted, or regional restrictions may apply.",
    code: "PLAYLIST_NOT_ACCESSIBLE",
  };
}

/**
 * Parses user-pasted text tracklist (e.g. "Song - Artist" per line) as a fallback.
 */
export function parseTextTracklist(text, playlistName = "Imported Tracklist") {
  if (!text || typeof text !== "string") return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const tracks = lines.map((line, index) => {
    // Check for "Song - Artist" or "Artist - Song" or numbered list "1. Song - Artist"
    const cleaned = line.replace(/^\d+[\.\)\-]\s*/, "");
    let name = cleaned;
    let artist = "Various Artists";

    if (cleaned.includes(" - ")) {
      const parts = cleaned.split(" - ");
      name = parts[0].trim();
      artist = parts.slice(1).join(" - ").trim();
    } else if (cleaned.includes(" by ")) {
      const parts = cleaned.split(" by ");
      name = parts[0].trim();
      artist = parts.slice(1).join(" by ").trim();
    }

    return {
      spotifyId: `manual-track-${index}`,
      originalIndex: index,
      name: cleanText(name),
      artists: [cleanText(artist)],
      primaryArtist: cleanText(artist),
      album: "",
      duration_ms: 0,
      durationFormatted: "3:30",
      coverUrl: "",
      isManual: true,
    };
  });

  return {
    success: true,
    source: "manual_text",
    playlist: {
      id: `manual-playlist-${Date.now()}`,
      name: playlistName || "Imported Tracklist",
      description: "Playlist created from imported song list",
      owner: "You",
      coverUrl: "",
      totalTracks: tracks.length,
      tracks,
    },
  };
}

function formatDuration(secs) {
  if (isNaN(secs) || secs <= 0) return "3:30";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}
