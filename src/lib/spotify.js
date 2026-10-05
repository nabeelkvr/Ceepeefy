import dns from "node:dns";

/**
 * Spotify Server-side Web API Integration
 * Handles Client Credentials OAuth flow, token caching, catalog search,
 * and discovery for Artists and Playlists.
 *
 * NOTE: Keeps SPOTIFY_CLIENT_SECRET strictly server-side.
 */

// Configure DNS fallback so Spotify hostnames resolve properly even if local network DNS sinks them
if (typeof dns?.lookup === "function") {
  const originalLookup = dns.lookup;
  const resolver = new dns.Resolver();
  resolver.setServers(["8.8.8.8", "1.1.1.1"]);

  dns.lookup = function (hostname, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    originalLookup(hostname, options, (err, address, family) => {
      if (err && (hostname.includes("spotify.com") || err.code === "ENOTFOUND")) {
        resolver.resolve4(hostname, (resErr, addresses) => {
          if (resErr || !addresses || addresses.length === 0) {
            return callback(err, address, family);
          }
          if (options && options.all) {
            return callback(null, addresses.map((a) => ({ address: a, family: 4 })));
          }
          return callback(null, addresses[0], 4);
        });
        return;
      }
      callback(err, address, family);
    });
  };
}

// In-memory cache for Spotify App Access Token
let tokenCache = {
  token: null,
  expiresAt: 0,
};

// In-memory cache for Spotify search, discovery, and playlist details
// Cache TTL: 5 minutes for search, 15 minutes for discovery, 10 minutes for playlist details
const searchCache = new Map();
const discoveryCache = new Map();
const playlistDetailCache = new Map();
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const DISCOVERY_CACHE_TTL_MS = 15 * 60 * 1000;
const PLAYLIST_CACHE_TTL_MS = 10 * 60 * 1000;

// Rate-limiting backoff tracker for 429 responses
let rateLimitResetTime = 0;

/**
 * Strips HTML tags and decodes common HTML entities
 */
function cleanHtmlText(str) {
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
 * Normalizes country/market code, defaulting strictly to 'IN'
 */
function normalizeMarket(market) {
  const m = (market || process.env.SPOTIFY_MARKET || "IN").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(m) ? m : "IN";
}

/**
 * Formats numeric follower count into readable string (e.g. 1.2M, 450K)
 */
function formatFollowers(count) {
  if (!count || typeof count !== "number" || count <= 0) return null;
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return `${count}`;
}

/**
 * Obtains an application access token using Spotify's Client Credentials OAuth flow.
 * Caches token in memory until expiry (with a 60-second safety window).
 *
 * @returns {Promise<string | null>} Valid access token or null if credentials missing/invalid
 */
export async function getSpotifyAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();

  const hasClientId = Boolean(clientId);
  const hasClientSecret = Boolean(clientSecret);

  if (!hasClientId || !hasClientSecret) {
    console.warn(
      `[Spotify Auth Debug] Credentials check: clientId=${hasClientId ? "CONFIGURED" : "MISSING"}, clientSecret=${hasClientSecret ? "CONFIGURED" : "MISSING"}`
    );
    return null;
  }

  // Check if rate-limited
  if (Date.now() < rateLimitResetTime) {
    console.warn("[Spotify Auth Debug] Rate limited. Temporarily paused requests.");
    return null;
  }

  // Check if cached token is still valid
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  try {
    console.log("[Spotify Auth Debug] Requesting application access token from accounts.spotify.com/api/token");
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
      }),
      // Don't cache auth requests at Next.js fetch layer
      cache: "no-store",
    });

    console.log(`[Spotify Auth Debug] Token endpoint HTTP response status: ${response.status}`);

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("Retry-After") || "5", 10);
        rateLimitResetTime = Date.now() + retryAfter * 1000;
        console.warn(`[Spotify Auth Debug] Auth 429 Rate limited. Retry after ${retryAfter}s`);
      } else {
        const errorText = await response.text().catch(() => "");
        console.warn(`[Spotify Auth Debug] Token request failed [${response.status}]:`, errorText);
      }
      return null;
    }

    const data = await response.json();
    if (!data.access_token) {
      console.warn("[Spotify Auth Debug] Token response missing access_token");
      return null;
    }

    console.log("[Spotify Auth Debug] Successfully obtained access token from Spotify");

    // Cache token with buffer (expires_in is in seconds, typically 3600)
    const expiresInMs = (parseInt(data.expires_in || "3600", 10) - 60) * 1000;
    tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + Math.max(expiresInMs, 60000),
    };

    return tokenCache.token;
  } catch (err) {
    console.warn("[Spotify Auth Debug] Network error during token request:", err?.message || err);
    return null;
  }
}

