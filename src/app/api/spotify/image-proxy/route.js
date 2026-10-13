import { NextResponse } from "next/server";
import "../../../../lib/spotify.js"; // Ensures DNS resolver fallback is loaded for Spotify CDN hosts

/**
 * Spotify Image Proxy Route
 *
 * Securely proxies Spotify playlist and track artwork from official Spotify CDNs
 * (i.scdn.co, image-cdn-ak.spotifycdn.com, mosaic.scdn.co, etc.)
 *
 * This ensures that client browsers in network environments where Spotify CDN hostnames
 * are sinkholed or have restricted DNS can reliably display the artwork without error,
 * using HTTP cache-control headers for fast local caching.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl || typeof targetUrl !== "string") {
      return NextResponse.json({ error: "Missing image url parameter" }, { status: 400 });
    }

    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    // Security whitelist: Only permit official Spotify image hostnames
    const allowedHosts = [
      "i.scdn.co",
      "mosaic.scdn.co",
      "seeded-session-images.scdn.co",
      "image-cdn-ak.spotifycdn.com",
      "image-cdn-fa.spotifycdn.com",
      "wrapped-images.spotifycdn.com",
      "blend-playlist-covers.spotifycdn.com",
    ];

    const isAllowedHost =
      allowedHosts.includes(parsed.hostname) ||
      parsed.hostname.endsWith(".scdn.co") ||
      parsed.hostname.endsWith(".spotifycdn.com");

    if (!isAllowedHost) {
      return NextResponse.json({ error: "Disallowed image host" }, { status: 403 });
    }

    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      next: { revalidate: 604800 }, // 7 days cache
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${res.status}` },
        { status: res.status }
      );
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buffer = await res.arrayBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, s-maxage=604800, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("[Spotify Image Proxy] Error proxying image:", err?.message || err);
    return NextResponse.json({ error: "Internal proxy error" }, { status: 500 });
  }
}
