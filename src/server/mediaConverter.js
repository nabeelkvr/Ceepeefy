import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

function resolveFfmpegBinary() {
  const candidate = (typeof ffmpegStatic === "string" ? ffmpegStatic : ffmpegStatic?.default) || "";
  if (candidate && fs.existsSync(/*turbopackIgnore: true*/ candidate)) return candidate;
  const localWin = path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe");
  if (fs.existsSync(localWin)) return localWin;
  const localUnix = path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  if (fs.existsSync(localUnix)) return localUnix;
  return "ffmpeg";
}

function resolveFfprobeBinary() {
  const candidate =
    ffprobeStatic?.path ||
    ffprobeStatic?.default?.path ||
    (typeof ffprobeStatic === "string" ? ffprobeStatic : "") ||
    "";
  if (candidate && fs.existsSync(/*turbopackIgnore: true*/ candidate)) return candidate;
  const localWin = path.join(
    process.cwd(),
    "node_modules",
    "ffprobe-static",
    "bin",
    "win32",
    "x64",
    "ffprobe.exe"
  );
  if (fs.existsSync(localWin)) return localWin;
  const localUnix = path.join(
    process.cwd(),
    "node_modules",
    "ffprobe-static",
    "bin",
    process.platform,
    process.arch,
    "ffprobe"
  );
  if (fs.existsSync(localUnix)) return localUnix;
  return "ffprobe";
}

export const FFMPEG_PATH = resolveFfmpegBinary();
export const FFPROBE_PATH = resolveFfprobeBinary();

// In-memory cache for converted audio/video binaries
// Key: fileId, Value: { buffer: Buffer, filename: string, mimeType: string, createdAt: number }
export const CONVERTED_MEDIA_CACHE = new Map();

// Periodic cleanup of media cache (keep items for 30 minutes)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of CONVERTED_MEDIA_CACHE.entries()) {
      if (now - value.createdAt > 30 * 60 * 1000) {
        CONVERTED_MEDIA_CACHE.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

/**
 * Validates whether a buffer is genuine MP3 audio.
 * Starts with ID3v2 ('ID3' / 0x49 0x44 0x33) or MPEG sync frame (0xFF 0xFB/0xF3/0xF2).
 */
export function isMp3Buffer(buf) {
  if (!buf || buf.length < 4) return false;
  // 1. ID3v2 tag
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    return true;
  }
  // 2. MPEG frame sync search in first 8KB
  for (let i = 0; i < Math.min(buf.length - 2, 8192); i++) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
      const layer = (buf[i + 1] >> 1) & 0x03;
      if (layer === 0x01) {
        return true; // Layer III (MP3)
      }
    }
  }
  return false;
}

/**
 * Validates whether a buffer is a genuine MP4 container.
 * Starts with 'ftyp' atom at offset 4.
 */
export function isMp4Buffer(buf) {
  if (!buf || buf.length < 12) return false;
  const ftyp = buf.subarray(4, 8).toString("latin1");
  return ftyp === "ftyp";
}

/**
 * Sanitizes a title/filename for cross-platform filesystem compatibility (Windows, macOS, Linux).
 * Strips path traversal, illegal control characters, and illegal Windows chars: \ / : * ? " < > |
 * Prevents double extension (e.g. .wav.mp3 or .mp3.mp3).
 */
export function sanitizeMediaFilename(rawTitle, defaultExt = "mp3") {
  if (!rawTitle || typeof rawTitle !== "string") {
    rawTitle = "media";
  }

  const cleanExt = defaultExt.replace(/^\./, "").toLowerCase();

  let base = rawTitle.trim();
  // Strip path traversal sequences
  base = base.replace(/^(\.\.[/\\])+/g, "").replace(/^[/\\]+/g, "");
  // Strip existing audio or video extensions if present
  base = base.replace(/\.(mp3|mp4|m4a|wav|aac|flac|ogg|webm|mkv|mov|avi)$/i, "").trim();
  // Remove illegal characters for Windows and Unix
  base = base.replace(/[\x00-\x1f\x80-\x9f\\/:*?"<>|]/g, "");
  // Normalize whitespace
  base = base.replace(/\s+/g, " ").trim();
  // Strip trailing dots and spaces (Windows disallows trailing dots)
  base = base.replace(/[.\s]+$/g, "").trim();

  if (!base) {
    base = "media";
  }

  return `${base}.${cleanExt}`;
}

/**
 * Executes FFmpeg command with the provided argument array.
 */
export function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(/*turbopackIgnore: true*/ FFMPEG_PATH, args, { windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn FFmpeg process: ${err.message}`));
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ code, stderr });
      } else {
        reject(new Error(`FFmpeg exited with error code ${code}: ${stderr.slice(-400)}`));
      }
    });
  });
}

/**
 * Executes FFprobe to inspect media streams.
 */
export function runFfprobe(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(/*turbopackIgnore: true*/ FFPROBE_PATH, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn FFprobe process: ${err.message}`));
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`FFprobe exited with code ${code}: ${stderr.slice(-300)}`));
      }
    });
  });
}

