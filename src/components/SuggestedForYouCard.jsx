"use client";

import React from "react";
import { useMusic } from "../context/MusicContext";
import SongOptionsMenu from "./SongOptionsMenu";

/**
 * SuggestedForYouCard
 * 
 * Matches Image 2 layout precisely:
 * 1. Small rounded cover (~56x56px, radius 8px)
 * 2. Vertically centered text block:
 *    - ARTIST NAME on top: small (12-13px), UPPERCASE, letter-spacing 0.12em, grey (#9aa0a6)
 *    - SONG NAME below: larger (20-22px), bold, light grey/white (#f1f3f4), single line with ellipsis
 * 3. Vertical "three dots" (⋮) menu button on the far right
 * - Row hover: rounded (10px) slate-blue background (#3a4352), smooth 150ms transition
 * - Row click = play song. Menu click = stopPropagation & open menu
 */
export default function SuggestedForYouCard({
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

  const handleRowClick = () => {
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

  const handlePlayOverlayClick = (e) => {
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

  const artistName = track.artist || track.primary_artist || "Various Artists";
  const displayTitle = track.title || track.name || "Unknown Track";
  const reasonTooltip = track.reason ? `${displayTitle} • ${track.reason}` : `${displayTitle} by ${artistName}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleRowClick();
        }
      }}
      aria-label={`Play ${displayTitle} by ${artistName}`}
      title={reasonTooltip}
      className={`group w-full flex items-center justify-between p-2 rounded-[10px] cursor-pointer select-none transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        isCurrent ? "bg-[#3a4352]" : "bg-transparent hover:bg-[#3a4352] active:bg-[#323a47]"
      } ${className}`}
    >
      {/* Left: Cover Art + Text block */}
      <div className="flex items-center min-w-0 flex-1 mr-2">
        {/* 1. Small rounded cover (56x56px, radius 8px) */}
        <div className="relative w-14 h-14 w-[56px] h-[56px] rounded-[8px] overflow-hidden bg-[#1a1a1a] flex-shrink-0 shadow-sm border border-white/5">
          <img
            src={coverUrl}
            alt={`${displayTitle} cover`}
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.src =
                "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80";
            }}
            className="w-full h-full object-cover rounded-[8px] group-hover:scale-105 transition-transform duration-300"
          />

          {/* Hover Play Button / Active Pause Overlay */}
          <div
            className={`absolute inset-0 bg-black/45 flex items-center justify-center transition-opacity duration-150 ${
              isCurrentPlaying
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <button
              type="button"
              onClick={handlePlayOverlayClick}
              className={`w-7 h-7 rounded-full bg-primary text-black flex items-center justify-center shadow-md transform transition-all duration-150 hover:scale-110 active:scale-95 ${
                isCurrentPlaying ? "scale-100" : "scale-90 group-hover:scale-100"
              }`}
              title={isCurrentPlaying ? "Pause" : "Play"}
              aria-label={isCurrentPlaying ? "Pause" : "Play"}
            >
              <span className="material-symbols-outlined text-[17px]">
                {isCurrentPlaying ? "pause" : "play_arrow"}
              </span>
            </button>
          </div>

          {/* Animated playing equalizer indicator */}
          {isCurrentPlaying && (
            <div className="group-hover:hidden absolute bottom-1 right-1 px-1 py-0.5 rounded-[2px] bg-black/80 backdrop-blur-sm flex items-center gap-0.5">
              <span className="w-0.5 h-2 bg-primary rounded-full animate-pulse" />
              <span className="w-0.5 h-3 bg-primary rounded-full animate-pulse delay-75" />
              <span className="w-0.5 h-1.5 bg-primary rounded-full animate-pulse delay-150" />
            </div>
          )}
        </div>

        {/* 2. Vertically centered text block */}
        <div className="flex flex-col justify-center min-w-0 flex-1 ml-3.5">
          {/* ARTIST NAME on top: small (12-13px), UPPERCASE, letter-spacing 0.12em, grey (#9aa0a6) */}
          <span className="text-[12px] sm:text-[13px] font-medium uppercase tracking-[0.12em] text-[#9aa0a6] truncate leading-tight">
            {artistName}
          </span>

          {/* SONG NAME below: larger (20-22px), bold, light grey/white (#f1f3f4), single line with ellipsis */}
          <span className="text-[20px] sm:text-[21px] font-bold text-[#f1f3f4] truncate tracking-tight leading-snug mt-0.5">
            {displayTitle}
          </span>
        </div>
      </div>

      {/* 3. Vertical "three dots" (⋮) menu button on the far right */}
      <div
        className="flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <SongOptionsMenu
          track={track}
          iconName="more_vert"
          iconClassName="text-[20px]"
          buttonClassName="p-2 text-[#9aa0a6] hover:text-white rounded-full hover:bg-white/10 transition-colors flex-shrink-0 cursor-pointer"
          title="More options"
        />
      </div>
    </div>
  );
}

