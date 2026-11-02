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
            {/* Spotify-Style Spacious Song List */}
            <div className="flex flex-col gap-1.5 sm:gap-2">
              {likedTracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id;
                const isPlayingRow = isCurrent && isPlaying;
                const coverUrl = track.coverUrl || track.image || track.thumbnail || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300";

                return (
                  <div
                    key={track.sourceEntryId ? `${track.id}__${track.sourceEntryId}` : `${track.id || "track"}__pos_${idx}`}
                    onClick={() => handleRowClick(track)}
                    className={`group flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl transition-all duration-200 cursor-pointer select-none ${
                      isCurrent
                        ? "bg-primary/10 border border-primary/30 shadow-[0_0_16px_rgba(76,215,246,0.15)]"
                        : "hover:bg-white/10 active:bg-white/15 border border-transparent"
                    }`}
                  >
                    {/* Left & Middle section */}
                    <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
                      {/* Left: Square Thumbnail with slightly rounded corners */}
                      <div className="w-12 h-12 sm:w-[52px] sm:h-[52px] rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-high relative shadow-sm">
                        <img
                          src={coverUrl}
                          alt={track.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {isPlayingRow ? (
                          <div className="absolute inset-0 bg-black/60 backdrop-blur-[0.5px] flex items-center justify-center">
                            <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 24 24">
                              <rect height="10" rx="1.5" width="3" x="3" y="10">
                                <animate attributeName="height" dur="0.8s" repeatCount="indefinite" values="10;4;14;10" />
                                <animate attributeName="y" dur="0.8s" repeatCount="indefinite" values="10;16;6;10" />
                              </rect>
                              <rect height="15" rx="1.5" width="3" x="8.5" y="5">
                                <animate attributeName="height" dur="0.6s" repeatCount="indefinite" values="15;8;18;15" />
                                <animate attributeName="y" dur="0.6s" repeatCount="indefinite" values="5;12;2;5" />
                              </rect>
                              <rect height="12" rx="1.5" width="3" x="14" y="8">
                                <animate attributeName="height" dur="0.7s" repeatCount="indefinite" values="12;16;6;12" />
                                <animate attributeName="y" dur="0.7s" repeatCount="indefinite" values="8;4;14;8" />
                              </rect>
                              <rect height="8" rx="1.5" width="3" x="19.5" y="12">
                                <animate attributeName="height" dur="0.9s" repeatCount="indefinite" values="8;14;5;8" />
                                <animate attributeName="y" dur="0.9s" repeatCount="indefinite" values="12;6;15;12" />
                              </rect>
                            </svg>
                          </div>
                        ) : (
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <span className="material-symbols-outlined text-white text-[24px]">play_arrow</span>
                          </div>
                        )}
                      </div>

                      {/* Middle: Title on line 1, Artist on line 2 */}
                      <div className="flex flex-col min-w-0 flex-1 justify-center gap-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`text-[14px] sm:text-[15px] font-semibold truncate leading-snug transition-colors ${
                              isCurrent ? "text-primary" : "text-white group-hover:text-primary"
                            }`}
                            title={track.title}
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
                        <span
                          className="text-xs sm:text-[13px] text-neutral-400 group-hover:text-neutral-300 truncate leading-tight"
                          title={track.artist}
                        >
                          {track.artist || "Unknown Artist"}
                        </span>
                      </div>
                    </div>

                    {/* Right section: Like & Three-dot menu */}
                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLike(track);
                        }}
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-primary hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                        title="Unlike"
                      >
                        <span
                          className="material-symbols-outlined text-[20px] sm:text-[22px]"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          favorite
                        </span>
                      </button>
                      <SongOptionsMenu
                        track={track}
                        iconName="more_horiz"
                        buttonClassName="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        iconClassName="text-[20px] sm:text-[22px]"
                      />
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
