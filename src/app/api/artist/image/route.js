import { NextResponse } from "next/server";

// In-memory cache for artist images across requests
const artistImageCache = new Map();

/**
 * Normalizes artist name for cache keys and queries
 */
function normalizeName(name) {
  return (name || "").trim().toLowerCase();
}

/**
 * Cleans HTML entities and special characters from strings
 */
function cleanText(str) {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/**
 * GET /api/artist/image?name=<artistName>
 *
 * 1. Queries JioSaavn getArtistResults for the artist profile photo.
 * 2. Replaces 50x50 / 150x150 with 500x500 for crisp high-resolution portrait.
 * 3. Falls back to iTunes Search API if JioSaavn returns no photo or default placeholder.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawName =
    searchParams.get("name")?.trim() ||
    searchParams.get("artist")?.trim() ||
    searchParams.get("query")?.trim() ||
    "";

  if (!rawName) {
    return NextResponse.json({ error: "Artist name is required" }, { status: 400 });
  }

  const returnAll = searchParams.get("all") === "true";
  const cacheKey = normalizeName(rawName);

  if (!returnAll && artistImageCache.has(cacheKey)) {
    return NextResponse.json({
      name: rawName,
      image: artistImageCache.get(cacheKey),
      cached: true,
    }, {
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" }
    });
  }

  // 1. Primary: JioSaavn Artist Search API
  try {
    const jioSaavnUrl = `https://www.jiosaavn.com/api.php?__call=search.getArtistResults&_format=json&p=1&n=8&q=${encodeURIComponent(rawName)}`;
    const jioRes = await fetch(jioSaavnUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
      },
      next: { revalidate: 86400 },
    });

    if (jioRes.ok) {
      const jioData = await jioRes.json();
      const results = jioData?.results || [];

      if (returnAll) {
        const validArtists = [];
        for (const item of results) {
          const img = item.image;
          if (
            img &&
            !img.includes("artist-default") &&
            !img.includes("default-film") &&
            !img.includes("default-music")
          ) {
            validArtists.push({
              id: `artist-${(item.name || "").toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
              name: cleanText(item.name || rawName),
              image: img.replace(/50x50|150x150/, "500x500"),
              role: item.role || "Artist",
              source: "jiosaavn",
            });
          }
        }
        if (validArtists.length > 0) {
          return NextResponse.json({
            results: validArtists,
          }, {
            headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" }
          });
        }
      }

      // Find best match that is not a placeholder icon
      for (const item of results) {
        const img = item.image;
        if (
          img &&
          !img.includes("artist-default") &&
          !img.includes("default-film") &&
          !img.includes("default-music")
        ) {
          // Upgrade resolution to 500x500
          const highResUrl = img.replace(/50x50|150x150/, "500x500");
          artistImageCache.set(cacheKey, highResUrl);
          return NextResponse.json({
            name: cleanText(item.name || rawName),
            image: highResUrl,
            source: "jiosaavn",
          }, {
            headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" }
          });
        }
      }
    }
  } catch (err) {
    console.warn(`JioSaavn artist search failed for "${rawName}":`, err.message);
  }

  // 2. Secondary: JioSaavn Song Search fallback (top track cover)
  try {
    const songSearchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&p=1&n=3&q=${encodeURIComponent(rawName)}`;
    const songRes = await fetch(songSearchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
      },
      next: { revalidate: 86400 },
    });

    if (songRes.ok) {
      const songData = await songRes.json();
      const topSong = songData?.results?.[0];
      if (topSong && topSong.image && !topSong.image.includes("default")) {
        const highResUrl = topSong.image.replace(/150x150|50x50/, "500x500");
        artistImageCache.set(cacheKey, highResUrl);
        return NextResponse.json({
          name: rawName,
          image: highResUrl,
          source: "jiosaavn_track",
        }, {
          headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" }
        });
      }
    }
  } catch (err) {
    console.warn(`JioSaavn track fallback search failed for "${rawName}":`, err.message);
  }

  // 3. Public API Fallback: iTunes Search API
  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(rawName)}&entity=musicArtist&limit=1`;
    const itunesRes = await fetch(itunesUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      },
      next: { revalidate: 86400 },
    });

    if (itunesRes.ok) {
      const itunesData = await itunesRes.json();
      const firstArtist = itunesData?.results?.[0];
      const artwork =
        firstArtist?.artworkUrl100?.replace("100x100bb", "600x600bb") ||
        firstArtist?.artworkUrl60;

      if (artwork) {
        artistImageCache.set(cacheKey, artwork);
        return NextResponse.json({
          name: rawName,
          image: artwork,
          source: "itunes",
        }, {
          headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" }
        });
      }
    }
  } catch (err) {
    console.warn(`iTunes fallback failed for "${rawName}":`, err.message);
  }

  // If all APIs fail or return no profile photo, cache null and return null
  artistImageCache.set(cacheKey, null);
  return NextResponse.json({
    name: rawName,
    image: null,
    source: "none",
  });
}