/**
 * Searches Spotify catalog for Artists and Playlists matching query.
 *
 * @param {string} query Search query string
 * @param {string} [market] ISO 3166-1 alpha-2 country code (default: process.env.SPOTIFY_MARKET or 'IN')
 * @param {number} [limit] Maximum items to return per type (default: 20)
 * @returns {Promise<{ artists: Array<object>, playlists: Array<object> }>}
 */
export async function searchSpotifyCatalog(query, market = "", limit = 20) {
  const cleanQ = (query || "").trim();
  if (!cleanQ) {
    return { artists: [], playlists: [] };
  }

  const resolvedMarket = normalizeMarket(market);
  const cacheKey = `${cleanQ.toLowerCase()}:::${resolvedMarket}:::${limit}`;

  // Check search cache
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
    return cached.data;
  }

  // Safe server-side debug log
  console.log(
    `[Spotify Search Debug] Initiating Spotify search: query="${cleanQ}", market="${resolvedMarket}", limit=${limit}`
  );

  // Get Spotify access token
  const token = await getSpotifyAccessToken();
  if (!token) {
    console.warn("[Spotify Search Debug] Search skipped: Spotify access token is null");
    return { artists: [], playlists: [] };
  }

  // Check rate limiting
  if (Date.now() < rateLimitResetTime) {
    console.warn("[Spotify Search Debug] Search skipped: Currently in rate-limit backoff");
    return { artists: [], playlists: [] };
  }

  try {
    const playlistParams = new URLSearchParams({
      q: cleanQ,
      type: "playlist",
      market: resolvedMarket,
      limit: String(limit),
    });

    const artistParams = new URLSearchParams({
      q: cleanQ,
      type: "artist",
      market: resolvedMarket,
      limit: String(limit),
    });

    console.log(
      `[Spotify Search Debug] Executing Spotify API requests: /search?${playlistParams.toString()} and /search?${artistParams.toString()}`
    );

    // Parallel requests with independent error isolation
    const [playlistSettled, artistSettled] = await Promise.allSettled([
      fetch(`https://api.spotify.com/v1/search?${playlistParams.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        next: { revalidate: 300 },
      }),
      fetch(`https://api.spotify.com/v1/search?${artistParams.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        next: { revalidate: 300 },
      }),
    ]);

    let playlists = [];
    if (playlistSettled.status === "fulfilled") {
      const plResponse = playlistSettled.value;
      console.log(`[Spotify Search Debug] Playlist search HTTP response status: ${plResponse.status}`);
      if (plResponse.ok) {
        const plData = await plResponse.json();
        const rawPlaylists = Array.isArray(plData?.playlists?.items)
          ? plData.playlists.items
          : (Array.isArray(plData?.playlists) ? plData.playlists : []);

        console.log(
          `[Spotify Search Debug] Playlist response keys: [${Object.keys(plData || {}).join(", ")}], items count: ${rawPlaylists.length}`
        );

        playlists = rawPlaylists
          .filter((p) => p && p.id && (p.name || p.title))
          .map((p) => {
            const image = p.images?.[0]?.url || p.images?.[1]?.url || p.images?.[2]?.url || null;
            const name = cleanHtmlText(p.name || p.title || "Spotify Playlist");
            const description = cleanHtmlText(p.description || "");
            const curator = p.owner?.display_name || "Spotify";
            const spotifyUrl = p.external_urls?.spotify || `https://open.spotify.com/playlist/${p.id}`;
            const total = typeof p.tracks?.total === "number" ? p.tracks.total : (p.totalTracks || 0);

            return {
              id: p.id,
              name: name,
              title: name,
              description: description,
              image: image,
              coverUrl: image,
              thumbnail: image,
              curator: curator,
              owner: curator,
              totalTracks: total,
              trackCount: total,
              externalUrl: spotifyUrl,
              spotifyUrl: spotifyUrl,
              spotifyUri: p.uri || `spotify:playlist:${p.id}`,
              source: "spotify",
              type: "playlist",
            };
          });
      } else {
        if (plResponse.status === 401) {
          tokenCache = { token: null, expiresAt: 0 };
        } else if (plResponse.status === 429) {
          const retryAfter = parseInt(plResponse.headers.get("Retry-After") || "5", 10);
          rateLimitResetTime = Date.now() + retryAfter * 1000;
        }
        console.warn(`[Spotify Search Debug] Playlist search returned status ${plResponse.status}`);
      }
    } else {
      console.warn("[Spotify Search Debug] Playlist search fetch error:", playlistSettled.reason?.message || playlistSettled.reason);
    }

    let artists = [];
    if (artistSettled.status === "fulfilled") {
      const artResponse = artistSettled.value;
      console.log(`[Spotify Search Debug] Artist search HTTP response status: ${artResponse.status}`);
      if (artResponse.ok) {
        const artData = await artResponse.json();
        const rawArtists = Array.isArray(artData?.artists?.items)
          ? artData.artists.items
          : (Array.isArray(artData?.artists) ? artData.artists : []);

        console.log(
          `[Spotify Search Debug] Artist response keys: [${Object.keys(artData || {}).join(", ")}], items count: ${rawArtists.length}`
        );

        artists = rawArtists
          .filter((a) => a && a.id && a.name)
          .map((a) => {
            const image = a.images?.[0]?.url || a.images?.[1]?.url || a.images?.[2]?.url || null;
            const name = cleanHtmlText(a.name);
            const spotifyUrl = a.external_urls?.spotify || `https://open.spotify.com/artist/${a.id}`;
            return {
              id: a.id,
              name: name,
              image: image,
              avatar: image,
              genres: a.genres || [],
              followers: a.followers?.total || 0,
              followersFormatted: formatFollowers(a.followers?.total),
              popularity: a.popularity || 0,
              externalUrl: spotifyUrl,
              spotifyUrl: spotifyUrl,
              spotifyUri: a.uri || `spotify:artist:${a.id}`,
              source: "spotify",
              type: "artist",
            };
          });
      } else {
        if (artResponse.status === 401) {
          tokenCache = { token: null, expiresAt: 0 };
        } else if (artResponse.status === 429) {
          const retryAfter = parseInt(artResponse.headers.get("Retry-After") || "5", 10);
          rateLimitResetTime = Date.now() + retryAfter * 1000;
        }
        console.warn(`[Spotify Search Debug] Artist search returned status ${artResponse.status}`);
      }
    } else {
      console.warn("[Spotify Search Debug] Artist search fetch error:", artistSettled.reason?.message || artistSettled.reason);
    }

    const result = { artists, playlists };

    // Update in-memory search cache
    searchCache.set(cacheKey, {
      timestamp: Date.now(),
      data: result,
    });

    // Prune old entries if cache grows too large
    if (searchCache.size > 200) {
      const oldestKey = searchCache.keys().next().value;
      searchCache.delete(oldestKey);
    }

    return result;
  } catch (err) {
    console.warn("[Spotify Search Debug] General search error:", err?.message || err);
    return { artists: [], playlists: [] };
  }
}

