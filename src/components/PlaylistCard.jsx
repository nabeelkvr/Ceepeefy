"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useMusic } from "../context/MusicContext";
import PlaylistCover from "./PlaylistCover";

/**
 * Spotify-Style PlaylistCard (Matching Image 3 & Proportions of Image 2)
 * 
 * Features:
 * - Slightly reduced, comfortable Spotify proportions
 * - Card container with subtle dark background (bg-[#181818]/60 hover:bg-[#282828])
 * - Comfortable inner padding (p-2.5 sm:p-3)
 * - Square artwork with rounded-md and shadow
 * - Floating circular play button on hover (bottom-right of artwork)
 * - Bold title (white, text-xs sm:text-sm, truncated)
 * - Muted 2-line subtitle / description (text-[11px] sm:text-xs text-[#b3b3b3])
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
      playTrack(tracks[0], tracks, {
        context: "playlist",
        playlistId: playlist.id,
        playlistTitle: playlist.title,
      });
    } else {
      router.push(targetUrl);
    }
  };

  const coverUrl =
    playlist.customCover ||
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
      className={`w-[135px] sm:w-[145px] md:w-[155px] lg:w-[165px] xl:w-[175px] 2xl:w-[185px] 3xl:w-[195px] p-1.5 sm:p-2 md:p-2.5 rounded-lg sm:rounded-xl bg-[#181818]/60 hover:bg-[#282828] border border-transparent hover:border-white/5 flex-shrink-0 group flex flex-col cursor-pointer select-none relative transition-all duration-300 hover:shadow-xl ${className}`}
    >
      {/* Square Artwork */}
      <div
        className={`relative aspect-square w-full rounded-md overflow-hidden bg-[#121212] shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-all duration-200 ${
          isPlaylistPlaying
            ? "ring-2 ring-primary shadow-[0_0_16px_rgba(var(--color-primary-rgb),0.4)]"
            : "ring-1 ring-white/5 group-hover:ring-white/10"
        }`}
      >
        <PlaylistCover
          tracks={tracks}
          coverUrl={playlist.customCover || playlist.coverUrl || coverUrl}
          fallbackUrl={coverUrl}
          alt={playlist.title}
          className="w-full h-full object-cover rounded-md group-hover:scale-105 transition-transform duration-500"
        />

        {/* Floating Spotify-Style Circular Play Button */}
        <div
          className={`absolute right-2 bottom-2 transition-all duration-300 transform ${
            isPlaylistPlaying
              ? "opacity-100 translate-y-0 scale-100"
              : "opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 scale-95 group-hover:scale-100"
          }`}
        >
          <button
            type="button"
            onClick={handlePlayButtonClick}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary text-black flex items-center justify-center shadow-[0_8px_16px_rgba(0,0,0,0.6)] hover:scale-105 active:scale-95 transition-transform cursor-pointer"
            title={isPlaylistPlaying ? "Pause Playlist" : "Play Playlist"}
            aria-label={isPlaylistPlaying ? "Pause Playlist" : "Play Playlist"}
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[22px] font-bold">
              {isPlaylistPlaying ? "pause" : "play_arrow"}
            </span>
          </button>
        </div>

        {/* Animated Equalizer if Playing */}
        {isPlaylistPlaying && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md border border-white/10 flex items-center gap-0.5">
            <span className="w-0.5 h-2.5 bg-primary rounded-full animate-pulse" />
            <span className="w-0.5 h-3.5 bg-primary rounded-full animate-pulse delay-75" />
            <span className="w-0.5 h-2 bg-primary rounded-full animate-pulse delay-150" />
          </div>
        )}
      </div>

      {/* Details: Title & Subtitle */}
      <div className="flex flex-col min-w-0 mt-2.5 sm:mt-3">
        <h3
          className={`text-xs sm:text-sm font-semibold truncate transition-colors leading-tight ${
            isPlaylistPlaying ? "text-primary font-bold" : "text-white group-hover:text-primary"
          }`}
          title={playlist.title}
        >
          {playlist.title}
        </h3>
        <p
          className="text-[11px] sm:text-xs text-[#B3B3B3] line-clamp-2 leading-snug mt-1 font-normal"
          title={descriptionText}
        >
          {descriptionText}
        </p>
      </div>
    </div>
  );
}
