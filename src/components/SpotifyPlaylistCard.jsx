import React from "react";
import Link from "next/link";
import SpotifyBadge, { SpotifyIcon } from "./SpotifyBadge";

/**
 * SpotifyPlaylistCard Component
 * Displays a Spotify playlist in full compliance with requirements:
 * - Links to Ceepeefy's Spotify Playlist Detail page: /playlist/spotify/{playlistId}
 * - Original uncropped square (1:1) artwork
 * - NO logos or overlays on top of the artwork itself
 * - Clear Spotify branding and attribution outside the artwork
 * - Ceepeefy-style hover animation and glassmorphic styling
 */
export default function SpotifyPlaylistCard({
  playlist,
  isCarousel = false,
  className = "",
}) {
  if (!playlist) return null;

  const playlistId = playlist.id || "";
  const title = playlist.title || playlist.name || "Spotify Playlist";
  const curator = playlist.curator || playlist.owner || "Spotify";
  const description = playlist.description || "";
  const imageUrl =
    playlist.coverUrl ||
    playlist.image ||
    playlist.thumbnail ||
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80";

  const trackCount = playlist.trackCount || playlist.totalCount || null;

  // Build detail page URL with pre-populated metadata query params for instant hydration
  const queryParams = new URLSearchParams();
  if (title) queryParams.set("name", title);
  if (imageUrl) queryParams.set("cover", imageUrl);
  if (curator) queryParams.set("curator", curator);
  if (description) queryParams.set("desc", description.slice(0, 150));
  if (playlist.spotifyUrl) queryParams.set("spotifyUrl", playlist.spotifyUrl);

  const detailUrl = `/playlist/spotify/${encodeURIComponent(playlistId)}${
    queryParams.toString() ? `?${queryParams.toString()}` : ""
  }`;

  return (
    <Link
      href={detailUrl}
      className={`group p-3.5 sm:p-4 rounded-2xl glass-card border border-white/10 hover:border-[#1DB954]/50 bg-surface-container/75 hover:bg-surface-container transition-all duration-300 cursor-pointer shadow-lg hover:shadow-[0_8px_30px_rgba(29,185,84,0.18)] hover:-translate-y-1.5 flex flex-col justify-between select-none relative ${
        isCarousel ? "w-44 sm:w-48 flex-shrink-0" : "w-full"
      } ${className}`}
      title={`Open "${title}" in Ceepeefy`}
    >
      <div>
        {/* Original 1:1 Aspect Ratio Artwork Container (Strictly NO overlay logos or text on the artwork) */}
        <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-surface-container-highest shadow-md mb-3 border border-white/5">
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        </div>

        {/* Playlist Title & Curator */}
        <div className="flex flex-col min-w-0">
          <h3 className="font-bold text-xs sm:text-sm text-white group-hover:text-[#1ed760] transition-colors truncate">
            {title}
          </h3>

          {description ? (
            <p className="text-[11px] text-on-surface-variant line-clamp-2 mt-1 leading-relaxed">
              {description}
            </p>
          ) : (
            <p className="text-[11px] text-on-surface-variant truncate mt-0.5">
              By {curator}
            </p>
          )}

          {/* Track count indicator if available */}
          {trackCount ? (
            <span className="text-[10px] font-mono text-outline mt-1">
              {trackCount} tracks
            </span>
          ) : null}
        </div>
      </div>

      {/* Footer Attribution & Action */}
      <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[10px] sm:text-[11px]">
        <div className="flex items-center gap-1.5 text-outline">
          <SpotifyIcon className="w-3.5 h-3.5 text-[#1DB954] flex-shrink-0" />
          <span className="truncate">Spotify Playlist</span>
        </div>
        <div className="flex items-center gap-0.5 text-[#1ed760] font-semibold group-hover:underline flex-shrink-0">
          <span>View</span>
          <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
        </div>
      </div>
    </Link>
  );
}
