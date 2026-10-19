/**
 * JioSaavn Primary Lyrics Provider Adapter
 *
 * Implements Section 3 (Provider 1):
 * - Direct ID lookup
 * - Song details lyrics_id extraction
 * - Search-assisted matching for alternative provider IDs
 * - LRC format parsing & distributed line mapping
 * - Safe error handling & HTML decoding
 */

import { BaseLyricsProvider } from "./baseProvider.js";
import { PROVIDER_NAMES, REJECTION_REASONS } from "../types.js";
import { cleanLyricsString } from "../textProcessor.js";
import { evaluateCandidateMatch, normalizeSongTitle, parseDurationSec } from "../songMatcher.js";

function parseLrcFormat(lrcContent) {
  if (!lrcContent || typeof lrcContent !== "string") return [];
  const lines = lrcContent.split("\n");
  const result = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\](.*)$/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      const text = cleanLyricsString(match[3]);
      const timeInSeconds = parseFloat((minutes * 60 + seconds).toFixed(2));
      if (text) {
        result.push({ time: timeInSeconds, text });
      }
    }
  }

  result.sort((a, b) => a.time - b.time);
  return result;
}

function distributePlainLyrics(rawText, durationSec = 210) {
  const cleaned = cleanLyricsString(rawText);
  if (!cleaned) return [];

  const rawLines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean);
  if (rawLines.length === 0) return [];

  const totalLines = rawLines.length;
  const introOffset = 3.0;
  const effectiveDuration = Math.max(durationSec - 5, introOffset + totalLines * 1.5);
  const timePerLine = (effectiveDuration - introOffset) / totalLines;

  return rawLines.map((text, idx) => ({
    time: parseFloat((introOffset + idx * timePerLine).toFixed(2)),
    text,
  }));
}

export class JioSaavnProvider extends BaseLyricsProvider {
  constructor() {
    super(PROVIDER_NAMES.JIOSAAVN, 1); // Highest priority (Primary)
  }

  async fetchLyrics(seedTrack, options = {}) {
    const cleanId = String(seedTrack.id || "").replace(/^track-/, "").trim();
    const cleanTitle = normalizeSongTitle(seedTrack.title || "");
    const durationSec = parseDurationSec(seedTrack.duration);

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "application/json",
    };

    const fetchTimeoutMs = options.timeoutMs || 2500;

    const tryFetchLyricsById = async (lyricsId) => {
      if (!lyricsId) return null;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);

        const url = `https://www.jiosaavn.com/api.php?__call=lyrics.getLyrics&ctx=web6dot0&api_version=4&_format=json&_marker=0&lyrics_id=${encodeURIComponent(lyricsId)}`;
        const res = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) return null;
        const data = await res.json().catch(() => null);
        if (data && data.lyrics && typeof data.lyrics === "string" && data.lyrics.trim().length > 0) {
          return data;
        }
      } catch (_) {}
      return null;
    };

    // 1. Direct ID lookup
    let saavnData = null;
    let providerTrackId = cleanId;

    if (cleanId) {
      saavnData = await tryFetchLyricsById(cleanId);
    }

    // 2. Song Details lookup (extracting more_info.lyrics_id if has_lyrics is true)
    if (!saavnData && cleanId) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
        const detailUrl = `https://www.jiosaavn.com/api.php?__call=song.getDetails&_format=json&pids=${encodeURIComponent(cleanId)}`;
        const detailRes = await fetch(detailUrl, { headers, signal: controller.signal });
        clearTimeout(timeout);

        if (detailRes.ok) {
          const detailData = await detailRes.json().catch(() => null);
          const songObj = detailData?.[cleanId] || (detailData?.songs && detailData.songs[0]);
          if (songObj) {
            const hasLyrics = songObj.more_info?.has_lyrics === "true" || songObj.has_lyrics === "true" || songObj.has_lyrics === true;
            const extLyricsId = songObj.more_info?.lyrics_id || songObj.lyrics_id;
            if (hasLyrics && extLyricsId) {
              saavnData = await tryFetchLyricsById(extLyricsId);
              if (saavnData) providerTrackId = extLyricsId;
            }
          }
        }
      } catch (_) {}
    }

    // 3. Search-assisted fallback for tracks from playlists / external IDs
    if (!saavnData && cleanTitle) {
      const searchQueries = [
        `${seedTrack.title || ""} ${seedTrack.artist || ""}`.trim(),
        (seedTrack.title || "").trim(),
      ].filter((q, idx, arr) => q.length > 0 && arr.indexOf(q) === idx);

      for (const query of searchQueries) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
          const searchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&p=1&n=5&q=${encodeURIComponent(query)}`;
          const searchRes = await fetch(searchUrl, { headers, signal: controller.signal });
          clearTimeout(timeout);

          if (searchRes.ok) {
            const sData = await searchRes.json().catch(() => null);
            const results = sData?.results || [];
            for (const item of results) {
              const hasLyrics =
                item.has_lyrics === "true" ||
                item.has_lyrics === true ||
                item.more_info?.has_lyrics === "true" ||
                item.more_info?.has_lyrics === true;
              if (!hasLyrics) continue;

              const matchEval = evaluateCandidateMatch(seedTrack, {
                title: item.song || item.title,
                artist: item.primary_artists || item.more_info?.primary_artists || item.singers,
                album: item.album || item.more_info?.album,
                duration: item.duration || item.more_info?.duration,
              });

              if (matchEval.isValid) {
                const targetId = item.id || item.more_info?.lyrics_id;
                saavnData = await tryFetchLyricsById(targetId);
                if (saavnData) {
                  providerTrackId = targetId;
                  break;
                }
              }
            }
          }
        } catch (_) {}
        if (saavnData) break;
      }
    }

    if (!saavnData || !saavnData.lyrics) {
      return {
        found: false,
        rejectionReason: REJECTION_REASONS.EMPTY_LYRICS,
      };
    }

    const raw = saavnData.lyrics;
    const isSynced = raw.includes("[00:") || raw.includes("[01:");
    const lines = isSynced ? parseLrcFormat(cleanLyricsString(raw)) : distributePlainLyrics(raw, durationSec);

    if (lines.length === 0) {
      return {
        found: false,
        rejectionReason: REJECTION_REASONS.EMPTY_LYRICS,
      };
    }

    return {
      found: true,
      provider: this.name,
      providerTrackId,
      synced: isSynced,
      lines,
      rawLyrics: cleanLyricsString(raw),
      attribution: "Lyrics provided by JioSaavn",
      copyright: saavnData.lyrics_copyright || "Copyright JioSaavn",
      matchConfidence: 95,
    };
  }
}
