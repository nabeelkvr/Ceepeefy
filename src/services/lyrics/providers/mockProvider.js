/**
 * Mock & Embedded Lyrics Provider Adapter
 *
 * Checks embedded track lyrics (e.g. from local uploads, curated tracks)
 * or Nocturne tracks.
 */

import { BaseLyricsProvider } from "./baseProvider.js";
import { PROVIDER_NAMES, REJECTION_REASONS } from "../types.js";
import { NOCTURNE_TRACKS } from "../../../data/nocturneData.js";
import { cleanLyricsString } from "../textProcessor.js";

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

export class MockProvider extends BaseLyricsProvider {
  constructor() {
    super(PROVIDER_NAMES.MOCK, 4); // Lowest priority fallback
  }

  async fetchLyrics(seedTrack, options = {}) {
    const id = String(seedTrack.id || "");
    const title = (seedTrack.title || "").toLowerCase().trim();
    const artist = (seedTrack.artist || "").toLowerCase().trim();
    const rawDuration = parseFloat(seedTrack.duration || "0");
    const durationSec = !isNaN(rawDuration) && rawDuration > 15 ? rawDuration : 210;

    let rawLyrics = seedTrack.lyrics || null;

    if (!rawLyrics) {
      const mockTrack = NOCTURNE_TRACKS.find(
        (t) =>
          t.id === id ||
          (title && t.title?.toLowerCase() === title) ||
          (artist && t.artist?.toLowerCase() === artist)
      );
      if (mockTrack && mockTrack.lyrics) {
        rawLyrics = mockTrack.lyrics;
      }
    }

    if (!rawLyrics || typeof rawLyrics !== "string" || !rawLyrics.trim()) {
      return { found: false, rejectionReason: REJECTION_REASONS.EMPTY_LYRICS };
    }

    const isSynced = rawLyrics.includes("[00:") || rawLyrics.includes("[01:");
    const lines = isSynced
      ? parseLrcFormat(rawLyrics)
      : distributePlainLyrics(rawLyrics, durationSec);

    if (lines.length === 0) {
      return { found: false, rejectionReason: REJECTION_REASONS.EMPTY_LYRICS };
    }

    return {
      found: true,
      provider: this.name,
      providerTrackId: id || "mock",
      synced: isSynced,
      lines,
      rawLyrics: cleanLyricsString(rawLyrics),
      attribution: "Embedded / Curated Track Lyrics",
      matchConfidence: 80,
    };
  }
}
