import React from "react";
import Link from "next/link";
import SpotifyBadge, { SpotifyIcon } from "./SpotifyBadge";

/**
 * SpotifyArtistCard Component
 * Displays a Spotify artist with clear Spotify branding, followers/genres,
 * and opens the Ceepeefy artist discovery page (/artists/[id]?name=...) when clicked.
 *
 * Attribution to Spotify is preserved with external profile link.
 * NEVER routes to or plays Spotify audio.
 */
export default function SpotifyArtistCard({
  artist,
  isCarousel = false,
  className = "",
}) {
  if (!artist) return null;

  const artistId = artist.id || "";
  const artistName = artist.name || "Artist";
  const spotifyUrl = artist.spotifyUrl || (artist.id ? `https://open.spotify.com/artist/${artist.id}` : "https://open.spotify.com");
  const imageUrl = artist.image || artist.avatar || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80";
  const genreText = Array.isArray(artist.genres) && artist.genres.length > 0
    ? artist.genres.slice(0, 2).map((g) => g.charAt(0).toUpperCase() + g.slice(1)).join(" • ")
    : null;

  const subtitle = artist.followersFormatted
    ? `${artist.followersFormatted} followers`
    : genreText || "Spotify Artist";

  const discoveryUrl = `/artists/${encodeURIComponent(artistId)}?name=${encodeURIComponent(artistName)}`;

  return (
    <Link
      href={discoveryUrl}
      className={`group flex flex-col items-center text-center p-3.5 sm:p-4 rounded-2xl glass-card border border-white/10 hover:border-[#1DB954]/50 bg-surface-container/75 hover:bg-surface-container transition-all duration-300 shadow-lg hover:shadow-[0_8px_30px_rgba(29,185,84,0.18)] hover:-translate-y-1.5 select-none relative cursor-pointer ${
        isCarousel ? "w-40 sm:w-44 flex-shrink-0" : "w-full"
      } ${className}`}
      title={`Discover ${artistName} on Ceepeefy`}
    >
      {/* Top Floating Spotify Badge */}
      <div className="absolute top-2.5 right-2.5 z-10">
        <div className="w-6 h-6 rounded-full bg-black/70 backdrop-blur-md border border-[#1DB954]/40 flex items-center justify-center text-[#1DB954] shadow-md group-hover:scale-110 transition-transform">
          <SpotifyIcon className="w-3.5 h-3.5 text-[#1DB954]" />
        </div>
      </div>

      {/* Artist Avatar Circle with Pulse Ring */}
      <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-surface-container-highest shadow-md p-1 ring-2 ring-white/10 group-hover:ring-[#1DB954]/60 group-hover:shadow-[0_0_20px_rgba(29,185,84,0.25)] transition-all duration-300 mb-3 flex-shrink-0">
        <img
          src={imageUrl}
          alt={artistName}
          className="w-full h-full object-cover rounded-full group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
      </div>

      {/* Artist Name & Meta */}
      <div className="flex flex-col items-center min-w-0 w-full mb-2">
        <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-[#1ed760] transition-colors truncate w-full">
          {artistName}
        </h3>
        <span className="text-[10px] sm:text-[11px] text-outline truncate w-full mt-0.5">
          {subtitle}
        </span>
      </div>

      {/* Footer Attribution Link */}
      <div className="mt-auto w-full pt-2 border-t border-white/5 flex items-center justify-between text-[10px] sm:text-[11px]">
        <span className="text-outline truncate">Spotify</span>
        <div className="flex items-center gap-0.5 text-[#1ed760] font-semibold group-hover:underline flex-shrink-0">
          <span>Discover</span>
          <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
        </div>
      </div>
    </Link>
  );
}
