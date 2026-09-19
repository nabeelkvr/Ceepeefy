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
    return new NextResponse("Audio stream not found", { status: 404 });
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
      return new NextResponse("Failed to retrieve audio stream", { status: 502 });
    }

    const rawAudioBuffer = Buffer.from(await audioRes.arrayBuffer());
    let coverBuffer = null;
    if (imgRes && imgRes.ok) {
      coverBuffer = Buffer.from(await imgRes.arrayBuffer());
    }

    // 2. Tag M4A audio with Title, Artist, Album, Year, and Cover Art
    let finalBuffer = rawAudioBuffer;
    const isM4a = rawAudioBuffer.subarray(4, 8).toString("latin1") === "ftyp";

    if (isM4a) {
      finalBuffer = tagM4aBuffer(rawAudioBuffer, {
        title,
        artist,
        album,
        year,
        cover: coverBuffer,
      });
    }

    // 3. Format clean filename: "[Artist] - [Title] [Quality].m4a"
    const safeArtist = artist.replace(/[\/\\?%*:|"<>]/g, "").trim();
    const safeTitle = title.replace(/[\/\\?%*:|"<>]/g, "").trim();
    const cleanFilename = safeArtist && safeTitle ? `${safeArtist} - ${safeTitle}` : safeTitle || "track";
    const extension = isM4a ? "m4a" : "mp3";
    const downloadFilename = `${cleanFilename} [${qualityLabel}].${extension}`;

    return new NextResponse(finalBuffer, {
      status: 200,
      headers: {
        "Content-Type": isM4a ? "audio/mp4" : "audio/mpeg",
        "Content-Disposition": `attachment; filename="${downloadFilename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`,
        "Content-Length": finalBuffer.length.toString(),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("Audio download error:", err);
    return new NextResponse("Internal Server Error while processing audio download", { status: 500 });
  }
}
