/**
 * LRCLIB Secondary Lyrics Provider Adapter
 *
 * Implements Section 3 (Provider 2):
 * - Authorized open REST API for community synchronized and plain lyrics
 * - Exact and fuzzy search fallbacks
 * - Strict candidate verification & duration match
 * - Millisecond-precision LRC parsing
 */

import { BaseLyricsProvider } from "./baseProvider.js";
import { PROVIDER_NAMES, REJECTION_REASONS } from "../types.js";
import { cleanLyricsString } from "../textProcessor.js";
import { evaluateCandidateMatch, normalizeSongTitle, parseDurationSec, extractArtistNames } from "../songMatcher.js";

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

export class LrclibProvider extends BaseLyricsProvider {
  constructor() {
    super(PROVIDER_NAMES.LRCLIB, 2); // Secondary priority
  }

  async fetchLyrics(seedTrack, options = {}) {
    const cleanTitle = normalizeSongTitle(seedTrack.title || "");
    const primaryArtist = (seedTrack.artist || "").split(/[,&/]|feat\.?|ft\.?/i)[0].trim();
    const durationSec = parseDurationSec(seedTrack.duration);

    if (!cleanTitle) {
      return { found: false, rejectionReason: REJECTION_REASONS.TITLE_MISMATCH };
    }

    const headers = {
      "User-Agent": "Ceepeefy-Music-Player/1.0 (https://github.com/nabeelkvr/Ceepeefy)",
      Accept: "application/json",
    };

    const fetchTimeoutMs = options.timeoutMs || 3500;

    const safeFetch = async (url) => {
      let attempts = 0;
      while (attempts < 2) {
        attempts++;
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
          const res = await fetch(url, { headers, signal: controller.signal });
          clearTimeout(timeout);

          if (res.status === 503 || res.status === 429) {
            if (attempts < 2) {
              await new Promise((resolve) => setTimeout(resolve, 300));
              continue;
            }
          }
          return res;
        } catch (err) {
          if (attempts >= 2) return null;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      return null;
    };

    // 1. Direct Exact Lookup
    try {
      const getParams = new URLSearchParams({
        track_name: seedTrack.title || "",
        artist_name: primaryArtist,
      });
      if (seedTrack.album) getParams.set("album_name", seedTrack.album);
      if (durationSec > 0) getParams.set("duration", Math.round(durationSec).toString());

      const res = await safeFetch(`https://lrclib.net/api/get?${getParams.toString()}`);

      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data) {
          const evalResult = evaluateCandidateMatch(seedTrack, {
            title: data.trackName,
            artist: data.artistName,
            album: data.albumName,
            duration: data.duration,
            isInstrumental: data.instrumental,
          });

          if (evalResult.isValid) {
            if (data.syncedLyrics) {
              const lines = parseLrcFormat(data.syncedLyrics);
              if (lines.length > 0) {
                return {
                  found: true,
                  provider: this.name,
                  providerTrackId: String(data.id || ""),
                  synced: true,
                  lines,
                  rawLyrics: data.syncedLyrics,
                  attribution: "Synchronized lyrics powered by LRCLIB",
                  matchConfidence: evalResult.confidence,
                };
              }
            } else if (data.plainLyrics) {
              const lines = distributePlainLyrics(data.plainLyrics, durationSec || 210);
              if (lines.length > 0) {
                return {
                  found: true,
                  provider: this.name,
                  providerTrackId: String(data.id || ""),
                  synced: false,
                  lines,
                  rawLyrics: data.plainLyrics,
                  attribution: "Lyrics powered by LRCLIB",
                  matchConfidence: evalResult.confidence,
                };
              }
            }
          }
        }
      }
    } catch (_) {}

    // 2. Search Lookup (Title + Artist, and fallback to Title alone, and Title + Album)
    const searchQueries = [
      `${seedTrack.title || ""} ${primaryArtist}`.trim(),
      seedTrack.album ? `${seedTrack.title || ""} ${seedTrack.album}`.trim() : null,
      (seedTrack.title || "").trim(),
    ].filter((q, idx, arr) => q && q.length > 0 && arr.indexOf(q) === idx);

    for (const query of searchQueries) {
      try {
        const searchRes = await safeFetch(
          `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`
        );

        if (searchRes && searchRes.ok) {
          const searchResults = await searchRes.json().catch(() => null);
          if (Array.isArray(searchResults) && searchResults.length > 0) {
            // Sort results by evaluation match confidence
            const evaluated = searchResults
              .map((item) => ({
                item,
                evaluation: evaluateCandidateMatch(seedTrack, {
                  title: item.trackName,
                  artist: item.artistName,
                  album: item.albumName,
                  duration: item.duration,
                  isInstrumental: item.instrumental,
                }),
              }))
              .filter((e) => e.evaluation.isValid)
              .sort((a, b) => b.evaluation.confidence - a.evaluation.confidence);

            for (const { item, evaluation } of evaluated) {
              if (item.syncedLyrics) {
                const lines = parseLrcFormat(item.syncedLyrics);
                if (lines.length > 0) {
                  return {
                    found: true,
                    provider: this.name,
                    providerTrackId: String(item.id || ""),
                    synced: true,
                    lines,
                    rawLyrics: item.syncedLyrics,
                    attribution: "Synchronized lyrics powered by LRCLIB",
                    matchConfidence: evaluation.confidence,
                  };
                }
              } else if (item.plainLyrics) {
                const lines = distributePlainLyrics(item.plainLyrics, durationSec || 210);
                if (lines.length > 0) {
                  return {
                    found: true,
                    provider: this.name,
                    providerTrackId: String(item.id || ""),
                    synced: false,
                    lines,
                    rawLyrics: item.plainLyrics,
                    attribution: "Lyrics powered by LRCLIB",
                    matchConfidence: evaluation.confidence,
                  };
                }
              }
            }
          }
        }
      } catch (_) {}
    }

    return {
      found: false,
      rejectionReason: REJECTION_REASONS.EMPTY_LYRICS,
    };
  }
}
