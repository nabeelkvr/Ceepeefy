import { NextResponse } from "next/server";
import { NOCTURNE_TRACKS } from "../../../../data/nocturneData";

// In-memory cache for fetched lyrics
const lyricsCache = new Map();

/**
 * Strips HTML tags and decodes common HTML entities
 */
function cleanLyricsText(str) {
  if (!str) return "";
  return str
    .replace(/<br\s*\/?>/gi, "\n")
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
 * Parses LRC formatted string into [{ time: number, text: string }]
 */
function parseLrcFormat(lrcContent) {
  if (!lrcContent || typeof lrcContent !== "string") return [];
  const lines = lrcContent.split("\n");
  const result = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Matches [mm:ss.xx] or [mm:ss]
    const match = trimmed.match(/^\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\](.*)$/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      const text = match[3].trim();
      const timeInSeconds = parseFloat((minutes * 60 + seconds).toFixed(2));
      if (text) {
        result.push({ time: timeInSeconds, text });
      }
    }
  }

  // Ensure chronological order
  result.sort((a, b) => a.time - b.time);
  return result;
}

/**
 * Converts plain text lines into timestamped objects distributed proportionally across duration
 */
function distributePlainLyrics(rawText, durationSec = 210) {
  const cleaned = cleanLyricsText(rawText);
  if (!cleaned) return [];

  const rawLines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean);
  if (rawLines.length === 0) return [];

  const totalLines = rawLines.length;
  const introOffset = 3.0; // Assume 3 second instrumental intro
  const effectiveDuration = Math.max(durationSec - 5, introOffset + totalLines * 1.5);
  const timePerLine = (effectiveDuration - introOffset) / totalLines;

  return rawLines.map((text, idx) => ({
    time: parseFloat((introOffset + idx * timePerLine).toFixed(2)),
    text,
  }));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim() || "";
  const title = (searchParams.get("track") || searchParams.get("title") || "").trim();
  const artist = searchParams.get("artist")?.trim() || "";
  const rawDuration = parseFloat(searchParams.get("duration") || "0");
  const durationSec = !isNaN(rawDuration) && rawDuration > 10 ? rawDuration : 210;

  const cacheKey = `${id}:::${title.toLowerCase()}:::${artist.toLowerCase()}`;
  if (lyricsCache.has(cacheKey)) {
    return NextResponse.json(lyricsCache.get(cacheKey));
  }

  // 1. Try LRCLIB for millisecond-precision synchronized LRC lyrics
  if (title) {
    try {
      const cleanTitle = title.replace(/\s*[\(\[].*?[\)\]]/g, "").trim();
      const primaryArtist = (artist.split(/[,&/]|feat\.?|ft\.?/i)[0] || artist).trim();

      // 1a. Direct exact lookup
      const lrclibParams = new URLSearchParams({
        track_name: cleanTitle,
        artist_name: primaryArtist,
      });
      if (durationSec > 0) {
        lrclibParams.set("duration", Math.round(durationSec).toString());
      }

      const lrcRes = await fetch(`https://lrclib.net/api/get?${lrclibParams.toString()}`, {
        headers: {
          "User-Agent": "Ceepeefy-Music-Player/1.0",
          Accept: "application/json",
        },
        next: { revalidate: 3600 },
      });

      if (lrcRes.ok) {
        const lrcData = await lrcRes.json();
        if (lrcData && lrcData.syncedLyrics) {
          const parsed = parseLrcFormat(lrcData.syncedLyrics);
          if (parsed.length > 0) {
            const responseData = {
              success: true,
              source: "lrclib",
              synced: true,
              lines: parsed,
              lyrics: parsed,
              raw: lrcData.syncedLyrics,
            };
            lyricsCache.set(cacheKey, responseData);
            return NextResponse.json(responseData);
          }
        }
      }

      // 1b. Fuzzy search lookup on LRCLIB
      const searchRes = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle + " " + primaryArtist)}`,
        {
          headers: {
            "User-Agent": "Ceepeefy-Music-Player/1.0",
            Accept: "application/json",
          },
          next: { revalidate: 3600 },
        }
      );

      if (searchRes.ok) {
        const searchResults = await searchRes.json();
        if (Array.isArray(searchResults) && searchResults.length > 0) {
          // Look for first item with synced lyrics
          const syncedItem = searchResults.find((item) => item.syncedLyrics);
          if (syncedItem) {
            const parsed = parseLrcFormat(syncedItem.syncedLyrics);
            if (parsed.length > 0) {
              const responseData = {
                success: true,
                source: "lrclib_search",
                synced: true,
                lines: parsed,
                lyrics: parsed,
                raw: syncedItem.syncedLyrics,
              };
              lyricsCache.set(cacheKey, responseData);
              return NextResponse.json(responseData);
            }
          }

          // Otherwise look for first item with plain lyrics
          const plainItem = searchResults.find((item) => item.plainLyrics);
          if (plainItem) {
            const distributed = distributePlainLyrics(plainItem.plainLyrics, durationSec);
            if (distributed.length > 0) {
              const responseData = {
                success: true,
                source: "lrclib_plain",
                synced: true,
                lines: distributed,
                lyrics: distributed,
                raw: plainItem.plainLyrics,
              };
              lyricsCache.set(cacheKey, responseData);
              return NextResponse.json(responseData);
            }
          }
        }
      }
    } catch (err) {
      console.warn("LRCLIB fetch error:", err);
    }
  }

  // 2. Try JioSaavn official lyrics endpoint (lyrics.getLyrics)
  if (id) {
    try {
      const saavnUrl = `https://www.jiosaavn.com/api.php?__call=lyrics.getLyrics&ctx=web6dot0&api_version=4&_format=json&_marker=0&lyrics_id=${encodeURIComponent(id)}`;
      const saavnRes = await fetch(saavnUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
        next: { revalidate: 3600 },
      });

      if (saavnRes.ok) {
        const saavnData = await saavnRes.json();
        if (saavnData && saavnData.lyrics && typeof saavnData.lyrics === "string") {
          const raw = saavnData.lyrics;
          if (raw.includes("[00:") || raw.includes("[01:")) {
            const parsed = parseLrcFormat(cleanLyricsText(raw));
            if (parsed.length > 0) {
              const responseData = {
                success: true,
                source: "jiosaavn_synced",
                synced: true,
                lines: parsed,
                lyrics: parsed,
                raw,
              };
              lyricsCache.set(cacheKey, responseData);
              return NextResponse.json(responseData);
            }
          }

          const distributed = distributePlainLyrics(raw, durationSec);
          if (distributed.length > 0) {
            const responseData = {
              success: true,
              source: "jiosaavn",
              synced: true,
              lines: distributed,
              lyrics: distributed,
              copyright: saavnData.lyrics_copyright || "Lyrics powered by JioSaavn",
              raw: cleanLyricsText(raw),
            };
            lyricsCache.set(cacheKey, responseData);
            return NextResponse.json(responseData);
          }
        }
      }
    } catch (err) {
      console.warn("JioSaavn lyrics.getLyrics error:", err);
    }
  }

  // 3. Fallback to Nocturne mock tracks lyrics if available
  const mockTrack = NOCTURNE_TRACKS.find(
    (t) =>
      t.id === id ||
      (title && t.title?.toLowerCase() === title.toLowerCase()) ||
      (artist && t.artist?.toLowerCase() === artist.toLowerCase())
  );

  if (mockTrack && mockTrack.lyrics) {
    const rawMock = mockTrack.lyrics;
    const isLrc = rawMock.includes("[00:") || rawMock.includes("[01:");
    const parsed = isLrc
      ? parseLrcFormat(rawMock)
      : distributePlainLyrics(rawMock, durationSec);

    if (parsed.length > 0) {
      const responseData = {
        success: true,
        source: "mock",
        synced: true,
        lyrics: parsed,
        raw: rawMock,
      };
      lyricsCache.set(cacheKey, responseData);
      return NextResponse.json(responseData);
    }
  }

  // 4. No lyrics available
  const notFoundData = {
    success: false,
    source: null,
    synced: false,
    lyrics: [],
    message: "No lyrics recorded for this track",
  };
  lyricsCache.set(cacheKey, notFoundData);
  return NextResponse.json(notFoundData);
}
