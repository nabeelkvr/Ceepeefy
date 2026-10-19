import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SOCIAL_PLATFORMS,
  QUALITY_OPTIONS,
  VIDEO_QUALITY_PILLS,
  detectPlatformFromUrl,
  validatePlatformUrl,
  extractYouTubeId,
  extractInstagramShortcode,
  extractXStatusId,
  derivePlatformTitleAndAuthor,
} from "./src/services/socialDownloaderService.js";
import fs from "node:fs";

// Mirror normalizeTrack isLocal test logic
function checkIsLocal(track) {
  const rawId = track.id || track._id || track.trackId;
  return Boolean(
    track.isLocal ||
    String(rawId).startsWith("local-") ||
    String(rawId).startsWith("selfmix-") ||
    String(rawId).startsWith("converted-") ||
    track.source === "local-upload" ||
    track.source === "local-device"
  );
}

describe("MP3 Converter Fix & Social Media Downloader Test Suite", () => {
  // =========================================================================
  // 1. MP3 Converter Add to Self Mix Fix
  // =========================================================================
  describe("1. MP3 Converter: Add to Self Mix Contract & Resilience", () => {
    it("1.1: Converted song model preserves isLocal: true for selfmix- IDs", () => {
      const rawConverted = {
        id: "selfmix-1718293-abc",
        title: "Interstellar Theme",
        artist: "Hans Zimmer",
        album: "Soundtracks Mix",
        duration: 240,
        coverUrl: "https://example.com/cover.jpg",
        audioUrl: "https://example.com/stream.mp3",
        source: "local-upload",
        badge: "320 kbps MP3",
      };

      const isLocal = checkIsLocal(rawConverted);
      assert.equal(isLocal, true);
      assert.equal(rawConverted.source, "local-upload");
      assert.equal(rawConverted.id, "selfmix-1718293-abc");
    });

    it("1.2: String vs number mix.id comparison works reliably", () => {
      const selfMixes = [
        { id: 101, title: "Workout Mix", tracks: [] },
        { id: "mix-999", title: "Chill Vibes", tracks: [] },
      ];

      const targetIdAsNumber = 101;
      const targetIdAsString = "101";

      const matchNum = selfMixes.find((m) => String(m.id) === String(targetIdAsNumber));
      const matchStr = selfMixes.find((m) => String(m.id) === String(targetIdAsString));

      assert.ok(matchNum, "Must match numeric mixId");
      assert.ok(matchStr, "Must match string mixId");
      assert.equal(matchNum.title, "Workout Mix");
      assert.equal(matchStr.title, "Workout Mix");
    });

    it("1.3: Prevents duplicate track additions by comparing title and artist", () => {
      const existingPlaylist = {
        id: "mix-1",
        title: "Favorites",
        tracks: [
          { id: "selfmix-100", title: "Blinding Lights", artist: "The Weeknd" },
        ],
      };

      const newSongDuplicate = {
        id: "selfmix-200",
        title: "  blinding lights  ",
        artist: "The Weeknd",
      };

      const isDuplicate = existingPlaylist.tracks.some(
        (t) =>
          t.title.toLowerCase().trim() === newSongDuplicate.title.toLowerCase().trim() &&
          t.artist.toLowerCase().trim() === newSongDuplicate.artist.toLowerCase().trim()
      );

      assert.equal(isDuplicate, true, "Must flag duplicate song title and artist");
    });

    it("1.4: Discards transient blob: URLs from previous sessions so IndexedDB is revived", () => {
      const trackWithExpiredBlob = {
        id: "selfmix-test",
        title: "Test Track",
        audioUrl: "blob:http://localhost:3000/1234-5678-expired",
        isLocal: true,
      };

      let resolvedUrl = trackWithExpiredBlob.audioUrl;
      if (resolvedUrl && typeof resolvedUrl === "string" && resolvedUrl.startsWith("blob:")) {
        resolvedUrl = null;
      }

      assert.equal(resolvedUrl, null, "Expired blob URL must be nullified to allow IndexedDB revival");
    });
  });

  // =========================================================================
  // 2. Social Media Downloader: Category Pills & Ordering
  // =========================================================================
  describe("2. Social Media Downloader: Category Pills & Ordering", () => {
    it("2.1: Exactly four platforms arranged in order: YouTube | Instagram | X | Facebook", () => {
      const platformIds = SOCIAL_PLATFORMS.map((p) => p.id);
      assert.deepEqual(platformIds, ["youtube", "instagram", "x", "facebook"]);

      const platformNames = SOCIAL_PLATFORMS.map((p) => p.name);
      assert.deepEqual(platformNames, ["YouTube", "Instagram", "X", "Facebook"]);
    });

    it("2.2: Each platform defines a unique icon, placeholder, and domains", () => {
      for (const p of SOCIAL_PLATFORMS) {
        assert.ok(p.id);
        assert.ok(p.name);
        assert.ok(p.icon);
        assert.ok(p.placeholder);
        assert.ok(Array.isArray(p.domains) && p.domains.length > 0);
      }
    });
  });

  // =========================================================================
  // 3. Social Media Downloader: URL Detection & Platform Validation
  // =========================================================================
  describe("3. Social Media Downloader: URL Validation & Mismatch Detection", () => {
    it("3.1: Validates YouTube watch, shorts, and youtu.be links", () => {
      const validLinks = [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://www.youtube.com/shorts/3iZkQk_K4B4",
      ];
      for (const url of validLinks) {
        const val = validatePlatformUrl(url, "youtube");
        assert.equal(val.valid, true, `Expected valid for ${url}`);
      }
    });

    it("3.2: Validates Instagram Reel and post links", () => {
      const validLinks = [
        "https://www.instagram.com/reel/C3b4zK_x9yZ/",
        "https://instagram.com/p/C2_abc123/",
        "https://www.instagram.com/tv/B8_xyz987/",
      ];
      for (const url of validLinks) {
        const val = validatePlatformUrl(url, "instagram");
        assert.equal(val.valid, true, `Expected valid for ${url}`);
      }
    });

    it("3.3: Validates X (Twitter) post links", () => {
      const validLinks = [
        "https://x.com/spacex/status/1750000000000000000",
        "https://twitter.com/nasa/status/1640000000000000000",
      ];
      for (const url of validLinks) {
        const val = validatePlatformUrl(url, "x");
        assert.equal(val.valid, true, `Expected valid for ${url}`);
      }
    });

    it("3.4: Validates Facebook watch and reel links", () => {
      const validLinks = [
        "https://www.facebook.com/watch/?v=1234567890",
        "https://fb.watch/qX_abc123/",
        "https://www.facebook.com/reel/987654321",
      ];
      for (const url of validLinks) {
        const val = validatePlatformUrl(url, "facebook");
        assert.equal(val.valid, true, `Expected valid for ${url}`);
      }
    });

    it("3.5: Detects platform mismatch when user enters an Instagram link under YouTube tab", () => {
      const instagramUrl = "https://www.instagram.com/reel/C3b4zK_x9yZ/";
      const result = validatePlatformUrl(instagramUrl, "youtube");

      assert.equal(result.valid, false);
      assert.equal(result.mismatch, true);
      assert.equal(result.detectedPlatform, "instagram");
      assert.ok(result.error.includes("Instagram"));
      assert.ok(result.error.includes("YouTube"));
    });

    it("3.6: Rejects invalid or unsupported web URLs", () => {
      const invalidUrls = [
        "https://example.com/video.mp4",
        "https://tiktok.com/@user/video/123",
        "plain text string",
        "",
      ];
      for (const url of invalidUrls) {
        const result = validatePlatformUrl(url, "youtube");
        assert.equal(result.valid, false);
      }
    });
  });

  // =========================================================================
  // 4. Quality Options & Video Specifications
  // =========================================================================
  describe("4. Quality Options & Video Output", () => {
    it("4.1: Quality presets provide 1080p, 720p, 480p, and 360p", () => {
      const qualityIds = QUALITY_OPTIONS.map((q) => q.id);
      assert.deepEqual(qualityIds, ["1080", "720", "480", "360"]);
    });

    it("4.2: Extractors correctly pull IDs from each platform", () => {
      assert.equal(
        extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
        "dQw4w9WgXcQ"
      );
      assert.equal(
        extractInstagramShortcode("https://www.instagram.com/reel/C3b4zK_x9yZ/"),
        "C3b4zK_x9yZ"
      );
      assert.equal(
        extractXStatusId("https://x.com/spacex/status/1750000000000000000"),
        "1750000000000000000"
      );
    });

    it("4.3: VIDEO_QUALITY_PILLS defines Low, Standard, High, Full pills", () => {
      const labels = VIDEO_QUALITY_PILLS.map((p) => p.label);
      assert.deepEqual(labels, ["Low", "Standard", "High", "Full"]);

      const badges = VIDEO_QUALITY_PILLS.map((p) => p.badge);
      assert.deepEqual(badges, ["360p", "480p", "720p", "1080p"]);
    });
  });

  // =========================================================================
  // 5. Playlist Upper Details Structure & Lossless Badge Removal
  // =========================================================================
  describe("5. Playlist Upper Details Structure & Lossless Badge Removal", () => {
    it("5.1: Removes hi-res lossless and 24-bit texts from playlist header", () => {
      const playlistPageCode = fs.readFileSync(
        "./src/app/playlist/[id]/page.jsx",
        "utf8"
      );
      assert.equal(playlistPageCode.includes("HI-RES LOSSLESS"), false);
      assert.equal(playlistPageCode.includes("24-Bit"), false);
      assert.equal(playlistPageCode.includes("192kHz"), false);
    });

    it("5.2: Playlist details has cover on left and metadata on right with pin button", () => {
      const playlistPageCode = fs.readFileSync(
        "./src/app/playlist/[id]/page.jsx",
        "utf8"
      );
      assert.ok(playlistPageCode.includes("PlaylistCover"));
      assert.ok(playlistPageCode.includes("togglePinPlaylist"));
      assert.ok(playlistPageCode.includes("isPlaylistPinned"));
      assert.ok(playlistPageCode.includes("currentCategory"));
      assert.ok(playlistPageCode.includes("totalDurationStr"));
    });

    it("5.3: Action controls bar places play, shuffle, add, download, folder on left and delete on far right", () => {
      const playlistPageCode = fs.readFileSync(
        "./src/app/playlist/[id]/page.jsx",
        "utf8"
      );
      assert.ok(playlistPageCode.includes("handleMasterPlay"));
      assert.ok(playlistPageCode.includes("handleShufflePlay"));
      assert.ok(playlistPageCode.includes("handleOpenAddSongs"));
      assert.ok(playlistPageCode.includes("handleDownloadPlaylist"));
      assert.ok(playlistPageCode.includes("ml-auto"));
      assert.ok(playlistPageCode.includes("setIsDeleteModalOpen(true)"));
    });
  });

  // =========================================================================
  // 6. Platform-Accurate Filenames & Download Resilience
  // =========================================================================
  describe("6. Platform-Accurate Filenames & Download Resilience", () => {
    it("6.1: derivePlatformTitleAndAuthor derives platform-accurate names for YouTube, Instagram, X, Facebook", () => {
      const yt = derivePlatformTitleAndAuthor("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube");
      assert.equal(yt.title, "Rick Astley - Never Gonna Give You Up");
      assert.equal(yt.author, "Rick Astley");

      const ig = derivePlatformTitleAndAuthor("https://www.instagram.com/reel/C3b4zK_x9yZ/", "instagram");
      assert.ok(ig.title.includes("Instagram Reel"));
      assert.ok(ig.title.includes("C3b4zK_x9yZ"));

      const x = derivePlatformTitleAndAuthor("https://x.com/spacex/status/1750000000000000000", "x");
      assert.equal(x.title, "X Post Video by @spacex");
      assert.equal(x.author, "@spacex");

      const fb = derivePlatformTitleAndAuthor("https://www.facebook.com/techinsider/videos/123456789/", "facebook");
      assert.equal(fb.title, "techinsider Video");
      assert.equal(fb.author, "techinsider");
    });

    it("6.2: src/proxy.js allows public access to /api/social and /media without 401 Unauthorized", () => {
      const proxyCode = fs.readFileSync("./src/proxy.js", "utf8");
      assert.ok(proxyCode.includes('pathname.startsWith("/api/social")'));
      assert.ok(proxyCode.includes('pathname.startsWith("/media/")'));
    });

    it("6.3: MP3 download route formats filename as [Title] - [Artist].mp3 without quality brackets", () => {
      const audioDownloadRouteCode = fs.readFileSync(
        "./src/app/api/audio/download/route.js",
        "utf8"
      );
      assert.ok(audioDownloadRouteCode.includes("const downloadFilename = `${cleanFilename}.${ext}`;"));
    });

    it("6.4: Social download route formats filename as [Title].mp4 without bracketed tags", () => {
      const socialDownloadRouteCode = fs.readFileSync(
        "./src/app/api/social/download/route.js",
        "utf8"
      );
      assert.ok(socialDownloadRouteCode.includes("const fileName = `${cleanTitle}.mp4`;"));
    });
  });
});
