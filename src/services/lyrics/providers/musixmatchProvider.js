/**
 * Musixmatch Official Provider Adapter
 *
 * Implements Section 3 (Provider 2 - Musixmatch):
 * - Secure credential handling via process.env.MUSIXMATCH_API_KEY (or options.apiKey)
 * - Clear diagnostic reporting when credentials are not configured
 * - Multi-strategy track matching: track.search + candidate evaluation, matcher.lyrics.get, matcher.track.get
 * - Subtitle / Synchronized lyrics extraction (track.subtitles.get) with plain lyrics fallback (track.lyrics.get)
 * - Robust title cleaning: removes soundtrack and version tags (e.g. "From Athimanoharam")
 * - Multi-artist handling: tries primary artist, contributing singers, and composers
 * - Clean commercial disclaimer stripping
 * - Required licensing and attribution metadata
 */

import { BaseLyricsProvider } from "./baseProvider.js";
import { PROVIDER_NAMES, REJECTION_REASONS } from "../types.js";
import { cleanLyricsString } from "../textProcessor.js";
import {
  evaluateCandidateMatch,
  cleanSearchTitle,
  normalizeSongTitle,
  extractArtistNames,
  parseDurationSec,
} from "../songMatcher.js";

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

function parseJsonSubtitles(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    if (!Array.isArray(data)) return [];
    const lines = [];
    for (const item of data) {
      const text = cleanLyricsString(item.text || "");
      if (!text) continue;
      let time = 0;
      if (typeof item.time?.total === "number") {
        time = item.time.total;
      } else if (typeof item.time?.minutes === "number" && typeof item.time?.seconds === "number") {
        time = item.time.minutes * 60 + item.time.seconds + (item.time.hundredths || 0) / 100;
      } else if (typeof item.time === "number") {
        time = item.time;
      } else {
        time = parseFloat(item.time || "0") || 0;
      }
      lines.push({ time: parseFloat(time.toFixed(2)), text });
    }
    lines.sort((a, b) => a.time - b.time);
    return lines;
  } catch {
    return [];
  }
}

function stripMusixmatchDisclaimers(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/\*{4,}\s*This Lyrics is NOT for Commercial use\s*\*{4,}/gi, "")
    .replace(/\(\d{7,}\)/g, "")
    .replace(/Lyrics licensed & provided by Musixmatch/gi, "")
    .trim();
}

