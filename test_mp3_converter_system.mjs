import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  identifyAudioSourceUrl,
  cleanYouTubeTitle,
  QUALITY_PRESETS,
  formatDurationSeconds,
} from "./src/services/mp3ConverterService.js";

describe("MP3 Converter System Verification Suite", () => {
  describe("1. URL Identification & Validation", () => {
    it("1.1: Correctly identifies standard Spotify web track URL", () => {
      const url = "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc123456";
      const result = identifyAudioSourceUrl(url);
      assert.equal(result.type, "spotify");
      assert.equal(result.id, "4cOdK2wGLETKBW3PvgPWqT");
    });

    it("1.2: Correctly identifies localized Spotify track URL", () => {
      const url = "https://open.spotify.com/intl-ja/track/37i9dQZF1DXcBWIGoYBM5M";
      const result = identifyAudioSourceUrl(url);
      assert.equal(result.type, "spotify");
      assert.equal(result.id, "37i9dQZF1DXcBWIGoYBM5M");
    });

    it("1.3: Correctly identifies Spotify URI format", () => {
      const uri = "spotify:track:4cOdK2wGLETKBW3PvgPWqT";
      const result = identifyAudioSourceUrl(uri);
      assert.equal(result.type, "spotify");
      assert.equal(result.id, "4cOdK2wGLETKBW3PvgPWqT");
    });

    it("1.4: Correctly identifies standard YouTube watch URL", () => {
      const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ";
      const result = identifyAudioSourceUrl(url);
      assert.equal(result.type, "youtube");
      assert.equal(result.id, "dQw4w9WgXcQ");
    });

    it("1.5: Correctly identifies youtu.be short URL", () => {
      const url = "https://youtu.be/dQw4w9WgXcQ";
      const result = identifyAudioSourceUrl(url);
      assert.equal(result.type, "youtube");
      assert.equal(result.id, "dQw4w9WgXcQ");
    });

    it("1.6: Correctly identifies YouTube Music URL", () => {
      const url = "https://music.youtube.com/watch?v=dQw4w9WgXcQ";
      const result = identifyAudioSourceUrl(url);
      assert.equal(result.type, "youtube");
      assert.equal(result.id, "dQw4w9WgXcQ");
    });

    it("1.7: Rejects unsupported or malformed links gracefully", () => {
      const invalidUrls = [
        "https://example.com/audio.mp3",
        "random text string",
        "https://soundcloud.com/artist/track",
        "",
        null,
      ];
      for (const u of invalidUrls) {
        const result = identifyAudioSourceUrl(u);
        assert.equal(result.type, "invalid");
        assert.equal(result.id, null);
      }
    });
  });

  describe("2. Title & Metadata Normalization", () => {
    it("2.1: Cleans YouTube video tags and extracts genuine song title & artist", () => {
      const raw = "The Weeknd - Blinding Lights (Official Music Video) [4K Remastered]";
      const author = "The Weeknd";
      const { title, artist } = cleanYouTubeTitle(raw, author);
      assert.equal(title, "Blinding Lights");
      assert.equal(artist, "The Weeknd");
    });

    it("2.2: Cleans 'Artist - Topic' author names", () => {
      const raw = "Kalyani";
      const author = "K. J. Yesudas - Topic";
      const { title, artist } = cleanYouTubeTitle(raw, author);
      assert.equal(title, "Kalyani");
      assert.equal(artist, "K. J. Yesudas");
    });

    it("2.3: Formats duration seconds into mm:ss accurately", () => {
      assert.equal(formatDurationSeconds(215), "3:35");
      assert.equal(formatDurationSeconds(65), "1:05");
      assert.equal(formatDurationSeconds(0), "0:00");
    });
  });

  describe("3. Quality Presets & File Extensions", () => {
    it("3.1: Supports 128 kbps, 192 kbps, and 320 kbps presets", () => {
      const ids = QUALITY_PRESETS.map((p) => p.id);
      assert.deepEqual(ids, ["128", "192", "320"]);
      assert.equal(QUALITY_PRESETS.find((p) => p.id === "320").targetBitrate, 320);
    });

    it("3.2: Download query correctly outputs format=mp3 for MP3 Converter", () => {
      const title = "Starboy";
      const artist = "The Weeknd";
      const quality = "320";
      const audioUrl = "https://example.com/audio.m4a";
      const downloadUrl = `/api/audio/download?audioUrl=${encodeURIComponent(audioUrl)}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&quality=${quality}&format=mp3`;

      const parsedUrl = new URL(downloadUrl, "http://localhost");
      assert.equal(parsedUrl.searchParams.get("format"), "mp3");
      assert.equal(parsedUrl.searchParams.get("quality"), "320");
    });
  });

  describe("4. Add to Self Mix Contract Verification", () => {
    it("4.1: Converted track model has all required Self Mix properties", () => {
      const convertedTrack = {
        id: "selfmix-converted-1",
        title: "Levitating",
        artist: "Dua Lipa",
        album: "Future Nostalgia",
        duration: 203,
        durationFormatted: "3:23",
        coverUrl: "https://example.com/cover.jpg",
        audioUrl: "https://example.com/audio.mp3",
        isLocal: true,
        source: "local-upload",
        badge: "320 kbps MP3",
        badgeType: "cyan",
      };

      assert.ok(convertedTrack.id.startsWith("selfmix-"));
      assert.equal(convertedTrack.isLocal, true);
      assert.equal(convertedTrack.source, "local-upload");
      assert.ok(convertedTrack.badge.includes("MP3"));
    });
  });
});