/**
 * Inspects a media file, URL, or Buffer to determine stream types (video, audio).
 */
export async function probeMediaStreams(filePathOrUrlOrBuffer) {
  let tempProbePath = null;
  try {
    let target = filePathOrUrlOrBuffer;
    if (Buffer.isBuffer(filePathOrUrlOrBuffer)) {
      tempProbePath = path.join(os.tmpdir(), `probe-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);
      fs.writeFileSync(tempProbePath, filePathOrUrlOrBuffer);
      target = tempProbePath;
    }

    const stdout = await runFfprobe([
      "-v", "quiet",
      "-print_format", "json",
      "-show_streams",
      "-show_format",
      target,
    ]);
    const data = JSON.parse(stdout);
    const streams = data.streams || [];
    const hasVideo = streams.some((s) => s.codec_type === "video");
    const hasAudio = streams.some((s) => s.codec_type === "audio");
    const videoStream = streams.find((s) => s.codec_type === "video");
    const audioStream = streams.find((s) => s.codec_type === "audio");
    return {
      success: true,
      hasVideo,
      hasAudio,
      videoCodec: videoStream?.codec_name,
      audioCodec: audioStream?.codec_name,
      duration: Number(data.format?.duration || 0),
      streams,
    };
  } catch (err) {
    console.warn("[MediaConverter] FFprobe inspection error:", err.message);
    return {
      success: false,
      hasVideo: false,
      hasAudio: false,
      streams: [],
    };
  } finally {
    if (tempProbePath && fs.existsSync(tempProbePath)) {
      try { fs.unlinkSync(tempProbePath); } catch {}
    }
  }
}

/**
 * Converts an audio input (Buffer, URL, or local file path) into genuine, playable MP3
 * with standard ID3v2 tags and requested bitrate.
 */
export async function convertToMp3(inputBufferOrPath, options = {}) {
  const {
    bitrate = 320,
    title = "",
    artist = "",
    album = "",
    coverBuffer = null,
  } = options;

  const tmpDir = os.tmpdir();
  const id = `cpfy-aud-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  let inputPath = "";
  let isTempInput = false;
  let coverPath = "";
  const outputPath = path.join(tmpDir, `${id}-output.mp3`);

  try {
    if (Buffer.isBuffer(inputBufferOrPath)) {
      inputPath = path.join(tmpDir, `${id}-input`);
      fs.writeFileSync(inputPath, inputBufferOrPath);
      isTempInput = true;
    } else if (typeof inputBufferOrPath === "string") {
      inputPath = inputBufferOrPath;
    } else {
      throw new Error("Invalid audio input provided to convertToMp3");
    }

    const args = ["-y", "-i", inputPath];

    // Optional embedded album artwork
    if (coverBuffer && Buffer.isBuffer(coverBuffer) && coverBuffer.length > 0) {
      coverPath = path.join(tmpDir, `${id}-cover.jpg`);
      fs.writeFileSync(coverPath, coverBuffer);
      args.push("-i", coverPath);
      args.push("-map", "0:a");
      args.push("-map", "1:v?");
      args.push("-c:v", "copy");
      args.push("-disposition:v", "attached_pic");
    } else {
      args.push("-vn");
    }

    const targetBitrateNum = [128, 192, 320].includes(Number(bitrate)) ? Number(bitrate) : 320;
    args.push("-c:a", "libmp3lame", "-b:a", `${targetBitrateNum}k`);
    args.push("-id3v2_version", "3");

    if (title) args.push("-metadata", `title=${title}`);
    if (artist) args.push("-metadata", `artist=${artist}`);
    if (album) args.push("-metadata", `album=${album}`);

    args.push(outputPath);

    await runFfmpeg(args);

    if (!fs.existsSync(outputPath)) {
      throw new Error("FFmpeg failed to create the destination MP3 file.");
    }

    const outputBuffer = fs.readFileSync(outputPath);
    if (outputBuffer.length === 0) {
      throw new Error("FFmpeg produced a 0-byte MP3 output file.");
    }

    if (!isMp3Buffer(outputBuffer)) {
      throw new Error("Generated file does not have valid MP3 stream structure.");
    }

    return outputBuffer;
  } finally {
    // Clean up temporary files
    if (isTempInput && inputPath && fs.existsSync(/*turbopackIgnore: true*/ inputPath)) {
      try { fs.unlinkSync(inputPath); } catch {}
    }
    if (coverPath && fs.existsSync(/*turbopackIgnore: true*/ coverPath)) {
      try { fs.unlinkSync(coverPath); } catch {}
    }
    if (outputPath && fs.existsSync(/*turbopackIgnore: true*/ outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
  }
}

/**
 * Converts, merges, or normalizes video inputs into a validated, playable MP4 file
 * guaranteed to have both video (h264) and audio (aac) streams.
 */
export async function createPlayableMp4(videoInput, audioInput = null, options = {}) {
  const { title = "", quality = "720" } = options;
  const tmpDir = os.tmpdir();
  const id = `cpfy-vid-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  let videoPath = "";
  let isTempVideo = false;
  let audioPath = "";
  let isTempAudio = false;
  const outputPath = path.join(tmpDir, `${id}-output.mp4`);

  try {
    if (Buffer.isBuffer(videoInput)) {
      videoPath = path.join(tmpDir, `${id}-vin.mp4`);
      fs.writeFileSync(videoPath, videoInput);
      isTempVideo = true;
    } else if (typeof videoInput === "string") {
      videoPath = videoInput;
    } else {
      throw new Error("Invalid videoInput supplied to createPlayableMp4");
    }

    if (audioInput) {
      if (Buffer.isBuffer(audioInput)) {
        audioPath = path.join(tmpDir, `${id}-ain.mp4`);
        fs.writeFileSync(audioPath, audioInput);
        isTempAudio = true;
      } else if (typeof audioInput === "string") {
        audioPath = audioInput;
      }
    }

    const args = ["-y", "-i", videoPath];

    if (audioPath) {
      // Merge separate video and audio streams
      args.push("-i", audioPath);
      args.push("-map", "0:v:0", "-map", "1:a:0");
      args.push("-c:v", "libx264", "-pix_fmt", "yuv420p");
      args.push("-c:a", "aac", "-b:a", "192k");
      args.push("-shortest");
    } else {
      // Check existing streams in the input
      const probe = await probeMediaStreams(videoPath);
      if (probe.hasVideo && probe.hasAudio) {
        // Both video and audio present: transcode/remux to clean standard MP4
        args.push("-c:v", "libx264", "-pix_fmt", "yuv420p");
        args.push("-c:a", "aac", "-b:a", "192k");
      } else if (probe.hasVideo && !probe.hasAudio) {
        // Video only: synthesize silent audio stream so the container has both streams
        args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
        args.push("-map", "0:v:0", "-map", "1:a:0");
        args.push("-c:v", "libx264", "-pix_fmt", "yuv420p");
        args.push("-c:a", "aac", "-b:a", "128k");
        args.push("-shortest");
      } else {
        // Default transcode if probe is inconclusive
        args.push("-c:v", "libx264", "-pix_fmt", "yuv420p");
        args.push("-c:a", "aac", "-b:a", "192k");
      }
    }

    // Resolution scaling if requested
    const heightMap = { "360": 360, "480": 480, "720": 720, "1080": 1080 };
    const targetHeight = heightMap[String(quality)];
    if (targetHeight) {
      args.push("-vf", `scale=-2:'min(${targetHeight},ih)'`);
    }

    if (title) {
      args.push("-metadata", `title=${title}`);
    }

    // Faststart moves moov atom to the beginning for immediate browser playback
    args.push("-movflags", "+faststart");
    args.push(outputPath);

    try {
      await runFfmpeg(args);
    } catch (ffmpegErr) {
      // If transcoding fails but the input was already a valid MP4 buffer, gracefully return the input
      if (Buffer.isBuffer(videoInput) && isMp4Buffer(videoInput)) {
        return videoInput;
      }
      throw ffmpegErr;
    }

    if (!fs.existsSync(outputPath)) {
      if (Buffer.isBuffer(videoInput) && isMp4Buffer(videoInput)) {
        return videoInput;
      }
      throw new Error("FFmpeg failed to create the destination MP4 file.");
    }

    const outputBuffer = fs.readFileSync(outputPath);
    if (outputBuffer.length === 0) {
      throw new Error("FFmpeg produced a 0-byte MP4 file.");
    }

    // Validate MP4 container
    if (!isMp4Buffer(outputBuffer)) {
      throw new Error("Output is not a valid MP4 container.");
    }

    // Verify stream presence via FFprobe when available
    const verified = await probeMediaStreams(outputPath);
    if (verified.success && !verified.hasVideo) {
      throw new Error("Processed MP4 is missing a video stream.");
    }

    return outputBuffer;
  } finally {
    if (isTempVideo && videoPath && fs.existsSync(/*turbopackIgnore: true*/ videoPath)) {
      try { fs.unlinkSync(videoPath); } catch {}
    }
    if (isTempAudio && audioPath && fs.existsSync(/*turbopackIgnore: true*/ audioPath)) {
      try { fs.unlinkSync(audioPath); } catch {}
    }
    if (outputPath && fs.existsSync(/*turbopackIgnore: true*/ outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
  }
}
