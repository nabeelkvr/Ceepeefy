"use client";

import React, { useState } from "react";
import { formatPlaylistDuration } from "../utils/playlistUtils";

export default function LocalPlaylistCard({
  playlist,
  tracks = [], // tracks belonging to this playlist
  onClick,
  onPlay,
  onEdit,
  onDelete,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const songCount = tracks.length;
  const duration = formatPlaylistDuration(tracks);

  // Use playlist coverUrl or first track coverUrl or fallback
  const cover =
    playlist.coverUrl ||
    tracks[0]?.coverUrl ||
    "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80";

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col gap-2.5 p-3 sm:p-3.5 rounded-2xl glass-card border border-white/5 hover:border-primary/40 hover:bg-surface-container/80 transition-all duration-300 cursor-pointer shadow-lg hover:-translate-y-1 select-none"
    >
      {/* Cover Image with Play Overlay */}
      <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-surface-container-highest shadow-md">
        <img
          src={cover}
          alt={playlist.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />

        {/* Hover Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Quick Play Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPlay(playlist, tracks);
          }}
          disabled={songCount === 0}
          className="absolute right-2.5 bottom-2.5 w-10 h-10 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_16px_rgba(76,215,246,0.5)] opacity-0 group-hover:opacity-100 group-hover:scale-100 scale-90 hover:scale-110 active:scale-95 transition-all cursor-pointer disabled:opacity-0"
          title="Play playlist"
        >
          <span className="material-symbols-outlined text-[22px]">play_arrow</span>
        </button>

        {/* 3-dot Menu Button */}
        <div className="absolute top-2 right-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen((prev) => !prev);
            }}
            className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-md text-white/80 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            title="Options"
          >
            <span className="material-symbols-outlined text-[16px]">more_vert</span>
          </button>

          {isMenuOpen && (
            <div
              className="absolute right-0 mt-1 w-36 bg-[#181818] backdrop-blur-2xl border border-[#282828] rounded-xl shadow-[0_15px_35px_rgba(0,0,0,0.9)] p-1 z-30 animate-in fade-in duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onPlay(playlist, tracks);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white hover:bg-white/10 text-left transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px] text-primary">play_arrow</span>
                <span>Play All</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onEdit(playlist);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white hover:bg-white/10 text-left transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px] text-outline">edit</span>
                <span>Edit</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onDelete(playlist);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-500/10 text-left transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">delete</span>
                <span>Delete</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-col min-w-0">
        <h3 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-primary transition-colors">
          {playlist.name}
        </h3>
        <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-outline truncate mt-0.5">
          <span>{songCount} {songCount === 1 ? "track" : "tracks"}</span>
          {songCount > 0 && (
            <>
              <span>•</span>
              <span className="font-mono">{duration}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