/**
 * Retrieves popular/featured Spotify discovery content (Artists & Playlists) for Home Page.
 *
 * @param {string} [market]
 * @returns {Promise<{ artists: Array<object>, playlists: Array<object> }>}
 */
export async function getSpotifyDiscovery(market = "") {
  const resolvedMarket = (market || process.env.SPOTIFY_MARKET || "IN").trim();
  const cacheKey = `discovery:::${resolvedMarket}`;

  const cached = discoveryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < DISCOVERY_CACHE_TTL_MS) {
    return cached.data;
  }

  const token = await getSpotifyAccessToken();
  if (!token) {
    return { artists: [], playlists: [] };
  }

  try {
    // 1. Fetch Featured / Popular Playlists
    let playlists = [];
    try {
      // First try featured playlists endpoint
      const plRes = await fetch(
        `https://api.spotify.com/v1/browse/featured-playlists?market=${resolvedMarket}&limit=16`,
        {
          headers: { Authorization: `Bearer ${token}` },
          next: { revalidate: 900 },
        }
      );

      if (plRes.ok) {
        const plData = await plRes.json();
        const rawPls = plData.playlists?.items || [];
        playlists = rawPls
          .filter((p) => p && p.id && p.name)
          .map((p) => ({
            id: p.id,
            title: cleanHtmlText(p.name),
            name: cleanHtmlText(p.name),
            description: cleanHtmlText(p.description || ""),
            curator: p.owner?.display_name || "Spotify",
            image: p.images?.[0]?.url || null,
            coverUrl: p.images?.[0]?.url || null,
            trackCount: p.tracks?.total || 0,
            spotifyUrl: p.external_urls?.spotify || `https://open.spotify.com/playlist/${p.id}`,
            spotifyUri: p.uri || `spotify:playlist:${p.id}`,
            source: "spotify",
            type: "playlist",
          }));
      }
    } catch (_) { }

    // If featured playlists empty, fallback to search for top playlists
    if (!playlists.length) {
      const searchPlResult = await searchSpotifyCatalog("Top Hits", resolvedMarket, 16);
      playlists = searchPlResult.playlists || [];
    }

    // 2. Fetch Popular / Prominent Artists
    let artists = [];
    try {
      // Search for top global & regional artists in market
      const artSearch = await searchSpotifyCatalog("genre:pop", resolvedMarket, 16);
      artists = artSearch.artists || [];

      // If genre:pop is empty, fallback to trending artist search
      if (!artists.length) {
        const fallbackSearch = await searchSpotifyCatalog("top", resolvedMarket, 16);
        artists = fallbackSearch.artists || [];
      }
    } catch (_) { }

    const result = { artists, playlists };

    discoveryCache.set(cacheKey, {
      timestamp: Date.now(),
      data: result,
    });

    return result;
  } catch (err) {
    console.warn("[Spotify] Discovery error:", err?.message || err);
    return { artists: [], playlists: [] };
  }
}

