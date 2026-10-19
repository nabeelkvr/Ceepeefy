/**
 * Musixmatch Official Provider Adapter
 *
 * Implements Section 3 (Provider 2 - Musixmatch):
 * - Secure credential handling via process.env.MUSIXMATCH_API_KEY
 * - Clear diagnostic reporting when credentials are not configured
 * - Official Musixmatch API endpoint integration (matcher.lyrics.get)
 * - Required licensing and attribution metadata
 */

import { BaseLyricsProvider } from "./baseProvider.js";
import { PROVIDER_NAMES, REJECTION_REASONS } from "../types.js";
import { cleanLyricsString } from "../textProcessor.js";

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

export class MusixmatchProvider extends BaseLyricsProvider {
  constructor() {
    super(PROVIDER_NAMES.MUSIXMATCH, 3);
  }

  isConfigured() {
    return Boolean(process.env.MUSIXMATCH_API_KEY && process.env.MUSIXMATCH_API_KEY.trim());
  }

  async fetchLyrics(seedTrack, options = {}) {
    const apiKey = (process.env.MUSIXMATCH_API_KEY || "").trim();

    // If API key is not configured, report clearly without failing the provider pipeline
    if (!apiKey) {
      return {
        found: false,
        rejectionReason: REJECTION_REASONS.NOT_CONFIGURED,
        status: "NOT_CONFIGURED",
        configNote: "MUSIXMATCH_API_KEY environment variable is not configured on the server",
      };
    }

    const title = (seedTrack.title || "").trim();
    const artist = (seedTrack.artist || "").split(/[,&/]|feat\.?|ft\.?/i)[0].trim();
    const rawDuration = parseFloat(seedTrack.duration || "0");
    const durationSec = !isNaN(rawDuration) && rawDuration > 15 ? rawDuration : 210;

    if (!title) {
      return { found: false, rejectionReason: REJECTION_REASONS.TITLE_MISMATCH };
    }

    try {
      const fetchTimeoutMs = options.timeoutMs || 6000;
      const params = new URLSearchParams({
        format: "json",
        q_track: title,
        q_artist: artist,
        apikey: apiKey,
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
      const url = `https://api.musixmatch.com/ws/1.1/matcher.lyrics.get?${params.toString()}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        return {
          found: false,
          rejectionReason: `${REJECTION_REASONS.PROVIDER_UNAVAILABLE} (HTTP ${res.status})`,
        };
      }

      const data = await res.json().catch(() => null);
      const statusCode = data?.message?.header?.status_code;

      if (statusCode !== 200) {
        return {
          found: false,
          rejectionReason: `Musixmatch returned status code ${statusCode}`,
        };
      }

      const lyricsObj = data?.message?.body?.lyrics;
      if (!lyricsObj || !lyricsObj.lyrics_body) {
        return {
          found: false,
          rejectionReason: REJECTION_REASONS.EMPTY_LYRICS,
        };
      }

      // Musixmatch includes a commercial disclaimer at the end of lyrics_body
      const rawBody = cleanLyricsString(
        lyricsObj.lyrics_body.replace(/\*\*\*\*\*\*\* This Lyrics is NOT for Commercial use \*\*\*\*\*\*\*/gi, "").trim()
      );

      const lines = distributePlainLyrics(rawBody, durationSec);
      if (lines.length === 0) {
        return { found: false, rejectionReason: REJECTION_REASONS.EMPTY_LYRICS };
      }

      return {
        found: true,
        provider: this.name,
        providerTrackId: String(lyricsObj.lyrics_id || ""),
        synced: false,
        lines,
        rawLyrics: rawBody,
        attribution: "Lyrics powered by Musixmatch",
        copyright: lyricsObj.lyrics_copyright || "Copyright Musixmatch",
        matchConfidence: 85,
      };
    } catch (err) {
      return {
        found: false,
        rejectionReason: `${REJECTION_REASONS.PROVIDER_UNAVAILABLE}: ${err.message}`,
      };
    }
  }
}
