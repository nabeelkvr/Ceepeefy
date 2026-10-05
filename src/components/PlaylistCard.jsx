"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useMusic } from "../context/MusicContext";
import PlaylistCover from "./PlaylistCover";

/**
 * Modern Ceepeefy PlaylistCard (Matching Image 2)
 * 
 * Features:
 * - Square artwork (aspect-square) with 100% sharp full edges (rounded-none)
 * - Shorter height and more compact width than SongCard
 * - Clean frameless design without column edges / container borders / blending boxes
 * - Floating play button appearing over artwork on hover
 * - Title in bold white text
 * - 2-line truncated description in muted text
 */
export default function PlaylistCard({
  playlist,
  className = "",
  onClick,
  onPlay,
}) {
  const router = useRouter();
  const { currentTrack, isPlaying, playTrack, togglePlay, bumpPlaylistToTop } = useMusic();

  if (!playlist) return null;

  const tracks = playlist.tracks || [];
  const isPlaylistPlaying = isPlaying && tracks.some((t) => t.id === currentTrack?.id);
  const isAlbum = playlist.type === "album" || playlist.isAlbum;
  const targetUrl = isAlbum ? `/album/${playlist.id}` : `/playlist/${playlist.id}`;

  const handleCardClick = () => {
    if (onClick) {
      onClick(playlist);
      return;
    }
    if (bumpPlaylistToTop && playlist.id) {
      bumpPlaylistToTop(playlist.id);
    }
    router.push(targetUrl);
  };

  const handlePlayButtonClick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (onPlay) {
      onPlay(playlist, e);
      return;
    }

    if (bumpPlaylistToTop && playlist.id) {
      bumpPlaylistToTop(playlist.id);
    }

    if (isPlaylistPlaying) {
      togglePlay();
    } else if (tracks.length > 0) {
      playTrack(tracks[0], tracks);
    } else {
      router.push(targetUrl);
    }
  };

  const coverUrl =
    playlist.coverUrl ||
    playlist.image ||
    (Array.isArray(playlist.images) && playlist.images[0]?.url) ||
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80";

  const descriptionText =
    playlist.description ||
    playlist.subtitle ||
    (tracks.length > 0 ? `${tracks.length} tracks • ${playlist.curator || "Ceepeefy"}` : "Curated Playlist");

  return (
    <div
      onClick={handleCardClick}
      className={`w-[135px] sm:w-[150px] md:w-[165px] lg:w-[175px] flex-shrink-0 group flex flex-col cursor-pointer select-none relative transition-transform duration-200 hover:-translate-y-1 ${className}`}
    >
      {/* Square Artwork (Sharp 3px edge blend, No Column Border Box) */}
      <div
        className={`relative aspect-square w-full rounded-[3px] overflow-hidden bg-[#161922] shadow-md transition-all duration-200 ${
          isPlaylistPlaying
            ? "ring-2 ring-primary shadow-[0_0_16px_rgba(var(--color-primary-rgb),0.35)]"
            : "ring-1 ring-white/10 group-hover:ring-white/25"
        }`}
      >
        {tracks.length > 0 && !playlist.coverUrl ? (
          <PlaylistCover
            tracks={tracks}
            fallbackUrl={coverUrl}
            alt={playlist.title}
            className="w-full h-full object-cover rounded-[3px] group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <img
            src={coverUrl}
            alt={playlist.title}
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.src =
                "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80";
            }}
            className="w-full h-full object-cover rounded-[3px] group-hover:scale-105 transition-transform duration-500"
          />
        )}

        {/* Floating Play Button on Hover */}
        <div
          className={`absolute inset-0 bg-black/35 flex items-end justify-end p-1.5 sm:p-2 transition-all duration-200 ${
            isPlaylistPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <button
            type="button"
            onClick={handlePlayButtonClick}
            className={`w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full bg-primary text-black flex items-center justify-center shadow-[0_4px_14px_rgba(0,0,0,0.6)] transform transition-all duration-200 hover:scale-110 active:scale-95 ${
              isPlaylistPlaying
                ? "translate-y-0 scale-100 shadow-[0_0_14px_rgba(var(--color-primary-rgb),0.6)]"
                : "translate-y-2 group-hover:translate-y-0 scale-95 group-hover:scale-100"
            }`}
            title={isPlaylistPlaying ? "Pause Playlist" : "Play Playlist"}
            aria-label={isPlaylistPlaying ? "Pause Playlist" : "Play Playlist"}
          >
            <span className="material-symbols-outlined text-[18px] sm:text-[20px]">
              {isPlaylistPlaying ? "pause" : "play_arrow"}
            </span>
          </button>
        </div>

        {/* Animated equalizer if playing */}
        {isPlaylistPlaying && (
          <div className="absolute top-1.5 left-1.5 px-1 py-0.5 rounded-sm bg-black/80 backdrop-blur-md border border-white/10 flex items-center gap-0.5">
            <span className="w-0.5 h-2 bg-primary rounded-full animate-pulse" />
            <span className="w-0.5 h-3 bg-primary rounded-full animate-pulse delay-75" />
            <span className="w-0.5 h-1.5 bg-primary rounded-full animate-pulse delay-150" />
          </div>
        )}
      </div>

      {/* Details: Title & 2-Line Truncated Description */}
      <div className="flex flex-col min-w-0 mt-1.5">
        <h3
          className={`text-xs sm:text-[13px] font-bold truncate transition-colors leading-tight ${
            isPlaylistPlaying ? "text-primary font-extrabold" : "text-white group-hover:text-primary"
          }`}
          title={playlist.title}
        >
          {playlist.title}
        </h3>
        <p
          className="text-[10px] sm:text-[11px] text-neutral-400 line-clamp-2 leading-snug mt-0.5"
          title={descriptionText}
        >
          {descriptionText}
        </p>
      </div>
    </div>
  );
}
