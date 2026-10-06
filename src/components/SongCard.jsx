"use client";

import React from "react";
import { useMusic } from "../context/MusicContext";
import SongOptionsMenu from "./SongOptionsMenu";

/**
 * Modern Ceepeefy SongCard (Matching Image 1)
 * 
 * Features:
 * - Rectangular portrait artwork (more height than square, aspect-[4/5] like Image 1)
 * - 100% sharp full edges (rounded-none, crisp 90-degree corners)
 * - No outer card box / blending frame (frameless sitting directly on the canvas)
 * - Directly below picture:
 *     Row 1: ARTIST NAME (uppercase / muted) + 3-dot menu button on right
 *     Row 2: Song Title (bold white)
 * - Hover circular play button over artwork
 */
export default function SongCard({
  track,
  trackList = [],
  isCurrent: customIsCurrent,
  isPlaying: customIsPlaying,
  onPlay,
  className = "",
  playlistId = null,
  imageRounded = "rounded-[10px]",
}) {
  const { currentTrack, isPlaying, playTrack, togglePlay } = useMusic();

  if (!track) return null;

  const trackId = String(track.id || track.trackId || "");
  const isCurrent = customIsCurrent !== undefined 
    ? customIsCurrent 
    : String(currentTrack?.id || "") === trackId;
  const isCurrentPlaying = customIsPlaying !== undefined 
    ? customIsPlaying 
    : isCurrent && isPlaying;

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

  const coverUrl =
    track.coverUrl ||
    track.thumbnail ||
    track.image ||
    (Array.isArray(track.image) && track.image[track.image.length - 1]?.url) ||
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80";

  return (
    <div
      onClick={handleCardClick}
      className={`w-[140px] sm:w-[155px] md:w-[170px] lg:w-[180px] flex-shrink-0 group flex flex-col cursor-pointer select-none relative transition-transform duration-200 hover:-translate-y-1 ${className}`}
    >
      {/* Rectangular Portrait Artwork (Aspect 4/5) */}
      <div
        className={`relative aspect-[4/5] w-full ${imageRounded} overflow-hidden bg-[#161922] shadow-lg transition-all duration-200 ${
          isCurrent
            ? "ring-2 ring-primary shadow-[0_0_18px_rgba(var(--color-primary-rgb),0.4)]"
            : "ring-1 ring-white/10 group-hover:ring-white/30"
        }`}
      >
        <img
          src={coverUrl}
          alt={track.title}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            e.currentTarget.src =
              "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80";
          }}
          className={`w-full h-full object-cover ${imageRounded} group-hover:scale-105 transition-transform duration-500`}
        />

        {/* Hover Circular Play Button Overlay */}
        <div
          className={`absolute inset-0 bg-black/35 flex items-end justify-end p-2 sm:p-2.5 transition-all duration-200 ${
            isCurrentPlaying
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <button
            type="button"
            onClick={handlePlayButtonClick}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary text-black flex items-center justify-center shadow-[0_4px_16px_rgba(0,0,0,0.6)] transform transition-all duration-200 hover:scale-110 active:scale-95 ${
              isCurrentPlaying
                ? "translate-y-0 scale-100 shadow-[0_0_16px_rgba(var(--color-primary-rgb),0.6)]"
                : "translate-y-2 group-hover:translate-y-0 scale-95 group-hover:scale-100"
            }`}
            title={isCurrentPlaying ? "Pause" : "Play"}
            aria-label={isCurrentPlaying ? "Pause" : "Play"}
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[22px]">
              {isCurrentPlaying ? "pause" : "play_arrow"}
            </span>
          </button>
        </div>

        {/* Playing Animated Equalizer Bar in top-left */}
        {isCurrentPlaying && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-white/10 flex items-center gap-0.5">
            <span className="w-0.5 h-2.5 bg-primary rounded-full animate-pulse" />
            <span className="w-0.5 h-3.5 bg-primary rounded-full animate-pulse delay-75" />
            <span className="w-0.5 h-2 bg-primary rounded-full animate-pulse delay-150" />
          </div>
        )}
      </div>

      {/* Structure matching Image 1 & 4:
          Row 1: ARTIST NAME (uppercase / muted) + 3 dots menu on the right edge
          Row 2: Song Title (bold white) */}
      <div className="flex flex-col mt-1.5 min-w-0">
        {/* Row 1: Artist + 3 dots right beneath the artwork border */}
        <div className="flex items-center justify-between gap-1 min-w-0">
          <p
            className="text-[10px] sm:text-[11px] font-semibold text-neutral-400 uppercase tracking-wider truncate flex-1"
            title={track.artist}
          >
            {track.artist}
          </p>
          <div className="flex-shrink-0 -mr-1">
            <SongOptionsMenu
              track={track}
              playlistId={playlistId}
              iconClassName="text-[16px] sm:text-[17px]"
              buttonClassName="p-0.5 text-neutral-400 hover:text-white opacity-80 group-hover:opacity-100 transition-opacity cursor-pointer"
            />
          </div>
        </div>

        {/* Row 2: Song Title */}
        <h3
          className={`text-xs sm:text-sm font-bold truncate transition-colors leading-tight -mt-0.5 ${
            isCurrent ? "text-primary font-extrabold" : "text-white group-hover:text-primary"
          }`}
          title={track.title}
        >
          {track.title}
        </h3>
      </div>
    </div>
  );
}
