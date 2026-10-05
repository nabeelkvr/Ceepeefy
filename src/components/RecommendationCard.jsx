"use client";

import React from "react";
import { useMusic } from "../context/MusicContext";
import SongOptionsMenu from "./SongOptionsMenu";

/**
 * Modern Compact Horizontal Recommendation Card
 * 
 * Features:
 * - Landscape aspect ratio (compact horizontal rectangle, not unnecessarily tall)
 * - Clean, borderless & frameless design (NO container border/box around song as requested)
 * - Left side: Square album/song cover with hover play button / playing animation
 * - Center: Song Title (bold white, truncate) + Artist • Movie/Album (muted text, truncate)
 * - Right side: Compact three-dot menu button
 * - Whole card clickable using existing music player
 * - Responsive touch target and seamless fit for 3-col desktop & 2-col mobile
 */
export default function RecommendationCard({
  track,
  trackList = [],
  onPlay,
  className = "",
}) {
  const { currentTrack, isPlaying, playTrack, togglePlay } = useMusic();

  if (!track) return null;

  const trackId = String(track.id || track.trackId || "");
  const isCurrent = String(currentTrack?.id || "") === trackId;
  const isCurrentPlaying = isCurrent && isPlaying;

  const handleCardClick = () => {
    if (onPlay) {
      onPlay(track);
      return;
    }
    if (isCurrent) {
      togglePlay();
    } else {
      playTrack(track, trackList.length > 0 ? trackList : [track]);
    }
  };

  const handlePlayButtonClick = (e) => {
    e.stopPropagation();
    if (isCurrent) {
      togglePlay();
    } else {
      playTrack(track, trackList.length > 0 ? trackList : [track]);
    }
  };

  const coverUrl =
    track.coverUrl ||
    track.thumbnail ||
    track.image ||
    (Array.isArray(track.image) && track.image[track.image.length - 1]?.url) ||
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80";

  // Build secondary subtitle: ARTIST • MOVIE/ALBUM in uppercase like recent played songs
  const artistName = track.artist || track.primary_artist || "Various Artists";
  const albumOrMovie = track.movieName || track.album || track.genre || "";
  const upperArtist = artistName.toUpperCase();
  const upperAlbum = albumOrMovie ? albumOrMovie.toUpperCase() : "";
  const subtitle = upperAlbum ? `${upperArtist} • ${upperAlbum}` : upperArtist;

  return (
    <div
      onClick={handleCardClick}
      className={`group flex items-center gap-2 sm:gap-2.5 p-1 sm:p-1.5 rounded-[4px] transition-all duration-200 cursor-pointer select-none bg-transparent hover:bg-white/[0.06] active:bg-white/[0.09] min-w-0 ${
        isCurrent ? "bg-white/[0.04]" : ""
      } ${className}`}
      title={`Play ${track.title} by ${artistName}`}
    >
      {/* 1. Left: Compact Square Cover Art with Very Sharp Edges (rounded-[3px]) */}
      <div className="relative w-11 h-11 sm:w-12 sm:h-12 md:w-12.5 md:h-12.5 rounded-[3px] overflow-hidden bg-[#161922] flex-shrink-0 shadow-sm border border-white/5">
        <img
          src={coverUrl}
          alt={track.title}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            e.currentTarget.src =
              "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80";
          }}
          className="w-full h-full object-cover rounded-[3px] group-hover:scale-105 transition-transform duration-300"
        />

        {/* Hover / Playing Overlay Button */}
        <div
          className={`absolute inset-0 bg-black/45 flex items-center justify-center transition-opacity duration-200 ${
            isCurrentPlaying
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <button
            type="button"
            onClick={handlePlayButtonClick}
            className={`w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-full bg-primary text-black flex items-center justify-center shadow-md transform transition-all duration-200 hover:scale-110 active:scale-95 ${
              isCurrentPlaying ? "scale-100" : "scale-90 group-hover:scale-100"
            }`}
            title={isCurrentPlaying ? "Pause" : "Play"}
            aria-label={isCurrentPlaying ? "Pause" : "Play"}
          >
            <span className="material-symbols-outlined text-[16px] sm:text-[18px]">
              {isCurrentPlaying ? "pause" : "play_arrow"}
            </span>
          </button>
        </div>

        {/* Playing Animated Equalizer Bar (when playing without hovering) */}
        {isCurrentPlaying && (
          <div className="group-hover:hidden absolute bottom-1 right-1 px-1 py-0.5 rounded-[2px] bg-black/80 backdrop-blur-sm flex items-center gap-0.5">
            <span className="w-0.5 h-2 bg-primary rounded-full animate-pulse" />
            <span className="w-0.5 h-3 bg-primary rounded-full animate-pulse delay-75" />
            <span className="w-0.5 h-1.5 bg-primary rounded-full animate-pulse delay-150" />
          </div>
        )}
      </div>

      {/* 2. Middle: Song Information (Title & ARTIST • MOVIE/ALBUM in uppercase) */}
      <div className="flex flex-col min-w-0 flex-1 justify-center">
        <h4
          className={`text-xs sm:text-sm font-semibold truncate transition-colors leading-tight ${
            isCurrent ? "text-primary font-bold" : "text-white group-hover:text-primary"
          }`}
          title={track.title}
        >
          {track.title}
        </h4>
        <p
          className="text-[10px] sm:text-[11px] font-semibold text-neutral-400 uppercase tracking-wider truncate mt-0.5 leading-snug"
          title={subtitle}
        >
          {subtitle}
        </p>
      </div>

      {/* 3. Right: Three-dot options menu */}
      <div
        className="flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <SongOptionsMenu
          track={track}
          buttonClassName="w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-full text-outline hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
          iconClassName="text-[17px] sm:text-[19px]"
        />
      </div>
    </div>
  );
}