/**
 * Helper to format seconds to m:ss
 */
function formatDuration(secs) {
  if (isNaN(secs) || secs <= 0) return "3:30";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/**
 * Retrieves official Spotify playlist metadata and authorized tracks.
 * Fully complies with official Spotify Web API policies.
 *
 * @param {string} playlistId - Spotify playlist ID
 * @param {string} [market] - ISO country code
 * @returns {Promise<object>} Playlist metadata & tracks
 */
export async function getSpotifyPlaylist(playlistId, market = "") {
  const cleanId = (playlistId || "").trim();
  if (!cleanId) {
    return {
      success: false,
      error: "Playlist ID required",
      id: "",
      name: "Spotify Playlist",
      description: "",
      artwork: null,
      images: [],
      curator: "Spotify",
      owner: "Spotify",
      spotifyUrl: "https://open.spotify.com",
      totalCount: 0,
      tracksAvailable: false,
      tracks: [],
      items: [],
    };
  }

  const resolvedMarket = (market || process.env.SPOTIFY_MARKET || "IN").trim();
  const cacheKey = `${cleanId}:::${resolvedMarket}`;

  const cached = playlistDetailCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < PLAYLIST_CACHE_TTL_MS) {
    return cached.data;
  }

  const token = await getSpotifyAccessToken();
  if (!token) {
    return {
      success: false,
      error: "Spotify credentials or token unavailable",
      id: cleanId,
      name: "Spotify Playlist",
      description: "",
      artwork: null,
      images: [],
      curator: "Spotify",
      owner: "Spotify",
      spotifyUrl: `https://open.spotify.com/playlist/${cleanId}`,
      totalCount: 0,
      tracksAvailable: false,
      tracks: [],
      items: [],
    };
  }

  try {
    const params = new URLSearchParams();
    if (resolvedMarket) params.set("market", resolvedMarket);

    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(cleanId)}?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        next: { revalidate: 600 },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        tokenCache = { token: null, expiresAt: 0 };
      } else if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("Retry-After") || "5", 10);
        rateLimitResetTime = Date.now() + retryAfter * 1000;
        console.warn(`[Spotify] Playlist 429 Rate limited. Retry after ${retryAfter}s`);
      } else {
        console.warn(`[Spotify] Playlist fetch failed [${response.status}]:`, await response.text().catch(() => ""));
      }

      return {
        success: false,
        error: `Spotify playlist unavailable [${response.status}]`,
        id: cleanId,
        name: "Spotify Playlist",
        description: "",
        artwork: null,
        images: [],
        curator: "Spotify",
        owner: "Spotify",
        spotifyUrl: `https://open.spotify.com/playlist/${cleanId}`,
        totalCount: 0,
        tracksAvailable: false,
        tracks: [],
        items: [],
      };
    }

    const data = await response.json();
    const artwork = data.images?.[0]?.url || null;
    const name = cleanHtmlText(data.name || "Spotify Playlist");
    const description = cleanHtmlText(data.description || "");
    const curator = data.owner?.display_name || "Spotify";
    const spotifyUrl = data.external_urls?.spotify || `https://open.spotify.com/playlist/${cleanId}`;
    const totalCount = data.tracks?.total || 0;

    // Parse authorized tracks if provided by the Spotify API
    const rawItems = Array.isArray(data.tracks?.items) ? data.tracks.items : [];
    const validTracks = [];

    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i];
      const t = item?.track || item;
      if (!t || !t.name) continue;

      const artistNames = (t.artists || []).map((a) => cleanHtmlText(a.name)).filter(Boolean);
      const artistStr = artistNames.join(", ") || "Unknown Artist";
      const cover = t.album?.images?.[0]?.url || t.album?.images?.[1]?.url || artwork || null;
      const durationSec = Math.round((t.duration_ms || 0) / 1000);

      validTracks.push({
        index: i + 1,
        id: t.id || `sp-tr-${i}`,
        title: cleanHtmlText(t.name),
        name: cleanHtmlText(t.name),
        artist: artistStr,
        artists: artistNames,
        primaryArtist: artistNames[0] || artistStr,
        album: cleanHtmlText(t.album?.name || ""),
        coverUrl: cover,
        artwork: cover,
        duration: durationSec,
        durationMs: t.duration_ms || 0,
        durationFormatted: formatDuration(durationSec),
        spotifyUrl: t.external_urls?.spotify || (t.id ? `https://open.spotify.com/track/${t.id}` : null),
        isPlayable: t.is_playable ?? true,
      });
    }

    const result = {
      success: true,
      id: data.id || cleanId,
      name,
      title: name,
      description,
      artwork,
      images: data.images || [],
      curator,
      owner: curator,
      spotifyUrl,
      spotifyUri: data.uri || `spotify:playlist:${cleanId}`,
      totalCount: totalCount || validTracks.length,
      tracksAvailable: validTracks.length > 0,
      tracks: validTracks,
      items: validTracks,
    };

    playlistDetailCache.set(cacheKey, {
      timestamp: Date.now(),
      data: result,
    });

    if (playlistDetailCache.size > 100) {
      const oldestKey = playlistDetailCache.keys().next().value;
      playlistDetailCache.delete(oldestKey);
    }

    return result;
  } catch (err) {
    console.warn("[Spotify] Error fetching playlist details:", err?.message || err);
    return {
      success: false,
      error: err?.message || "Error fetching playlist",
      id: cleanId,
      name: "Spotify Playlist",
      description: "",
      artwork: null,
      images: [],
      curator: "Spotify",
      owner: "Spotify",
      spotifyUrl: `https://open.spotify.com/playlist/${cleanId}`,
      totalCount: 0,
      tracksAvailable: false,
      tracks: [],
      items: [],
    };
  }
}

