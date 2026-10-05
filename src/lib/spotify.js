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

// In-memory cache for Spotify search and discovery (Artists only)
// Cache TTL: 5 minutes for search, 15 minutes for discovery
const searchCache = new Map();
const discoveryCache = new Map();
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const DISCOVERY_CACHE_TTL_MS = 15 * 60 * 1000;

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
 * Searches Spotify catalog for Artists matching query.
 *
 * @param {string} query Search query string
 * @param {string} [market] ISO 3166-1 alpha-2 country code (default: process.env.SPOTIFY_MARKET or 'IN')
 * @param {number} [limit] Maximum items to return per type (default: 20)
 * @returns {Promise<{ artists: Array<object> }>}
 */
export async function searchSpotifyCatalog(query, market = "", limit = 20) {
  const cleanQ = (query || "").trim();
  if (!cleanQ) {
    return { artists: [] };
  }

  const resolvedMarket = normalizeMarket(market);
  const cacheKey = `${cleanQ.toLowerCase()}:::${resolvedMarket}:::${limit}`;

  // Check search cache
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
    return cached.data;
  }

  console.log(
    `[Spotify Search Debug] Initiating Spotify artist search: query="${cleanQ}", market="${resolvedMarket}", limit=${limit}`
  );

  // Get Spotify access token
  const token = await getSpotifyAccessToken();
  if (!token) {
    console.warn("[Spotify Search Debug] Search skipped: Spotify access token is null");
    return { artists: [] };
  }

  // Check rate limiting
  if (Date.now() < rateLimitResetTime) {
    console.warn("[Spotify Search Debug] Search skipped: Currently in rate-limit backoff");
    return { artists: [] };
  }

  try {
    const artistParams = new URLSearchParams({
      q: cleanQ,
      type: "artist",
      market: resolvedMarket,
      limit: String(limit),
    });

    const artResponse = await fetch(`https://api.spotify.com/v1/search?${artistParams.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      next: { revalidate: 300 },
    });

    console.log(`[Spotify Search Debug] Artist search HTTP response status: ${artResponse.status}`);

    let artists = [];
    if (artResponse.ok) {
      const artData = await artResponse.json();
      const rawArtists = Array.isArray(artData?.artists?.items)
        ? artData.artists.items
        : (Array.isArray(artData?.artists) ? artData.artists : []);

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

    const result = { artists };

    // Update in-memory search cache
    searchCache.set(cacheKey, {
      timestamp: Date.now(),
      data: result,
    });

    if (searchCache.size > 200) {
      const oldestKey = searchCache.keys().next().value;
      searchCache.delete(oldestKey);
    }

    return result;
  } catch (err) {
    console.warn("[Spotify Search Debug] General search error:", err?.message || err);
    return { artists: [] };
  }
}

/**
 * Retrieves popular/featured Spotify discovery content (Artists only) for Home Page.
 *
 * @param {string} [market]
 * @returns {Promise<{ artists: Array<object> }>}
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
    return { artists: [] };
  }

  try {
    let artists = [];
    try {
      const artSearch = await searchSpotifyCatalog("genre:pop", resolvedMarket, 16);
      artists = artSearch.artists || [];

      if (!artists.length) {
        const fallbackSearch = await searchSpotifyCatalog("top", resolvedMarket, 16);
        artists = fallbackSearch.artists || [];
      }
    } catch (_) {}

    const result = { artists };

    discoveryCache.set(cacheKey, {
      timestamp: Date.now(),
      data: result,
    });

    return result;
  } catch (err) {
    console.warn("[Spotify] Discovery error:", err?.message || err);
    return { artists: [] };
  }
}

