import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { POST as convertAudioPost } from "./src/app/api/audio/convert/route.js";
import { GET as downloadAudioGet } from "./src/app/api/audio/download/route.js";
import { GET as downloadSocialGet } from "./src/app/api/social/download/route.js";
import {
  isMp3Buffer,
  isMp4Buffer,
  probeMediaStreams,
  sanitizeMediaFilename,
  runFfmpeg,
} from "./src/server/mediaConverter.js";
import { parseFilenameFromDisposition } from "./src/services/mp3ConverterService.js";

describe("Critical Fix: End-to-End MP3 and MP4 Media Verification", () => {
  // =========================================================================
  // 1. Filename Sanitization & Cross-Platform Protection
  // =========================================================================
  describe("1. Original Media Filename Preservation & Sanitization", () => {
    it("1.1: Original title 'Manavalan Thug.mp3' downloads as 'Manavalan Thug.mp3' without double extension", () => {
      const sanitized = sanitizeMediaFilename("Manavalan Thug.mp3", "mp3");
      assert.equal(sanitized, "Manavalan Thug.mp3");
    });

    it("1.2: Original title 'My Favourite Song' downloads as 'My Favourite Song.mp3'", () => {
      const sanitized = sanitizeMediaFilename("My Favourite Song", "mp3");
      assert.equal(sanitized, "My Favourite Song.mp3");
    });

    it("1.3: Original video title 'Beautiful Sunset' downloads as 'Beautiful Sunset.mp4'", () => {
      const sanitized = sanitizeMediaFilename("Beautiful Sunset", "mp4");
      assert.equal(sanitized, "Beautiful Sunset.mp4");
    });

    it("1.4: Sanitizes illegal Windows characters without breaking filename", () => {
      const sanitized = sanitizeMediaFilename('My Song: High "Quality" <Track> | Best', "mp3");
      assert.equal(sanitized, "My Song High Quality Track Best.mp3");
      assert.equal(/[\\/:*?"<>|]/.test(sanitized), false);
    });

    it("1.5: Blocks directory traversal attempts", () => {
      const sanitized = sanitizeMediaFilename("../../etc/passwd", "mp3");
      assert.equal(sanitized.includes(".."), false);
      assert.equal(sanitized.includes("/"), false);
      assert.equal(sanitized.includes("\\"), false);
    });

    it("1.6: parseFilenameFromDisposition correctly parses RFC 5987 UTF-8 and standard headers", () => {
      const headerUtf8 = "attachment; filename=\"Song.mp3\"; filename*=UTF-8''Manavalan%20Thug.mp3";
      assert.equal(parseFilenameFromDisposition(headerUtf8), "Manavalan Thug.mp3");

      const headerStandard = 'attachment; filename="Beautiful Sunset.mp4"';
      assert.equal(parseFilenameFromDisposition(headerStandard), "Beautiful Sunset.mp4");
    });
  });

  // =========================================================================
  // 2. MP3 Converter — Real Playable Audio Verification
  // =========================================================================
  describe("2. MP3 Converter Pipeline — Actual Audio Output", () => {
    it("2.1: Link conversion generates valid downloadUrl and resolves actual audio", async () => {
      const req = new Request("http://localhost:3000/api/audio/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://www.youtube.com/watch?v=3iZkQk_K4B4",
          quality: "320",
        }),
      });

      const res = await convertAudioPost(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.track);
      assert.ok(data.track.downloadUrl);
      assert.ok(data.track.audioUrl);
      assert.equal(data.track.format, "MP3");
    });

    it("2.2: Download endpoint returns genuine MP3 with original title filename and audio stream", async () => {
      const targetTitle = "Manavalan Thug";
      const targetFilename = "Manavalan Thug.mp3";

      const req = new Request(
        `http://localhost:3000/api/audio/download?audioUrl=%2Fmedia%2Faudio_sample.mp3&title=${encodeURIComponent(targetTitle)}&format=mp3&filename=${encodeURIComponent(targetFilename)}`,
        { method: "GET" }
      );

      const res = await downloadAudioGet(req);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("Content-Type"), "audio/mpeg");

      const disposition = res.headers.get("Content-Disposition") || "";
      assert.ok(disposition.includes(targetFilename), `Disposition must include '${targetFilename}': ${disposition}`);

      const arrayBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuf);

      // Confirm non-zero size
      assert.ok(buf.length > 10000, "MP3 buffer must be non-zero and substantial size");

      // Verify MP3 magic bytes / structure
      assert.equal(isMp3Buffer(buf), true, "Downloaded buffer must be genuine MP3 format");

      // Verify audio stream with ffprobe
      const tempPath = path.join(process.cwd(), "temp_verify_audio.mp3");
      fs.writeFileSync(tempPath, buf);
      try {
        const probe = await probeMediaStreams(tempPath);
        assert.equal(probe.success, true);
        assert.equal(probe.hasAudio, true, "File must contain an audio stream");
        assert.equal(probe.audioCodec, "mp3", "Audio codec must be mp3");
        assert.ok(probe.duration > 0, "Audio duration must be greater than 0");
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    });

    it("2.3: Local uploaded audio file is transcoded to real MP3 via FFmpeg", async () => {
      // 1. Create a dummy WAV audio file with genuine audio tones using FFmpeg
      const wavTempPath = path.join(process.cwd(), "temp_input_tone.wav");
      await runFfmpeg([
        "-y",
        "-f", "lavfi",
        "-i", "sine=frequency=440:duration=2",
        "-c:a", "pcm_s16le",
        wavTempPath,
      ]);

      const wavBuffer = fs.readFileSync(wavTempPath);
      assert.ok(wavBuffer.length > 0);

      // 2. Submit to /api/audio/convert as multipart/form-data
      const formData = new FormData();
      const file = new File([wavBuffer], "My Favourite Song.wav", { type: "audio/wav" });
      formData.append("file", file);
      formData.append("quality", "320");

      const convertReq = new Request("http://localhost:3000/api/audio/convert", {
        method: "POST",
        body: formData,
      });

      const convertRes = await convertAudioPost(convertReq);
      assert.equal(convertRes.status, 200);
      const convertData = await convertRes.json();

      assert.equal(convertData.success, true);
      assert.equal(convertData.track.title, "My Favourite Song");
      assert.ok(convertData.track.downloadUrl);

      // 3. Download converted MP3 using downloadUrl
      const downloadReq = new Request(`http://localhost:3000${convertData.track.downloadUrl}`, {
        method: "GET",
      });

      const downloadRes = await downloadAudioGet(downloadReq);
      assert.equal(downloadRes.status, 200);
      assert.equal(downloadRes.headers.get("Content-Type"), "audio/mpeg");

      const disposition = downloadRes.headers.get("Content-Disposition") || "";
      assert.ok(disposition.includes("My Favourite Song.mp3"), "Must preserve original title as .mp3");

      const mp3Buf = Buffer.from(await downloadRes.arrayBuffer());
      assert.ok(mp3Buf.length > 0);
      assert.equal(isMp3Buffer(mp3Buf), true, "Transcoded output must be valid MP3");

      // Verify audio stream with ffprobe
      const verifyPath = path.join(process.cwd(), "temp_verify_local.mp3");
      fs.writeFileSync(verifyPath, mp3Buf);
      try {
        const probe = await probeMediaStreams(verifyPath);
        assert.equal(probe.hasAudio, true);
        assert.equal(probe.audioCodec, "mp3");
        assert.ok(probe.duration > 1);
      } finally {
        if (fs.existsSync(verifyPath)) fs.unlinkSync(verifyPath);
        if (fs.existsSync(wavTempPath)) fs.unlinkSync(wavTempPath);
      }
    });
  });

  // =========================================================================
  // 3. Social Media Downloader — Real Playable Video & Audio Verification
  // =========================================================================
  describe("3. Social Media Downloader — Actual Video & Audio Output", () => {
    it("3.1: Download endpoint produces valid playable MP4 with both video and audio streams", async () => {
      const originalTitle = "Beautiful Sunset";
      const expectedFilename = "Beautiful Sunset.mp4";

      const req = new Request(
        `http://localhost:3000/api/social/download?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&platform=youtube&quality=720&title=${encodeURIComponent(originalTitle)}`,
        { method: "GET" }
      );

      const res = await downloadSocialGet(req);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("Content-Type"), "video/mp4");

      const disposition = res.headers.get("Content-Disposition") || "";
      assert.ok(disposition.includes(expectedFilename), `Expected '${expectedFilename}' in disposition: ${disposition}`);

      const arrayBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuf);

      // Verify non-zero size
      assert.ok(buf.length > 10000, "MP4 video buffer must be substantial size");

      // Verify MP4 magic bytes
      assert.equal(isMp4Buffer(buf), true, "File must be valid MP4 container");

      // Verify both video stream AND audio stream exist
      const tempVideoPath = path.join(process.cwd(), "temp_verify_video.mp4");
      fs.writeFileSync(tempVideoPath, buf);
      try {
        const probe = await probeMediaStreams(tempVideoPath);
        assert.equal(probe.success, true);
        assert.equal(probe.hasVideo, true, "MP4 file must contain a video stream");
        assert.equal(probe.hasAudio, true, "MP4 file must contain an audio stream");
        assert.equal(probe.videoCodec, "h264", "Video codec must be h264");
        assert.equal(probe.audioCodec, "aac", "Audio codec must be aac");
        assert.ok(probe.duration > 0, "Video duration must be greater than 0");
      } finally {
        if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
      }
    });

    it("3.2: Rejects requests missing URL with 400 JSON error", async () => {
      const req = new Request("http://localhost:3000/api/social/download", {
        method: "GET",
      });
      const res = await downloadSocialGet(req);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.ok(data.error);
    });

    it("3.3: Rejects invalid or malformed URL in convert route with 400 error", async () => {
      const req = new Request("http://localhost:3000/api/audio/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://invalid-site.com/nothing" }),
      });
      const res = await convertAudioPost(req);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.code, "INVALID_URL");
    });
  });
});
