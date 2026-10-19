import { NextResponse } from "next/server";
import {
  detectPlatformFromUrl,
  validatePlatformUrl,
  extractYouTubeId,
  extractInstagramShortcode,
  extractXStatusId,
  derivePlatformTitleAndAuthor,
  QUALITY_OPTIONS,
} from "../../../../services/socialDownloaderService.js";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { url, platform } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Please paste a share link to fetch media.",
          code: "MISSING_URL",
        },
        { status: 400 }
      );
    }

    const validation = validatePlatformUrl(url, platform);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error,
          mismatch: validation.mismatch || false,
          detectedPlatform: validation.detectedPlatform || null,
          code: "INVALID_URL",
        },
        { status: 400 }
      );
    }

    const cleanUrl = url.trim();
    let mediaInfo = null;
    const derived = derivePlatformTitleAndAuthor(cleanUrl, platform);

    // =========================================================================
    // 1. YouTube Video / Short
    // =========================================================================
    if (platform === "youtube") {
      const ytId = extractYouTubeId(cleanUrl);
      let title = derived.title || "YouTube Video";
      let author = derived.author || "YouTube Creator";
      let thumbnail = ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80";

      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId || ""}&format=json`,
          {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(3500),
          }
        );
        if (oembedRes.ok) {
          const data = await oembedRes.json();
          title = data.title || title;
          author = data.author_name || author;
          if (data.thumbnail_url) {
            thumbnail = data.thumbnail_url;
          }
        }
      } catch (e) {
        console.warn("[SocialDownloader] YouTube oEmbed fallback:", e.message);
      }

      mediaInfo = {
        id: `yt-${ytId || Date.now()}`,
        platform: "youtube",
        platformName: "YouTube",
        title,
        author,
        thumbnail,
        duration: "3:00",
        format: "MP4 Video",
        availableQualities: QUALITY_OPTIONS,
        downloadUrl: `/api/social/download?url=${encodeURIComponent(cleanUrl)}&platform=youtube&title=${encodeURIComponent(title)}`,
        canDownload: true,
        isPublic: true,
        sourceUrl: cleanUrl,
      };
    }

    // =========================================================================
    // 2. Instagram Reel / Post / Story
    // =========================================================================
    else if (platform === "instagram") {
      const shortcode = extractInstagramShortcode(cleanUrl);
      let title = derived.title || "Instagram Video";
      let author = derived.author || "Instagram User";
      let thumbnail = "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600&auto=format&fit=crop&q=80";

      try {
        const oembedRes = await fetch(
          `https://api.instagram.com/oembed/?url=${encodeURIComponent(cleanUrl)}`,
          {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(3500),
          }
        );
        if (oembedRes.ok) {
          const data = await oembedRes.json();
          title = data.title ? (data.title.length > 80 ? data.title.substring(0, 77) + "..." : data.title) : title;
          author = data.author_name ? `@${data.author_name}` : author;
          if (data.thumbnail_url) {
            thumbnail = data.thumbnail_url;
          }
        }
      } catch (e) {
        console.warn("[SocialDownloader] Instagram oEmbed fallback:", e.message);
      }

      mediaInfo = {
        id: `ig-${shortcode || Date.now()}`,
        platform: "instagram",
        platformName: "Instagram",
        title,
        author,
        thumbnail,
        duration: "0:45",
        format: "MP4 Video",
        availableQualities: QUALITY_OPTIONS,
        downloadUrl: `/api/social/download?url=${encodeURIComponent(cleanUrl)}&platform=instagram&title=${encodeURIComponent(title)}`,
        canDownload: true,
        isPublic: true,
        sourceUrl: cleanUrl,
      };
    }

    // =========================================================================
    // 3. X (Twitter) Video Post
    // =========================================================================
    else if (platform === "x") {
      const statusId = extractXStatusId(cleanUrl);
      let title = derived.title || "X Video Post";
      let author = derived.author || "X Creator";
      let thumbnail = "https://images.unsplash.com/photo-1611605698335-8b1569810432?w=600&auto=format&fit=crop&q=80";

      try {
        const oembedRes = await fetch(
          `https://publish.twitter.com/oembed?url=${encodeURIComponent(cleanUrl)}&omit_script=true`,
          {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(3500),
          }
        );
        if (oembedRes.ok) {
          const data = await oembedRes.json();
          author = data.author_name ? `${data.author_name} (@${data.author_url?.split("/").pop() || ""})` : author;
          if (data.html) {
            const stripped = data.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            title = stripped.length > 90 ? stripped.substring(0, 87) + "..." : stripped;
          }
        }
      } catch (e) {
        console.warn("[SocialDownloader] X oEmbed fallback:", e.message);
      }

      mediaInfo = {
        id: `x-${statusId || Date.now()}`,
        platform: "x",
        platformName: "X",
        title,
        author,
        thumbnail,
        duration: "1:15",
        format: "MP4 Video",
        availableQualities: QUALITY_OPTIONS,
        downloadUrl: `/api/social/download?url=${encodeURIComponent(cleanUrl)}&platform=x&title=${encodeURIComponent(title)}`,
        canDownload: true,
        isPublic: true,
        sourceUrl: cleanUrl,
      };
    }

    // =========================================================================
    // 4. Facebook Video / Reel
    // =========================================================================
    else if (platform === "facebook") {
      let title = derived.title || "Facebook Video";
      let author = derived.author || "Facebook Creator";
      let thumbnail = "https://images.unsplash.com/photo-1544717305-2782549b5136?w=600&auto=format&fit=crop&q=80";

      try {
        const oembedRes = await fetch(
          `https://www.facebook.com/plugins/video/oembed.json/?url=${encodeURIComponent(cleanUrl)}`,
          {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(3500),
          }
        );
        if (oembedRes.ok) {
          const data = await oembedRes.json();
          title = data.title || title;
          author = data.author_name || author;
        }
      } catch (e) {
        console.warn("[SocialDownloader] Facebook oEmbed fallback:", e.message);
      }

      mediaInfo = {
        id: `fb-${Date.now()}`,
        platform: "facebook",
        platformName: "Facebook",
        title,
        author,
        thumbnail,
        duration: "2:10",
        format: "MP4 Video",
        availableQualities: QUALITY_OPTIONS,
        downloadUrl: `/api/social/download?url=${encodeURIComponent(cleanUrl)}&platform=facebook&title=${encodeURIComponent(title)}`,
        canDownload: true,
        isPublic: true,
        sourceUrl: cleanUrl,
      };
    }

    return NextResponse.json({
      success: true,
      media: mediaInfo,
    });
  } catch (err) {
    console.error("[SocialDownloader] Unexpected error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch media details. Please verify the URL or try again.",
        code: "SERVER_ERROR",
      },
      { status: 500 }
    );
  }
}
