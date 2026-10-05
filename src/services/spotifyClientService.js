/**
 * Client Service for Spotify Artist and Playlist Discovery
 * Queries dedicated /api/spotify/search and /api/spotify/discovery endpoints.
 *
 * All Spotify items are strictly for metadata discovery and direct external links.
 * Audio playback is never routed through the Ceepeefy player.
 */

const clientSearchCache = new Map();
let clientDiscoveryCache = null;
let clientDiscoveryTime = 0;
const DISCOVERY_CLIENT_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Searches Spotify for Artists matching query.
 *
 * @param {string} query
 * @param {object} [options]
 * @param {string} [options.market]
 * @returns {Promise<{ artists: Array<object> }>}
 */
export async function searchSpotify(query, options = {}) {
  const cleanQ = (query || "").trim().toLowerCase();
  if (!cleanQ) {
    return { artists: [] };
  }

  const market = options.market || "";
  const cacheKey = `${cleanQ}:::${market}`;

  if (clientSearchCache.has(cacheKey)) {
    return clientSearchCache.get(cacheKey);
  }

  try {
    const params = new URLSearchParams({ q: cleanQ });
    if (market) params.set("market", market);

    const res = await fetch(`/api/spotify/search?${params.toString()}`);
    if (!res.ok) {
      console.warn(`[Spotify Client] Search failed with status: ${res.status}`);
      return { artists: [] };
    }

    const data = await res.json();
    const result = {
      artists: Array.isArray(data.artists) ? data.artists : [],
    };

    clientSearchCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn("[Spotify Client] Search error:", err);
    return { artists: [] };
  }
}

/**
 * Fetches featured/trending Spotify discovery content (Artists) for Home Page.
 *
 * @param {object} [options]
 * @param {string} [options.market]
 * @returns {Promise<{ artists: Array<object> }>}
 */
export async function fetchSpotifyDiscovery(options = {}) {
  const now = Date.now();
  if (clientDiscoveryCache && now - clientDiscoveryTime < DISCOVERY_CLIENT_TTL) {
    return clientDiscoveryCache;
  }

  try {
    const params = new URLSearchParams();
    if (options.market) params.set("market", options.market);

    const res = await fetch(`/api/spotify/discovery?${params.toString()}`);
    if (!res.ok) {
      return { artists: [] };
    }

    const data = await res.json();
    const result = {
      artists: Array.isArray(data.artists) ? data.artists : [],
    };

    if (result.artists.length > 0) {
      clientDiscoveryCache = result;
      clientDiscoveryTime = now;
    }

    return result;
  } catch (err) {
    console.warn("[Spotify Client] Discovery error:", err);
    return { artists: [] };
  }
}

