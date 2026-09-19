import { NextResponse } from "next/server";

// In-memory cache for live trending artists
let cachedTrendingData = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

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

function slugify(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function GET() {
  const now = Date.now();
  if (cachedTrendingData && now - lastCacheTime < CACHE_TTL_MS) {
    return NextResponse.json(cachedTrendingData, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
    });
  }

  try {
    const launchUrl = "https://www.jiosaavn.com/api.php?__call=webapi.getLaunchData&_format=json";
    const res = await fetch(launchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      throw new Error(`JioSaavn launch data failed with status ${res.status}`);
    }

    const data = await res.json();
    const newTrending = data.new_trending || [];
    const artistMapAgg = new Map();

    // Extract artists from trending tracks
    for (const item of newTrending) {
      if (item.type === "song" && item.details) {
        const details = item.details;
        const songLang = (details.language || "hindi").toLowerCase();
        
        // Map artistMap object { "A.R. Rahman": "456269" }
        if (details.artistMap && typeof details.artistMap === "object") {
          for (const [artistName, artistId] of Object.entries(details.artistMap)) {
            const cleanName = cleanHtmlText(artistName);
            if (!cleanName || cleanName.length < 2) continue;
            const slug = slugify(cleanName);
            if (!artistMapAgg.has(slug)) {
              artistMapAgg.set(slug, {
                id: `artist-${slug}`,
                name: cleanName,
                saavnId: artistId,
                role: "Artist",
                genre: songLang === "tamil" ? "Tamil" : songLang === "malayalam" ? "Malayalam" : songLang === "punjabi" ? "Punjabi" : "Trending",
                category: "Trending Now",
                categories: ["Trending Now", songLang === "tamil" ? "Tamil" : songLang === "malayalam" ? "Malayalam" : songLang === "hindi" ? "Hindi" : "Rap"],
                avatar: null, // will resolve via ArtistAvatar or image API
                trendingScore: 1,
              });
            } else {
              artistMapAgg.get(slug).trendingScore += 1;
            }
          }
        } else if (details.primary_artists) {
          const names = details.primary_artists.split(",").map((s) => cleanHtmlText(s.trim()));
          for (const name of names) {
            if (!name || name.length < 2) continue;
            const slug = slugify(name);
            if (!artistMapAgg.has(slug)) {
              artistMapAgg.set(slug, {
                id: `artist-${slug}`,
                name,
                role: "Artist",
                genre: songLang === "tamil" ? "Tamil" : songLang === "malayalam" ? "Malayalam" : songLang === "hindi" ? "Hindi" : "Trending",
                category: "Trending Now",
                categories: ["Trending Now", songLang === "tamil" ? "Tamil" : songLang === "malayalam" ? "Malayalam" : songLang === "hindi" ? "Hindi" : "Rap"],
                avatar: null,
                trendingScore: 1,
              });
            } else {
              artistMapAgg.get(slug).trendingScore += 1;
            }
          }
        }
      }
    }

    const liveArtists = Array.from(artistMapAgg.values())
      .sort((a, b) => b.trendingScore - a.trendingScore);

    cachedTrendingData = {
      success: true,
      artists: liveArtists,
      date: new Date().toISOString().split("T")[0],
      count: liveArtists.length,
    };
    lastCacheTime = now;

    return NextResponse.json(cachedTrendingData);
  } catch (err) {
    console.error("Live trending artists fetch error:", err);
    return NextResponse.json({
      success: false,
      artists: [],
      error: err.message,
    });
  }
}
