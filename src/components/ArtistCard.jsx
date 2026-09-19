"use client";

import React from "react";
import Link from "next/link";
import ArtistAvatar from "./ArtistAvatar";

/**
 * Standard ArtistCard Component
 *
 * Renders an interactive card for an artist with a circular profile avatar,
 * dynamic API image retrieval, graceful initials fallback, and quick play button.
 */
export default function ArtistCard({
  artist,
  isPlaying = false,
  isCurrentArtistPlaying = false,
  onPlay,
}) {
  if (!artist) return null;

  return (
    <Link
      href={`/artist/${artist.id}`}
      className="group flex flex-col items-center text-center gap-3 p-4 rounded-2xl glass-card border border-white/5 hover:border-primary/40 hover:bg-surface-container/80 transition-all duration-300 cursor-pointer shadow-lg hover:-translate-y-1.5 select-none relative"
    >
      {/* Circular Profile Avatar Container */}
      <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden bg-surface-container-highest shadow-md p-1 ring-2 ring-primary/20 group-hover:ring-primary group-hover:shadow-[0_0_20px_rgba(76,215,246,0.3)] transition-all">
        <ArtistAvatar
          name={artist.name}
          avatar={artist.avatar}
          className="w-full h-full"
        />

        {/* Hover Quick Play Overlay */}
        <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
          <button
            onClick={(e) => onPlay?.(artist, e)}
            className="pointer-events-auto w-10 h-10 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform hover:scale-110"
            title={isCurrentArtistPlaying ? `Pause ${artist.name}` : `Play ${artist.name}`}
          >
            <span className="material-symbols-outlined text-[24px]">
              {isCurrentArtistPlaying ? "pause" : "play_arrow"}
            </span>
          </button>
        </div>
      </div>

      {/* Artist Name and Tagline */}
      <div className="flex flex-col items-center min-w-0 w-full">
        <span className="text-sm font-semibold truncate transition-colors w-full text-white group-hover:text-primary">
          {artist.name}
        </span>
        <span className="text-xs text-outline truncate w-full">
          {artist.genre || artist.role || "Artist"}
        </span>
      </div>
    </Link>
  );
}
