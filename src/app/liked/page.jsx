"use client";

import React from "react";
import Link from "next/link";
import { useMusic } from "../../context/MusicContext";
import { NOCTURNE_TRACKS } from "../../data/nocturneData";
import DownloadButton from "../../components/DownloadButton";
import SongOptionsMenu from "../../components/SongOptionsMenu";

export default function LikedSongsPage() {
  const {
    likedSongIds,
    likedTracks: contextLikedTracks,
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    toggleLike,
    isLiked,
    formatTime,
    user,
    openAuthModal,
    offlineTrackIds,
  } = useMusic();

  const likedTracks = contextLikedTracks || [];

  const isCurrentPlaying =
    isPlaying && likedTracks.some((t) => t.id === currentTrack?.id);

  const handleMasterPlay = () => {
    if (likedTracks.length === 0) return;
    if (isCurrentPlaying) {
      togglePlay();
    } else {
      playTrack(likedTracks[0], likedTracks);
    }
  };

  const handleRowClick = (track) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, likedTracks);
    }
  };

  return (
    <div className="w-full flex flex-col pb-12 select-none">
      {/* Hero Header */}
      <div className="relative w-full p-3.5 sm:p-6 md:p-8 bg-gradient-to-b from-secondary-container/50 via-surface-container-low/40 to-transparent border-b border-white/5">
        <div className="flex flex-col md:flex-row items-center md:items-end gap-3.5 sm:gap-6 md:gap-8 max-w-6xl">
          {/* Cover Art Heart Box */}
          <div className="w-24 h-24 sm:w-36 sm:h-36 md:w-56 md:h-56 rounded-2xl bg-gradient-to-br from-secondary-container via-purple-600 to-primary flex items-center justify-center shadow-[0_20px_40px_rgba(87,27,193,0.4)] flex-shrink-0 border border-white/10 mx-auto md:mx-0">
            <span
              className="material-symbols-outlined text-white text-[38px] sm:text-[52px] md:text-[72px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              favorite
            </span>
          </div>

          {/* Info */}
          <div className="flex flex-col gap-1.5 sm:gap-2.5 text-center md:text-left flex-1 min-w-0 w-full">
            <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-secondary font-bold">
              Personal Collection
            </span>

            <h1 className="text-xl sm:text-3xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
              Liked Songs
            </h1>

            <p className="text-xs md:text-sm text-on-surface-variant max-w-xl line-clamp-2 sm:line-clamp-none">
              Your favorite studio master recordings and audiophile tracks, saved directly to your local profile.
            </p>

            <div className="flex items-center justify-center md:justify-start gap-2 text-xs text-outline pt-0.5 sm:pt-1">
              <span className="text-white font-medium">Curator Profile</span>
              <span>•</span>
              <span className="text-primary font-semibold">{likedTracks.length} Songs Saved</span>
            </div>
          </div>
        </div>

        {/* Action Controls Bar */}
        {likedTracks.length > 0 && (
          <div className="flex items-center justify-center md:justify-start gap-4 mt-4 sm:mt-6 md:mt-8">
            <button
              onClick={handleMasterPlay}
              className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_24px_rgba(76,215,246,0.6)] hover:scale-105 active:scale-95 transition-all"
              title={isCurrentPlaying ? "Pause" : "Play all liked"}
            >
              <span className="material-symbols-outlined text-[24px] sm:text-[32px]">
                {isCurrentPlaying ? "pause" : "play_arrow"}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Tracks Table */}
      <div className="px-4 md:px-8 pt-6 flex flex-col gap-2">
        {likedTracks.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-outline">
              <span className="material-symbols-outlined text-[32px]">favorite_border</span>
            </div>
            <h3 className="text-lg font-bold text-white">No liked songs yet</h3>
            <p className="text-xs text-outline max-w-sm">
              Tap the heart icon on any song while listening to add it to your personal high-fidelity library.
            </p>
            <Link
              href="/"
              className="mt-2 px-5 py-2.5 rounded-full bg-primary text-surface-container-lowest font-semibold text-xs shadow-lg hover:scale-105 transition-all"
            >
              Browse Music
            </Link>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="grid grid-cols-[2rem_1fr_3.5rem_auto] md:grid-cols-[2.5rem_minmax(200px,3fr)_minmax(140px,2fr)_4rem_8rem] items-center px-3 md:px-4 py-2 border-b border-white/10 text-xs font-semibold uppercase tracking-wider text-outline">
              <span className="text-center">#</span>
              <span>Title</span>
              <span className="hidden md:block">Artist</span>
              <span className="text-right flex items-center justify-end pr-1">
                <span className="material-symbols-outlined text-[16px]">schedule</span>
              </span>
              <span className="text-right hidden md:block pr-2">Actions</span>
            </div>

            {/* Tracks */}
            <div className="flex flex-col gap-1">
              {likedTracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id;
                const isPlayingRow = isCurrent && isPlaying;

                return (
                  <div
                    key={track.id}
                    onClick={() => handleRowClick(track)}
                    className={`group grid grid-cols-[2rem_1fr_3.5rem_auto] md:grid-cols-[2.5rem_minmax(200px,3fr)_minmax(140px,2fr)_4rem_8rem] items-center px-3 md:px-4 py-2.5 rounded-xl transition-all cursor-pointer ${
                      isCurrent
                        ? "bg-surface-container-high/80 border border-primary/30"
                        : "hover:bg-surface-container/60 hover:border-white/5 border border-transparent"
                    }`}
                  >
                    {/* Number / Status */}
                    <div className="flex items-center justify-center w-full">
                      {isPlayingRow ? (
                        <span className="material-symbols-outlined text-primary text-[20px]">
                          graphic_eq
                        </span>
                      ) : (
                        <>
                          <span className="group-hover:hidden text-xs font-mono text-outline">
                            {idx + 1}
                          </span>
                          <span className="hidden group-hover:block text-white">
                            <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                          </span>
                        </>
                      )}
                    </div>

                    {/* Cover & Title */}
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-high shadow">
                        <img
                          src={track.coverUrl || track.image || track.thumbnail || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300"}
                          alt={track.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-sm font-semibold truncate transition-colors ${
                              isCurrent ? "text-primary" : "text-white group-hover:text-primary"
                            }`}
                          >
                            {track.title}
                          </span>
                          {offlineTrackIds?.has(String(track.id)) && (
                            <span
                              className="material-symbols-outlined text-primary text-[14px] flex-shrink-0"
                              title="Available offline on this device"
                            >
                              download_done
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-on-surface-variant md:hidden truncate mt-0.5">
                          {track.artist}
                        </span>
                      </div>
                    </div>

                    {/* Artist */}
                    <div className="hidden md:block truncate text-xs text-on-surface-variant hover:text-white">
                      {track.artist}
                    </div>

                    {/* Duration */}
                    <div className="text-right text-xs font-mono text-outline pr-2">
                      {formatTime(track.duration)}
                    </div>

                    {/* Actions: Download, Like button, & 3-dot options */}
                    <div className="flex items-center justify-end gap-1 flex-shrink-0">
                      <DownloadButton track={track} buttonSize="p-1" iconSize="text-[18px]" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLike(track);
                        }}
                        className="p-1 text-primary hover:scale-110 transition-transform cursor-pointer"
                        title="Unlike"
                      >
                        <span
                          className="material-symbols-outlined text-[18px]"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          favorite
                        </span>
                      </button>
                      <SongOptionsMenu track={track} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
