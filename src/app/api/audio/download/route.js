import { NextResponse } from "next/server";
import CryptoJS from "crypto-js";

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

/**
 * Injects ISO/IEC 14496-12 standard metadata (title, artist, album, year, cover art)
 * into an MP4/M4A buffer and recalculates chunk offsets (stco / co64) to ensure full quality playback.
 */
function tagM4aBuffer(rawBuf, tags) {
  try {
    // 1. Locate moov atom
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

    // 2. Locate and strip existing udta atom in moov
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

    // 3. Build new udta atom containing tags & cover art
    const newUdta = buildUdta(tags);
    const updatedMoov = Buffer.concat([moovWithoutUdta, newUdta]);
    const delta = updatedMoov.length - moovSize;
    updatedMoov.writeUInt32BE(updatedMoov.length, 0);

    // 4. Update 32-bit chunk offsets (stco table)
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

    // 5. Update 64-bit chunk offsets (co64 table) if present
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

    // 6. Assemble final audio file
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

const FALLBACK_TRACK_STREAMS = {
  "track-midnight-pulse": "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3",
  "track-shadows-in-blue": "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=chill-abstract-intention-12099.mp3",
  "track-aether-resonance": "https://cdn.pixabay.com/download/audio/2022/11/06/audio_2484643534.mp3?filename=lofi-chill-medium-version-159456.mp3",
  "track-kuroshio-current": "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=ambient-piano-amp-strings-10711.mp3",
  "track-tokyo-monorail": "https://cdn.pixabay.com/download/audio/2022/02/07/audio_1e592795f5.mp3?filename=japanese-chill-hop-115316.mp3",
};

/**
 * Validates whether an audio buffer is genuine MP3 audio.
 * Genuine MP3 starts with an ID3 tag ('ID3' / 0x49 0x44 0x33)
 * or MPEG-1/2 Layer III sync frame (0xFF with Layer III bits).
 */
export function isMp3Buffer(buf) {
  if (!buf || buf.length < 4) return false;
  // 1. ID3v2 tag identifier
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    return true;
  }
  // 2. MPEG frame sync: 11 bits set to 1 (0xFF, 0xE0)
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
    const layer = (buf[1] >> 1) & 0x03;
    if (layer === 0x01) {
      return true; // MPEG Layer III
    }
  }
  return false;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get("trackId")?.trim() || "";
  const quality = (searchParams.get("quality") || "premium").toLowerCase();

  let targetBitrate = "320";
  let qualityLabel = "Premium 320k";
  if (quality === "high" || quality === "160") {
    targetBitrate = "160";
    qualityLabel = "High 160k";
  } else if (quality === "medium" || quality === "96") {
    targetBitrate = "96";
    qualityLabel = "Medium 96k";
  } else if (quality === "low" || quality === "48") {
    targetBitrate = "48";
    qualityLabel = "Low 48k";
  } else {
    targetBitrate = "320";
    qualityLabel = "Premium Full HD";
  }

  let audioUrl = searchParams.get("audioUrl")?.trim() || "";
  if (audioUrl) {
    audioUrl = audioUrl.replace(/_\d+\.mp4/, `_${targetBitrate}.mp4`);
  }

  const title = cleanHtmlText(searchParams.get("title")?.trim() || "Unknown Song");
  const artist = cleanHtmlText(searchParams.get("artist")?.trim() || "Unknown Artist");
  const album = cleanHtmlText(searchParams.get("album")?.trim() || "Single");
  const year = searchParams.get("year")?.trim() || "";
  const coverUrl = searchParams.get("coverUrl")?.trim() || "";

  // If track has a known curated MP3 stream
  if (trackId && FALLBACK_TRACK_STREAMS[trackId]) {
    audioUrl = FALLBACK_TRACK_STREAMS[trackId];
  }

  // If no direct audioUrl is provided, resolve via trackId first, then via search
  if (!audioUrl && trackId) {
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
        const encrypted = song?.more_info?.encrypted_media_url || song?.encrypted_media_url;
        if (encrypted) {
          const rawDecrypted = decryptMediaUrl(encrypted);
          if (rawDecrypted && rawDecrypted.startsWith("http")) {
            audioUrl = rawDecrypted.replace(/_\d+\.mp4/, `_${targetBitrate}.mp4`);
          }
        }
      }
    } catch (err) {
      console.warn("Could not resolve audioUrl via trackId:", err);
    }
  }

  if (!audioUrl) {
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
      console.warn("Could not resolve audioUrl for download:", err);
    }
  }

  if (!audioUrl) {
    return NextResponse.json(
      {
        success: false,
        error: "Playable audio stream could not be resolved for this track.",
        code: "AUDIO_NOT_FOUND",
      },
      { status: 404 }
    );
  }

  try {
    // 1. Fetch raw audio buffer and cover art in parallel
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
    if (!audioRes.ok) {
      // Try fallback bitrates in order of closest quality tier
      const tierFallbacks = {
        "48": ["96", "160", "320"],
        "96": ["48", "160", "320"],
        "160": ["320", "96", "48"],
        "320": ["160", "96", "48"],
      };
      const fallbackBitrates = tierFallbacks[targetBitrate] || ["320", "160", "96", "48"].filter((b) => b !== targetBitrate);
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
          qualityLabel = `${fb}k (Fallback)`;
          break;
        }
      }
    }

    if (!audioRes.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to retrieve audio stream from provider.",
          code: "STREAM_UNAVAILABLE",
        },
        { status: 502 }
      );
    }

    let rawAudioBuffer = Buffer.from(await audioRes.arrayBuffer());

    // Check if the stream is genuine MP3 audio
    let isGenuineMp3 = isMp3Buffer(rawAudioBuffer);

    // If stream is not MP3 and we have an ambient/fallback MP3 track stream, try that
    if (!isGenuineMp3 && trackId && FALLBACK_TRACK_STREAMS[trackId]) {
      try {
        const altRes = await fetch(FALLBACK_TRACK_STREAMS[trackId], {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
        if (altRes.ok) {
          const altBuf = Buffer.from(await altRes.arrayBuffer());
          if (isMp3Buffer(altBuf)) {
            rawAudioBuffer = altBuf;
            isGenuineMp3 = true;
          }
        }
      } catch (altErr) {
        console.warn("Alternative MP3 stream fetch failed:", altErr);
      }
    }

    // Determine audio format and prepare output buffer
    let outputBuffer = rawAudioBuffer;
    let ext = "mp3";
    let contentType = "audio/mpeg";

    if (isGenuineMp3) {
      ext = "mp3";
      contentType = "audio/mpeg";
      outputBuffer = rawAudioBuffer;
    } else {
      // If there is no MP3 file, download the available audio file
      const isM4a = rawAudioBuffer.subarray(4, 8).toString("latin1") === "ftyp";
      const isWav =
        rawAudioBuffer.length >= 12 &&
        rawAudioBuffer.subarray(0, 4).toString("latin1") === "RIFF" &&
        rawAudioBuffer.subarray(8, 12).toString("latin1") === "WAVE";
      const isFlac = rawAudioBuffer.length >= 4 && rawAudioBuffer.subarray(0, 4).toString("latin1") === "fLaC";
      const isOgg = rawAudioBuffer.length >= 4 && rawAudioBuffer.subarray(0, 4).toString("latin1") === "OggS";

      if (isM4a) {
        ext = "m4a";
        contentType = "audio/mp4";
        // Tag M4A with track metadata and cover art if available
        let imageBuffer = null;
        if (imgRes && imgRes.ok) {
          try {
            imageBuffer = Buffer.from(await imgRes.arrayBuffer());
          } catch {}
        }
        outputBuffer = tagM4aBuffer(rawAudioBuffer, {
          title,
          artist,
          album,
          year,
          cover: imageBuffer,
        });
      } else if (isWav) {
        ext = "wav";
        contentType = "audio/wav";
      } else if (isFlac) {
        ext = "flac";
        contentType = "audio/flac";
      } else if (isOgg) {
        ext = "ogg";
        contentType = "audio/ogg";
      } else {
        // Fallback available format
        ext = audioUrl.includes(".aac") ? "aac" : "m4a";
        contentType = audioUrl.includes(".aac") ? "audio/aac" : "audio/mp4";
      }
    }

    // Format clean filename: "[Title] - [Artist] [Quality].[ext]"
    const safeArtist = artist.replace(/[\/\\?%*:|"<>]/g, "").trim();
    const safeTitle = title.replace(/[\/\\?%*:|"<>]/g, "").trim();
    const cleanFilename = safeTitle && safeArtist ? `${safeTitle} - ${safeArtist}` : safeTitle || safeArtist || "track";
    const downloadFilename = `${cleanFilename} [${qualityLabel}].${ext}`;

    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${downloadFilename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`,
        "Content-Length": outputBuffer.length.toString(),
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
