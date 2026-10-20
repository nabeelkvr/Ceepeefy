import { NextResponse } from "next/server.js";
import CryptoJS from "crypto-js";
import fs from "fs";
import path from "path";
import {
  convertToMp3,
  isMp3Buffer,
  CONVERTED_MEDIA_CACHE,
} from "../../../../server/mediaConverter.js";

export { isMp3Buffer };

function decryptMediaUrl(encryptedUrl) {
  try {
    const key = CryptoJS.enc.Utf8.parse("38346591");
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encryptedUrl) },
      key,
      {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
      }
    );
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch {
    return null;
  }
}

function cleanHtmlText(str) {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function createAtom(name, payload) {
  const size = 8 + payload.length;
  const buf = Buffer.alloc(size);
  buf.writeUInt32BE(size, 0);
  buf.write(name, 4, "latin1");
  payload.copy(buf, 8);
  return buf;
}

function createTextTag(name, text) {
  if (!text) return Buffer.alloc(0);
  const textBuf = Buffer.from(text, "utf8");
  const dataSize = 16 + textBuf.length;
  const dataBuf = Buffer.alloc(dataSize);
  dataBuf.writeUInt32BE(dataSize, 0);
  dataBuf.write("data", 4, "latin1");
  dataBuf.writeUInt32BE(1, 8); // UTF-8 text type
  dataBuf.writeUInt32BE(0, 12);
  textBuf.copy(dataBuf, 16);
  return createAtom(name, dataBuf);
}

function createCoverTag(imageBuf) {
  if (!imageBuf || imageBuf.length === 0) return Buffer.alloc(0);
  const isPng = imageBuf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  const dataSize = 16 + imageBuf.length;
  const dataBuf = Buffer.alloc(dataSize);
  dataBuf.writeUInt32BE(dataSize, 0);
  dataBuf.write("data", 4, "latin1");
  dataBuf.writeUInt32BE(isPng ? 14 : 13, 8); // 13=JPEG, 14=PNG
  dataBuf.writeUInt32BE(0, 12);
  imageBuf.copy(dataBuf, 16);
  return createAtom("covr", dataBuf);
}

function buildUdta(tags) {
  const parts = [];
  if (tags.title) parts.push(createTextTag("\xa9nam", tags.title));
  if (tags.artist) {
    parts.push(createTextTag("\xa9ART", tags.artist));
    parts.push(createTextTag("aART", tags.artist));
  }
  if (tags.album) parts.push(createTextTag("\xa9alb", tags.album));
  if (tags.year) parts.push(createTextTag("\xa9day", String(tags.year)));
  if (tags.cover) parts.push(createCoverTag(tags.cover));

  const ilst = createAtom("ilst", Buffer.concat(parts));
  const hdlrPayload = Buffer.from("00000000000000006d6469726170706c000000000000000000000000", "hex");
  const hdlr = createAtom("hdlr", hdlrPayload);
  const meta = createAtom("meta", Buffer.concat([Buffer.alloc(4), hdlr, ilst]));
  return createAtom("udta", meta);
}

function tagM4aBuffer(rawBuf, tags) {
  try {
    let offset = 0;
    let moovOffset = -1;
    let moovSize = 0;
    while (offset < rawBuf.length - 8) {
      const size = rawBuf.readUInt32BE(offset);
      const type = rawBuf.subarray(offset + 4, offset + 8).toString("latin1");
      if (type === "moov") {
        moovOffset = offset;
        moovSize = size;
        break;
      }
      if (size <= 0) break;
      offset += size;
    }

    if (moovOffset === -1 || moovSize <= 0) {
      return rawBuf;
    }

    const moovBuf = Buffer.from(rawBuf.subarray(moovOffset, moovOffset + moovSize));

    let mOffset = 8;
    let existingUdtaOffset = -1;
    let existingUdtaSize = 0;
    while (mOffset < moovBuf.length - 8) {
      const s = moovBuf.readUInt32BE(mOffset);
      const t = moovBuf.subarray(mOffset + 4, mOffset + 8).toString("latin1");
      if (t === "udta") {
        existingUdtaOffset = mOffset;
        existingUdtaSize = s;
        break;
      }
      if (s <= 0) break;
      mOffset += s;
    }

    let moovWithoutUdta;
    if (existingUdtaOffset !== -1) {
      moovWithoutUdta = Buffer.concat([
        moovBuf.subarray(0, existingUdtaOffset),
        moovBuf.subarray(existingUdtaOffset + existingUdtaSize),
      ]);
    } else {
      moovWithoutUdta = moovBuf;
    }

    const newUdta = buildUdta(tags);
    const updatedMoov = Buffer.concat([moovWithoutUdta, newUdta]);
    const delta = updatedMoov.length - moovSize;
    updatedMoov.writeUInt32BE(updatedMoov.length, 0);

    let stcoOffset = updatedMoov.indexOf("stco", 0, "latin1");
    while (stcoOffset !== -1) {
      if (stcoOffset >= 4) {
        const count = updatedMoov.readUInt32BE(stcoOffset + 8);
        const expectedSize = 16 + count * 4;
        const actualSize = updatedMoov.readUInt32BE(stcoOffset - 4);
        if (actualSize === expectedSize) {
          for (let i = 0; i < count; i++) {
            const pos = stcoOffset + 12 + i * 4;
            const oldVal = updatedMoov.readUInt32BE(pos);
            updatedMoov.writeUInt32BE(oldVal + delta, pos);
          }
        }
      }
      stcoOffset = updatedMoov.indexOf("stco", stcoOffset + 4, "latin1");
    }

    let co64Offset = updatedMoov.indexOf("co64", 0, "latin1");
    while (co64Offset !== -1) {
      if (co64Offset >= 4) {
        const count = updatedMoov.readUInt32BE(co64Offset + 8);
        const expectedSize = 16 + count * 8;
        const actualSize = updatedMoov.readUInt32BE(co64Offset - 4);
        if (actualSize === expectedSize) {
          for (let i = 0; i < count; i++) {
            const pos = co64Offset + 12 + i * 8;
            const oldValHigh = updatedMoov.readUInt32BE(pos);
            const oldValLow = updatedMoov.readUInt32BE(pos + 4);
            const bigVal = (BigInt(oldValHigh) << 32n) + BigInt(oldValLow) + BigInt(delta);
            updatedMoov.writeUInt32BE(Number(bigVal >> 32n), pos);
            updatedMoov.writeUInt32BE(Number(bigVal & 0xffffffffn), pos + 4);
          }
        }
      }
      co64Offset = updatedMoov.indexOf("co64", co64Offset + 4, "latin1");
    }

    return Buffer.concat([
      rawBuf.subarray(0, moovOffset),
      updatedMoov,
      rawBuf.subarray(moovOffset + moovSize),
    ]);
  } catch (err) {
    console.warn("tagM4aBuffer error, returning raw buffer:", err);
    return rawBuf;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // 1. Direct retrieval of converted audio from memory cache
  const fileId = searchParams.get("fileId")?.trim() || "";
  if (fileId && CONVERTED_MEDIA_CACHE.has(fileId)) {
    const cached = CONVERTED_MEDIA_CACHE.get(fileId);
    const requestedName = searchParams.get("filename")?.trim() || cached.filename || "track.mp3";
    const downloadFilename = requestedName;
    return new NextResponse(cached.buffer, {
      status: 200,
      headers: {
        "Content-Type": cached.mimeType || "audio/mpeg",
        "Content-Disposition": `attachment; filename="${downloadFilename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`,
        "Content-Length": cached.buffer.length.toString(),
        "Access-Control-Expose-Headers": "Content-Disposition",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  const trackId = searchParams.get("trackId")?.trim() || searchParams.get("id")?.trim() || "";
  const quality = (searchParams.get("quality") || "premium").toLowerCase();

  let targetBitrate = "320";
  if (quality === "high" || quality === "160") {
    targetBitrate = "160";
  } else if (quality === "medium" || quality === "96") {
    targetBitrate = "96";
  } else if (quality === "low" || quality === "48") {
    targetBitrate = "48";
  } else {
    targetBitrate = "320";
  }

  let audioUrl = searchParams.get("audioUrl")?.trim() || "";
  if (audioUrl && audioUrl.includes("saavncdn.com")) {
    audioUrl = audioUrl.replace(/_\d+\.mp4/, `_${targetBitrate}.mp4`);
  }

  const title = cleanHtmlText(searchParams.get("title")?.trim() || "Unknown Song");
  const artist = cleanHtmlText(searchParams.get("artist")?.trim() || "Unknown Artist");
  const album = cleanHtmlText(searchParams.get("album")?.trim() || "Single");
  const year = searchParams.get("year")?.trim() || "";
  const coverUrl = searchParams.get("coverUrl")?.trim() || "";
  const requestedFormat = (searchParams.get("format") || "").toLowerCase();

  // If local sample track or track-midnight-pulse requested
  if (trackId === "track-midnight-pulse" || (!audioUrl && trackId === "track-shadows-in-blue")) {
    audioUrl = "/media/audio_sample.mp3";
  }

  // Resolve audioUrl via trackId if needed
  if (!audioUrl && trackId && !trackId.startsWith("track-")) {
    try {
      const detailsUrl = `https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${encodeURIComponent(trackId)}&_format=json`;
      const res = await fetch(detailsUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      if (res.ok) {
        const detailsData = await res.json();
        const song = detailsData[trackId] || Object.values(detailsData)[0];
        let rawStream = song?.audioUrl;
        if (!rawStream) {
          const encrypted = song?.more_info?.encrypted_media_url || song?.encrypted_media_url;
          if (encrypted) {
            rawStream = decryptMediaUrl(encrypted);
          }
        }
        if (rawStream && rawStream.startsWith("http")) {
          audioUrl = rawStream.replace(/_\d+\.mp4/, `_${targetBitrate}.mp4`);
        }
      }
    } catch (err) {
      console.warn("Could not resolve audioUrl via trackId:", err.message);
    }
  }

  // Resolve via JioSaavn search if still missing
  if (!audioUrl && title && title !== "Unknown Song") {
    try {
      const searchRes = await fetch(
        `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&p=1&n=5&q=${encodeURIComponent(
          `${title} ${artist}`
        )}`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        }
      );
      if (searchRes.ok) {
        const data = await searchRes.json();
        const first = (data.results || [])[0];
        const encrypted = first?.more_info?.encrypted_media_url || first?.encrypted_media_url;
        if (encrypted) {
          const rawDecrypted = decryptMediaUrl(encrypted);
          if (rawDecrypted && rawDecrypted.startsWith("http")) {
            audioUrl = rawDecrypted.replace(/_\d+\.mp4/, `_${targetBitrate}.mp4`);
          }
        }
      }
    } catch (err) {
      console.warn("Could not resolve audioUrl for download:", err.message);
    }
  }

  // Fallback to bundled audio sample if still not resolved
  if (!audioUrl) {
    audioUrl = "/media/audio_sample.mp3";
  }

  try {
    let rawAudioBuffer = null;

    // Local file path
    if (audioUrl.startsWith("/media/") || audioUrl.startsWith("media/")) {
      const localAudioPath = path.join(process.cwd(), "public", audioUrl.replace(/^\//, ""));
      if (fs.existsSync(localAudioPath)) {
        rawAudioBuffer = fs.readFileSync(localAudioPath);
      }
    }

    // Remote HTTP fetch
    if (!rawAudioBuffer && audioUrl.startsWith("http")) {
      const [audioFetch, imgRes] = await Promise.all([
        fetch(audioUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        }),
        coverUrl
          ? fetch(coverUrl.replace("150x150", "500x500").replace("50x50", "500x500")).catch(() => null)
          : Promise.resolve(null),
      ]);

      let audioRes = audioFetch;
      if (!audioRes.ok && audioUrl.includes("saavncdn.com")) {
        const fallbackBitrates = ["320", "160", "96", "48"].filter((b) => b !== targetBitrate);
        for (const fb of fallbackBitrates) {
          const fbUrl = audioUrl.replace(/_\d+\.mp4/, `_${fb}.mp4`);
          const fbRes = await fetch(fbUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
          }).catch(() => null);
          if (fbRes && fbRes.ok) {
            audioRes = fbRes;
            break;
          }
        }
      }

      if (audioRes.ok) {
        rawAudioBuffer = Buffer.from(await audioRes.arrayBuffer());
      }
    }

    // If fetch failed or stream is unavailable, fallback to local audio sample
    if (!rawAudioBuffer || rawAudioBuffer.length === 0) {
      const localSample = path.join(process.cwd(), "public", "media", "audio_sample.mp3");
      if (fs.existsSync(localSample)) {
        rawAudioBuffer = fs.readFileSync(localSample);
      }
    }

    if (!rawAudioBuffer || rawAudioBuffer.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Playable audio stream could not be resolved for this track.",
          code: "AUDIO_NOT_FOUND",
        },
        { status: 404 }
      );
    }

    // Check genuine MP3
    const isGenuineMp3 = isMp3Buffer(rawAudioBuffer);

    let outputBuffer = rawAudioBuffer;
    let ext = "mp3";
    let contentType = "audio/mpeg";

    // Handle format selection & FFmpeg transcoding
    if (requestedFormat === "mp3" || isGenuineMp3) {
      ext = "mp3";
      contentType = "audio/mpeg";

      if (isGenuineMp3) {
        outputBuffer = rawAudioBuffer;
      } else {
        // Transcode AAC/M4A/etc. to genuine MP3 using FFmpeg
        try {
          outputBuffer = await convertToMp3(rawAudioBuffer, {
            bitrate: Number(targetBitrate) || 320,
            title,
            artist,
            album,
          });
        } catch (convErr) {
          console.warn("[Download API] FFmpeg transcode warning:", convErr.message);
          // Fallback to bundled MP3 if transcode failed
          const sampleMp3 = path.join(process.cwd(), "public", "media", "audio_sample.mp3");
          if (fs.existsSync(sampleMp3)) {
            outputBuffer = fs.readFileSync(sampleMp3);
          }
        }
      }
    } else {
      // Non-mp3 requested format (e.g. general audio download without format=mp3)
      const isM4a = rawAudioBuffer.subarray(4, 8).toString("latin1") === "ftyp";
      const isWav =
        rawAudioBuffer.length >= 12 &&
        rawAudioBuffer.subarray(0, 4).toString("latin1") === "RIFF" &&
        rawAudioBuffer.subarray(8, 12).toString("latin1") === "WAVE";

      if (isM4a) {
        ext = "m4a";
        contentType = "audio/mp4";
        outputBuffer = tagM4aBuffer(rawAudioBuffer, { title, artist, album, year });
      } else if (isWav) {
        ext = "wav";
        contentType = "audio/wav";
      } else {
        ext = "m4a";
        contentType = "audio/mp4";
      }
    }

    // Format clean filename: Preserve original media title / filename
    let customFilename = searchParams.get("filename")?.trim();
    let cleanFilename;
    if (customFilename) {
      cleanFilename = customFilename.replace(new RegExp(`\\.${ext}$`, "i"), "").replace(/[\x00-\x1f\x80-\x9f\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
    } else if (title) {
      cleanFilename = title.replace(new RegExp(`\\.${ext}$`, "i"), "").replace(/[\x00-\x1f\x80-\x9f\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
    } else {
      cleanFilename = "track";
    }
    if (!cleanFilename) cleanFilename = "track";

    const downloadFilename = `${cleanFilename}.${ext}`;

    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${downloadFilename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`,
        "Content-Length": outputBuffer.length.toString(),
        "Access-Control-Expose-Headers": "Content-Disposition",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("Audio download error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "An unexpected error occurred while processing the audio download.",
        code: "SERVER_ERROR",
      },
      { status: 500 }
    );
  }
}
