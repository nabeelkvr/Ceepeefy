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
/**
 * Resolves the genuine high-resolution Spotify playlist artwork.
 * Prioritizes Spotify's public oEmbed service, then falls back to open.spotify.com page metadata.
 *
 * @param {string} cleanId - Spotify playlist ID
 * @returns {Promise<string|null>} The original playlist artwork URL, or null if unreachable
 */
export async function getSpotifyPlaylistCoverArt(cleanId) {
  if (!cleanId) return null;

  // Method 1: Spotify public oEmbed endpoint (unauthenticated, official, returns thumbnail_url)
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=https://open.spotify.com/playlist/${cleanId}`;
    const res = await fetch(oembedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.thumbnail_url && typeof data.thumbnail_url === "string" && data.thumbnail_url.startsWith("http")) {
        console.log(`[Spotify Service] Retrieved cover art via oEmbed: ${data.thumbnail_url}`);
        return data.thumbnail_url;
      }
    }
  } catch (e) {
    console.warn("[Spotify Service] oEmbed cover fetch notice:", e?.message || e);
  }

  // Method 2: Scrape og:image from the public playlist web page (open.spotify.com/playlist/...)
  try {
    const pageUrl = `https://open.spotify.com/playlist/${cleanId}`;
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    });
    if (res.ok) {
      const html = await res.text();
      const ogMatch =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
        html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
      if (ogMatch && ogMatch[1] && !ogMatch[1].includes("default") && !ogMatch[1].includes("spotify-logo")) {
        console.log(`[Spotify Service] Retrieved cover art via page og:image: ${ogMatch[1]}`);
        return ogMatch[1];
      }
    }
  } catch (e) {
    console.warn("[Spotify Service] Web page cover scrape notice:", e?.message || e);
  }

  // Method 3: Scrape og:image from the public embed page
  try {
    const embedUrl = `https://open.spotify.com/embed/playlist/${cleanId}`;
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    });
    if (res.ok) {
      const html = await res.text();
      const ogMatch =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (ogMatch && ogMatch[1]) {
        return ogMatch[1];
      }
    }
  } catch (e) {
    console.warn("[Spotify Service] Embed cover scrape notice:", e?.message || e);
  }

  return null;
}

/**
 * Helper to recursively search an object for a token string
 */
function extractTokenFromState(obj, depth = 0) {
  if (!obj || depth > 5) return null;
  if (typeof obj === "object") {
    if (obj.accessToken && typeof obj.accessToken === "string" && obj.accessToken.length > 20) {
      return obj.accessToken;
    }
    if (obj.token && typeof obj.token === "string" && obj.token.length > 20) {
      return obj.token;
    }
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === "object" && obj[key] !== null) {
        const found = extractTokenFromState(obj[key], depth + 1);
        if (found) return found;
      }
    }
  }
  return null;
}