function distributePlainLyrics(rawText, durationSec = 210) {
  const cleaned = cleanLyricsString(stripMusixmatchDisclaimers(rawText));
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

export class MusixmatchProvider extends BaseLyricsProvider {
  constructor() {
    super(PROVIDER_NAMES.MUSIXMATCH, 1); // Highest priority (Primary)
  }

  isConfigured() {
    return Boolean(process.env.MUSIXMATCH_API_KEY && process.env.MUSIXMATCH_API_KEY.trim());
  }

  async fetchLyrics(seedTrack, options = {}) {
    const apiKey = (options.apiKey || process.env.MUSIXMATCH_API_KEY || "").trim();

    // If API key is not configured, report clearly without failing the provider pipeline
    if (!apiKey) {
      return {
        found: false,
        rejectionReason: REJECTION_REASONS.NOT_CONFIGURED,
        status: "NOT_CONFIGURED",
        configNote: "MUSIXMATCH_API_KEY environment variable is not configured on the server",
      };
    }

    const rawTitle = (seedTrack.title || seedTrack.track || "").trim();
    const cleanTitle = cleanSearchTitle(rawTitle);
    const rawArtist = (seedTrack.artist || "").trim();
    const primaryArtist = rawArtist.split(/[,&/]|feat\.?|ft\.?/i)[0].trim();
    const artistCandidates = extractArtistNames(rawArtist);
    if (primaryArtist && !artistCandidates.includes(primaryArtist)) {
      artistCandidates.unshift(primaryArtist);
    }

    const durationSec = parseDurationSec(seedTrack.duration) || 210;

    if (!rawTitle && !cleanTitle) {
      return { found: false, rejectionReason: REJECTION_REASONS.TITLE_MISMATCH };
    }

    const fetchTimeoutMs = options.timeoutMs || 4500;
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
    };

    const callApi = async (method, paramsObj) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
        const searchParams = new URLSearchParams({
          format: "json",
          apikey: apiKey,
          ...paramsObj,
        });
        const url = `https://api.musixmatch.com/ws/1.1/${method}?${searchParams.toString()}`;
        const res = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) return null;
        const data = await res.json().catch(() => null);
        const statusCode = data?.message?.header?.status_code;
        if (statusCode === 200) {
          return data?.message?.body || null;
        }
      } catch {}
      return null;
    };

    // Candidate titles to test: Cleaned title first (e.g. "Sundara Ravanan"), then raw title
    const titleCandidates = [cleanTitle, rawTitle].filter(
      (t, idx, arr) => t && t.length > 0 && arr.indexOf(t) === idx
    );

    // ============================================================
    // Strategy 1: Search-assisted matching via track.search
    // ============================================================
    for (const titleToTry of titleCandidates) {
      const searchAttempts = [];
      // 1. Title + Primary / Candidate Artists
      for (const art of artistCandidates.slice(0, 3)) {
        searchAttempts.push({ q_track: titleToTry, q_artist: art });
      }
      // 2. Title alone for high recall
      searchAttempts.push({ q_track: titleToTry });

      for (const params of searchAttempts) {
        const body = await callApi("track.search", {
          ...params,
          page_size: "5",
          s_track_rating: "desc",
        });

        const trackList = body?.track_list || [];
        if (Array.isArray(trackList) && trackList.length > 0) {
          // Score candidates against seedTrack using accurate song matcher
          const candidates = trackList
            .map((item) => item.track)
            .filter(Boolean)
            .map((cand) => ({
              cand,
              evaluation: evaluateCandidateMatch(seedTrack, {
                title: cand.track_name,
                artist: cand.artist_name,
                album: cand.album_name,
                duration: cand.track_length,
                isInstrumental: cand.instrumental === 1,
              }),
            }))
            .filter((c) => c.evaluation.isValid)
            .sort((a, b) => b.evaluation.confidence - a.evaluation.confidence);

          if (candidates.length > 0) {
            const best = candidates[0].cand;
            const trackId = best.track_id;

            // Step A: Attempt to retrieve synchronized lyrics (track.subtitles.get)
            if (best.has_subtitles === 1 || best.has_subtitles === true) {
              const subBody = await callApi("track.subtitles.get", {
                track_id: String(trackId),
                subtitle_format: "lrc",
              });
              const rawSub = subBody?.subtitle?.subtitle_body;
              if (rawSub && typeof rawSub === "string") {
                let lines = [];
                if (rawSub.trim().startsWith("[")) {
                  lines = parseJsonSubtitles(rawSub);
                }
                if (lines.length === 0) {
                  lines = parseLrcFormat(rawSub);
                }
                if (lines.length > 0) {
                  return {
                    found: true,
                    provider: this.name,
                    providerTrackId: String(trackId),
                    synced: true,
                    lines,
                    rawLyrics: rawSub,
                    attribution: "Synchronized lyrics powered by Musixmatch",
                    copyright: subBody?.subtitle?.lyrics_copyright || "Copyright Musixmatch",
                    matchConfidence: candidates[0].evaluation.confidence || 90,
                  };
                }
              }
            }

            // Step B: Plain lyrics fallback (track.lyrics.get)
            if (best.has_lyrics === 1 || best.has_lyrics === true) {
              const lyrBody = await callApi("track.lyrics.get", {
                track_id: String(trackId),
              });
              const rawLyr = lyrBody?.lyrics?.lyrics_body;
              if (rawLyr && typeof rawLyr === "string") {
                const cleanedText = stripMusixmatchDisclaimers(rawLyr);
                const lines = distributePlainLyrics(cleanedText, durationSec);
                if (lines.length > 0) {
                  return {
                    found: true,
                    provider: this.name,
                    providerTrackId: String(trackId),
                    synced: false,
                    lines,
                    rawLyrics: cleanedText,
                    attribution: "Lyrics powered by Musixmatch",
                    copyright: lyrBody?.lyrics?.lyrics_copyright || "Copyright Musixmatch",
                    matchConfidence: candidates[0].evaluation.confidence || 85,
                  };
                }
              }
            }
          }
        }
      }
    }

    // ============================================================
    // Strategy 2: Direct match via matcher.lyrics.get
    // ============================================================
    for (const titleToTry of titleCandidates) {
      for (const art of [...artistCandidates.slice(0, 3), ""]) {
        const matcherParams = { q_track: titleToTry };
        if (art) matcherParams.q_artist = art;

        const body = await callApi("matcher.lyrics.get", matcherParams);
        const lyr = body?.lyrics;
        if (lyr && lyr.lyrics_body && typeof lyr.lyrics_body === "string") {
          const rawLyr = lyr.lyrics_body;
          const cleanedText = stripMusixmatchDisclaimers(rawLyr);
          const lines = distributePlainLyrics(cleanedText, durationSec);
          if (lines.length > 0) {
            return {
              found: true,
              provider: this.name,
              providerTrackId: String(lyr.lyrics_id || ""),
              synced: false,
              lines,
              rawLyrics: cleanedText,
              attribution: "Lyrics powered by Musixmatch",
              copyright: lyr.lyrics_copyright || "Copyright Musixmatch",
              matchConfidence: 85,
            };
          }
        }
      }
    }

    // ============================================================
    // Strategy 3: matcher.track.get + track.lyrics.get
    // ============================================================
    for (const titleToTry of titleCandidates) {
      for (const art of artistCandidates.slice(0, 2)) {
        const body = await callApi("matcher.track.get", {
          q_track: titleToTry,
          q_artist: art,
        });
        const track = body?.track;
        if (track && track.track_id) {
          const evalResult = evaluateCandidateMatch(seedTrack, {
            title: track.track_name,
            artist: track.artist_name,
            album: track.album_name,
            duration: track.track_length,
            isInstrumental: track.instrumental === 1,
          });

          if (evalResult.isValid) {
            const lyrBody = await callApi("track.lyrics.get", {
              track_id: String(track.track_id),
            });
            const lyr = lyrBody?.lyrics;
            if (lyr && lyr.lyrics_body) {
              const cleanedText = stripMusixmatchDisclaimers(lyr.lyrics_body);
              const lines = distributePlainLyrics(cleanedText, durationSec);
              if (lines.length > 0) {
                return {
                  found: true,
                  provider: this.name,
                  providerTrackId: String(track.track_id),
                  synced: false,
                  lines,
                  rawLyrics: cleanedText,
                  attribution: "Lyrics powered by Musixmatch",
                  copyright: lyr.lyrics_copyright || "Copyright Musixmatch",
                  matchConfidence: evalResult.confidence || 85,
                };
              }
            }
          }
        }
      }
    }

    return {
      found: false,
      rejectionReason: REJECTION_REASONS.EMPTY_LYRICS,
    };
  }
}
