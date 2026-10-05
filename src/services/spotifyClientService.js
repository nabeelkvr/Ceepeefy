/**
 * Client Service for Spotify Artist and Playlist Discovery
 * Queries dedicated /api/spotify/search and /api/spotify/discovery endpoints.
 *
 * All Spotify items are strictly for metadata discovery and direct external links.
 * Audio playback is never routed through the Ceepeefy player.
 */

const clientSearchCache = new Map();
const clientPlaylistCache = new Map();
let clientDiscoveryCache = null;
let clientDiscoveryTime = 0;
const DISCOVERY_CLIENT_TTL = 10 * 60 * 1000; // 10 minutes
const PLAYLIST_CLIENT_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Searches Spotify for Artists and Playlists matching query.
 *
 * @param {string} query
 * @param {object} [options]
 * @param {string} [options.market]
 * @returns {Promise<{ artists: Array<object>, playlists: Array<object> }>}
 */
export async function searchSpotify(query, options = {}) {
  const cleanQ = (query || "").trim().toLowerCase();
  if (!cleanQ) {
    return { artists: [], playlists: [] };
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
      return { artists: [], playlists: [] };
    }

    const data = await res.json();
    const result = {
      artists: Array.isArray(data.artists) ? data.artists : [],
      playlists: Array.isArray(data.playlists) ? data.playlists : [],
    };

    clientSearchCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn("[Spotify Client] Search error:", err);
    return { artists: [], playlists: [] };
  }
}

/**
 * Fetches featured/trending Spotify discovery content (Playlists & Artists) for Home Page.
 *
 * @param {object} [options]
 * @param {string} [options.market]
 * @returns {Promise<{ artists: Array<object>, playlists: Array<object> }>}
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
      return { artists: [], playlists: [] };
    }

    const data = await res.json();
    const result = {
      artists: Array.isArray(data.artists) ? data.artists : [],
      playlists: Array.isArray(data.playlists) ? data.playlists : [],
    };

    if (result.artists.length > 0 || result.playlists.length > 0) {
      clientDiscoveryCache = result;
      clientDiscoveryTime = now;
    }

    return result;
  } catch (err) {
    console.warn("[Spotify Client] Discovery error:", err);
    return { artists: [], playlists: [] };
  }
}

/**
 * Fetches official Spotify playlist metadata and track items.
 *
 * @param {string} playlistId
 * @param {object} [options]
 * @param {string} [options.market]
 * @returns {Promise<object>}
 */
export async function fetchSpotifyPlaylist(playlistId, options = {}) {
  const cleanId = (playlistId || "").trim();
  if (!cleanId) {
    return {
      success: false,
      error: "Playlist ID required",
      id: "",
      name: "Spotify Playlist",
      artwork: null,
      curator: "Spotify",
      spotifyUrl: "https://open.spotify.com",
      totalCount: 0,
      tracksAvailable: false,
      tracks: [],
    };
  }

  const market = options.market || "";
  const cacheKey = `${cleanId}:::${market}`;
  const now = Date.now();

  const cached = clientPlaylistCache.get(cacheKey);
  if (cached && now - cached.timestamp < PLAYLIST_CLIENT_TTL) {
    return cached.data;
  }

  try {
    const params = new URLSearchParams();
    if (market) params.set("market", market);

    const queryStr = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`/api/spotify/playlist/${encodeURIComponent(cleanId)}${queryStr}`);

    if (!res.ok) {
      console.warn(`[Spotify Client] Playlist fetch failed [${res.status}]`);
      return {
        success: false,
        error: `Playlist unavailable [${res.status}]`,
        id: cleanId,
        name: "Spotify Playlist",
        artwork: null,
        curator: "Spotify",
        spotifyUrl: `https://open.spotify.com/playlist/${cleanId}`,
        totalCount: 0,
        tracksAvailable: false,
        tracks: [],
      };
    }

    const data = await res.json();
    const result = {
      success: data.success !== false,
      id: data.id || cleanId,
      name: data.name || data.title || "Spotify Playlist",
      title: data.name || data.title || "Spotify Playlist",
      description: data.description || "",
      artwork: data.artwork || data.images?.[0]?.url || null,
      images: data.images || [],
      curator: data.curator || data.owner || "Spotify",
      owner: data.owner || data.curator || "Spotify",
      spotifyUrl: data.spotifyUrl || `https://open.spotify.com/playlist/${cleanId}`,
      spotifyUri: data.spotifyUri || `spotify:playlist:${cleanId}`,
      totalCount: data.totalCount || data.totalTracks || (Array.isArray(data.tracks) ? data.tracks.length : 0),
      tracksAvailable: Boolean(data.tracksAvailable && Array.isArray(data.tracks) && data.tracks.length > 0),
      tracks: Array.isArray(data.tracks) ? data.tracks : (Array.isArray(data.items) ? data.items : []),
    };

    clientPlaylistCache.set(cacheKey, {
      timestamp: now,
      data: result,
    });

    return result;
  } catch (err) {
    console.warn("[Spotify Client] Playlist error:", err);
    return {
      success: false,
      error: err?.message || "Failed to load Spotify playlist",
      id: cleanId,
      name: "Spotify Playlist",
      artwork: null,
      curator: "Spotify",
      spotifyUrl: `https://open.spotify.com/playlist/${cleanId}`,
      totalCount: 0,
      tracksAvailable: false,
      tracks: [],
    };
  }
}