/**
 * Fetches playlist metadata and every available track from Spotify.
 * 1. Checks if official API credentials exist and retrieves the playlist with FULL pagination
 *    (fetches all available pages until all accessible tracks are retrieved, with retry/rate-limit handling).
 * 2. Fetches and preserves the true Spotify playlist artwork via official API or public oEmbed/web fallback.
 * 3. Falls back to public Spotify embed and JSON-LD parsing if credentials are not configured,
 *    reporting accurate totals, partial status, and retaining all retrieved entries.
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

  // Pre-fetch cover artwork via public oEmbed in parallel so we always have the genuine Spotify artwork
  const publicCoverPromise = getSpotifyPlaylistCoverArt(cleanId);

  // Attempt 1: Official Spotify Web API if client credentials are configured
  try {
    let token = await getSpotifyAccessToken();
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
        const totalExpected = data.tracks?.total || 0;
        let allItems = Array.isArray(data.tracks?.items) ? [...data.tracks.items] : [];
        let nextUrl = data.tracks?.next;
        let pageCount = 1;
        let hasPartialFailure = false;
        let partialFailureReason = "";

        // Continue fetching EVERY available page until all accessible playlist entries are retrieved
        while ((nextUrl || allItems.length < totalExpected) && !hasPartialFailure) {
          const targetUrl =
            nextUrl ||
            `https://api.spotify.com/v1/playlists/${cleanId}/tracks?offset=${allItems.length}&limit=100&market=IN`;

          let fetchSuccess = false;
          let retryCount = 0;
          const maxRetries = 3;

          while (retryCount < maxRetries && !fetchSuccess) {
            try {
              const nextRes = await fetch(targetUrl, {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: "application/json",
                },
                cache: "no-store",
              });

              if (nextRes.status === 429) {
                const retryAfterSec = parseInt(nextRes.headers.get("Retry-After") || "2", 10);
                console.warn(
                  `[Spotify Playlist] Rate limited (429). Retrying page ${pageCount + 1} after ${retryAfterSec}s...`
                );
                await new Promise((r) => setTimeout(r, Math.min(retryAfterSec * 1000, 5000)));
                retryCount++;
                continue;
              }

              if (nextRes.status === 401) {
                console.warn("[Spotify Playlist] Token expired during pagination. Refreshing token...");
                const refreshedToken = await getSpotifyAccessToken();
                if (refreshedToken) {
                  token = refreshedToken;
                  retryCount++;
                  continue;
                } else {
                  break;
                }
              }

              if (!nextRes.ok) {
                console.warn(`[Spotify Playlist] Pagination HTTP error ${nextRes.status} on page ${pageCount + 1}`);
                retryCount++;
                await new Promise((r) => setTimeout(r, 1000));
                continue;
              }

              const nextData = await nextRes.json();
              if (Array.isArray(nextData.items) && nextData.items.length > 0) {
                allItems.push(...nextData.items);
                nextUrl = nextData.next;
                pageCount++;
                fetchSuccess = true;
              } else {
                // No more items available from Spotify
                nextUrl = null;
                fetchSuccess = true;
                break;
              }
            } catch (pageErr) {
              console.warn(`[Spotify Playlist] Network error on page ${pageCount + 1}:`, pageErr?.message || pageErr);
              retryCount++;
              await new Promise((r) => setTimeout(r, 1000));
            }
          }

          if (!fetchSuccess) {
            console.error(
              `[Spotify Playlist] Failed to fetch page ${pageCount + 1} after ${maxRetries} retries.`
            );
            hasPartialFailure = true;
            partialFailureReason = `Pagination interrupted after retrieving ${allItems.length} of ${totalExpected} songs due to Spotify rate limits or network error.`;
            break;
          }
        }

        // Resolve playlist cover: official images[0] or fallback to public oEmbed
        const fallbackPublicCover = await publicCoverPromise.catch(() => null);
        const resolvedPlaylistCover =
          data.images?.[0]?.url ||
          data.images?.[1]?.url ||
          fallbackPublicCover ||
          "";

        const validTracks = allItems
          .map((item, index) => {
            const t = item?.track || item;
            if (!t || !t.name) return null; // Deleted or regionally unavailable Spotify track
            const primaryArtist = t.artists?.[0]?.name || "Unknown Artist";
            const artistNames = Array.isArray(t.artists)
              ? t.artists.map((a) => a.name).filter(Boolean)
              : [primaryArtist];
            const trackCover =
              t.album?.images?.[0]?.url ||
              t.album?.images?.[1]?.url ||
              t.album?.images?.[2]?.url ||
              "";

            return {
              spotifyId: t.id || `spotify-track-${index}`,
              originalIndex: index,
              name: cleanText(t.name),
              artists: artistNames,
              primaryArtist: primaryArtist,
              album: cleanText(t.album?.name || ""),
              duration_ms: t.duration_ms || 0,
              durationFormatted: formatDuration(Math.round((t.duration_ms || 0) / 1000)),
              coverUrl: trackCover,
              isrc: t.external_ids?.isrc || null,
              spotifyUrl: t.external_urls?.spotify || (t.id ? `https://open.spotify.com/track/${t.id}` : ""),
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
            coverUrl: resolvedPlaylistCover,
            totalTracks: totalExpected || validTracks.length,
            tracks: validTracks,
            isPartial: hasPartialFailure,
            partialError: partialFailureReason || null,
          },
        };
      } else {
        console.warn(`[Spotify Playlist] Official API returned ${res.status}. Falling back to embed parser.`);
      }
    }
  } catch (err) {
    console.warn("[Spotify Playlist] Official API error:", err?.message || err);
  }

  // Attempt 2: Public Embed & Web metadata fallback
  try {
    console.log(`[Spotify Playlist] Fetching via public embed & metadata fallback for ID: ${cleanId}`);
    const embedUrl = `https://open.spotify.com/embed/playlist/${cleanId}`;
    const [embedRes, publicCover] = await Promise.all([
      fetch(embedUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        cache: "no-store",
      }).catch((e) => {
        console.warn("[Spotify Playlist] Embed fetch error:", e?.message || e);
        return null;
      }),
      publicCoverPromise.catch(() => null),
    ]);

    if (embedRes && embedRes.ok) {
      const html = await embedRes.text();
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (nextDataMatch) {
        const json = JSON.parse(nextDataMatch[1]);
        const entity = json?.props?.pageProps?.state?.data?.entity;
        if (entity && Array.isArray(entity.trackList)) {
          let coverArt =
            publicCover ||
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

          let allTracks = [...entity.trackList];

          // Check if NextData embedded an anonymous bearer token that can paginate the tracks API
          const anonymousToken = extractTokenFromState(json?.props?.pageProps);
          if (anonymousToken && entity.trackList.length < (entity.totalLength || 9999)) {
            console.log(`[Spotify Playlist] Found anonymous token, attempting pagination for ID: ${cleanId}`);
            let offset = entity.trackList.length;
            let canContinue = true;

            while (canContinue && offset < (entity.totalLength || 1000)) {
              try {
                const apiRes = await fetch(
                  `https://api.spotify.com/v1/playlists/${cleanId}/tracks?offset=${offset}&limit=100&market=IN`,
                  {
                    headers: {
                      Authorization: `Bearer ${anonymousToken}`,
                      Accept: "application/json",
                    },
                    cache: "no-store",
                  }
                );
                if (!apiRes.ok) break;
                const apiData = await apiRes.json();
                if (Array.isArray(apiData.items) && apiData.items.length > 0) {
                  const mappedItems = apiData.items.map((it) => {
                    const t = it?.track || it;
                    return {
                      title: t?.name,
                      subtitle: (t?.artists || []).map((a) => a.name).join(", "),
                      duration: t?.duration_ms,
                      uri: t?.uri || (t?.id ? `spotify:track:${t.id}` : ""),
                    };
                  });
                  allTracks.push(...mappedItems);
                  offset += apiData.items.length;
                  if (!apiData.next) canContinue = false;
                } else {
                  canContinue = false;
                }
              } catch (pErr) {
                console.warn("[Spotify Playlist] Anonymous pagination error:", pErr);
                break;
              }
            }
          }

          const validTracks = allTracks
            .map((t, index) => {
              if (!t || !t.title) return null;
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
                coverUrl: "", // Track cover will be matched accurately via JioSaavn
                spotifyUrl: t.uri ? `https://open.spotify.com/track/${t.uri.replace("spotify:track:", "")}` : "",
              };
            })
            .filter(Boolean);

          const totalPlaylistCount = entity.totalLength || validTracks.length;
          const isPartial = totalPlaylistCount > validTracks.length;
          const partialNotice = isPartial
            ? `Retrieved ${validTracks.length} accessible songs via public web preview. For unrestricted full pagination of large playlists, configure SPOTIFY_CLIENT_ID in .env.local.`
            : null;

          return {
            success: true,
            source: "public_embed",
            playlist: {
              id: cleanId,
              name: cleanText(entity.name || "Spotify Playlist"),
              description: cleanText(entity.subtitle || ""),
              owner: cleanText(entity.subtitle || "Spotify"),
              coverUrl: coverArt,
              totalTracks: totalPlaylistCount,
              tracks: validTracks,
              isPartial,
              partialError: partialNotice,
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
