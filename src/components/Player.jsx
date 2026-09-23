"use client";

import React, { useState, useRef, useEffect } from "react";
import { useMusic } from "../context/MusicContext";
import DownloadButton from "./DownloadButton";
import MiniLyricsView from "./MiniLyricsView";
import { Infinity as InfinityIcon } from "lucide-react";

export default function Player() {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    volume,
    isMuted,
    isShuffle,
    repeatMode,
    isQueueOpen,
    isLyricsOpen,
    lyricsMode,
    setLyricsMode,
    playerMode,
    setPlayerMode,
    minimizeLyricsToCard,
    isAutoplayEnabled,
    isAutoplayLoading,
    toggleAutoplay,
    togglePlay,
    handleNextTrack,
    handlePrevTrack,
    seekTo,
    toggleLike,
    isLiked,
    changeVolume,
    toggleMute,
    setIsShuffle,
    setRepeatMode,
    setIsQueueOpen,
    setIsLyricsOpen,
    setIsDeviceModalOpen,
    formatTime,
  } = useMusic();

  const isMinimized = playerMode === "mini";
  const setIsMinimized = (min) => setPlayerMode(min ? "mini" : "bar");

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const progressBarRef = useRef(null);
  const volumeBarRef = useRef(null);
  const cardProgressBarRef = useRef(null);
  const cardVolumeBarRef = useRef(null);
  const cardRef = useRef(null);

  // Click outside big card closes it back to mini player ONLY if not in synchronized lyrics mode
  useEffect(() => {
    if (playerMode !== "card") return;
    if (lyricsMode === "mini") return; // Keep synchronized lyrics card visible while browsing!

    const handleClickOutside = (event) => {
      if (typeof window !== "undefined" && window.innerWidth < 768) return;
      if (cardRef.current && !cardRef.current.contains(event.target)) {
        setPlayerMode("mini");
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setPlayerMode("bar");
      }
    };

    // Small delay prevents the opening click from triggering an immediate close
    const timer = setTimeout(() => {
      document.addEventListener("pointerdown", handleClickOutside);
      window.addEventListener("keydown", handleKeyDown);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [playerMode, lyricsMode]);

  const handleSeekClick = (e) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(clickX / rect.width, 1));
    seekTo(ratio * duration);
  };

  const handleVolumeClick = (e) => {
    if (!volumeBarRef.current) return;
    const rect = volumeBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(clickX / rect.width, 1));
    changeVolume(ratio);
  };

  const handleCardSeekClick = (e) => {
    if (!cardProgressBarRef.current || duration <= 0) return;
    const rect = cardProgressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(clickX / rect.width, 1));
    seekTo(ratio * duration);
  };

  const handleCardVolumeClick = (e) => {
    if (!cardVolumeBarRef.current) return;
    const rect = cardVolumeBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(clickX / rect.width, 1));
    changeVolume(ratio);
  };

  const cycleRepeat = () => {
    if (repeatMode === "off") setRepeatMode("all");
    else if (repeatMode === "all") setRepeatMode("one");
    else setRepeatMode("off");
  };

  if (!currentTrack) return null;

  return (
    <>
      {/* 1. NOW PLAYING CARD / FULL-SCREEN MOBILE PLAYER MODAL */}
      {playerMode === "card" && (
        <aside
          ref={cardRef}
          className="fixed inset-0 z-50 w-full h-full rounded-none bg-[#070e1e]/98 backdrop-blur-3xl border-none p-5 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] shadow-2xl flex flex-col justify-between overflow-y-auto select-none animate-slide-up md:fixed md:bottom-5 md:right-5 md:top-auto md:left-auto md:w-80 md:h-auto md:max-h-[calc(100vh-6rem)] md:rounded-2xl md:border md:border-white/20 md:p-3.5 md:gap-2.5 md:shadow-[0_16px_50px_rgba(0,0,0,0.85)] md:overflow-hidden"
          aria-label="Now Playing Card"
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-1 flex-shrink-0">
            {/* Mobile Downward Chevron Minimize Button */}
            <button
              onClick={() => {
                if (lyricsMode === "mini") {
                  setLyricsMode("hidden");
                }
                setPlayerMode("bar");
              }}
              className="md:hidden p-1.5 -ml-1.5 rounded-full text-outline hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Minimize player"
              aria-label="Minimize"
            >
              <span className="material-symbols-outlined text-[30px]">keyboard_arrow_down</span>
            </button>

            <div className="flex flex-col items-center md:items-start flex-1 min-w-0 mx-2">
              <div className="flex items-center gap-1.5 text-primary font-mono text-[10px] md:text-[11px] font-bold uppercase tracking-wider">
                <span className="material-symbols-outlined text-[14px] animate-pulse">graphic_eq</span>
                <span>{lyricsMode === "mini" ? "Synchronized Lyrics" : "Now Playing"}</span>
              </div>
              <span className="text-[11px] text-outline truncate max-w-[200px] md:hidden">
                {currentTrack.album || currentTrack.artist}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  if (lyricsMode === "mini") {
                    setPlayerMode("bar");
                    setLyricsMode("full");
                  } else {
                    setPlayerMode("bar");
                  }
                }}
                className="hidden md:flex p-1 rounded-full text-outline hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title={lyricsMode === "mini" ? "Expand to full-width lyrics" : "Expand to bottom bar"}
                aria-label="Expand to bottom bar"
              >
                <span className="material-symbols-outlined text-[17px]">open_in_full</span>
              </button>
              <button
                onClick={() => {
                  if (lyricsMode === "mini") {
                    setLyricsMode("hidden");
                  } else {
                    setPlayerMode("bar");
                  }
                }}
                className="p-1.5 rounded-full text-outline hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Minimize player"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[22px] md:text-[17px]">close</span>
              </button>
            </div>
          </div>

          {/* Photo or Mini Synchronized Lyrics View */}
          {lyricsMode === "mini" ? (
            <div className="flex-1 min-h-0 my-2">
              <MiniLyricsView />
            </div>
          ) : (
            <div className="relative aspect-square w-full max-w-[320px] sm:max-w-[340px] mx-auto md:max-w-none md:max-h-48 md:aspect-[4/3] rounded-2xl md:rounded-xl overflow-hidden bg-surface-container-highest shadow-2xl border border-white/10 group my-auto flex-shrink-0">
              <img
                alt={currentTrack.title}
                src={currentTrack.coverUrl}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              {/* Top Right Badge on Photo */}
              <div className="absolute top-2.5 right-2.5 px-2.5 py-1 md:px-2 md:py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-tertiary text-[10px] md:text-[9px] font-extrabold tracking-wider uppercase flex items-center gap-1 shadow-md">
                <span className="material-symbols-outlined text-[13px] md:text-[12px]">album</span>
                <span>{currentTrack.badge || "LOSSLESS"}</span>
              </div>

              {/* Hover Center Play/Pause Button */}
              <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  onClick={togglePlay}
                  className="w-14 h-14 md:w-12 md:h-12 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center shadow-[0_0_20px_rgba(76,215,246,0.8)] hover:scale-110 active:scale-95 transition-all"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  <span className="material-symbols-outlined text-[32px] md:text-[28px]">
                    {isPlaying ? "pause" : "play_arrow"}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Track Details */}
          <div className="flex items-center justify-between gap-3 min-w-0 my-2 md:my-0 flex-shrink-0">
            <div className="flex flex-col min-w-0 flex-1">
              <h3 className="text-xl md:text-sm font-bold text-white truncate hover:text-primary transition-colors">
                {currentTrack.title}
              </h3>
              <p className="text-sm md:text-[11px] text-on-surface-variant truncate mt-0.5">
                {currentTrack.artist}
              </p>
            </div>

            <button
              onClick={() => toggleLike(currentTrack)}
              className={`p-2 md:p-1.5 rounded-full hover:bg-surface-container transition-colors flex-shrink-0 ${
                isLiked(currentTrack.id) ? "text-primary" : "text-outline hover:text-white"
              }`}
              title={isLiked(currentTrack.id) ? "Remove from favorites" : "Add to favorites"}
            >
              <span
                className="material-symbols-outlined text-[26px] md:text-[20px]"
                style={{
                  fontVariationSettings: isLiked(currentTrack.id) ? "'FILL' 1" : "'FILL' 0",
                }}
              >
                {isLiked(currentTrack.id) ? "favorite" : "favorite_border"}
              </span>
            </button>
          </div>

          {/* Timeline Scrubber */}
          <div className="flex items-center gap-2.5 md:gap-2 w-full flex-shrink-0">
            <span className="text-xs md:text-[10px] text-outline font-mono w-8 md:w-6 select-none text-right">
              {formatTime(currentTime)}
            </span>
            <div
              ref={cardProgressBarRef}
              onClick={handleCardSeekClick}
              className="relative flex-1 h-1.5 md:h-1 bg-surface-container-high rounded-full cursor-pointer group hover:h-2 md:hover:h-1.5 transition-all"
            >
              <div
                className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-cyan-400 to-primary rounded-full transition-all duration-100"
                style={{ width: `${progressPercent}%` }}
              />
              <div
                className="w-3.5 h-3.5 md:w-2.5 md:h-2.5 bg-white rounded-full absolute top-1/2 -translate-y-1/2 opacity-100 md:opacity-0 md:group-hover:opacity-100 shadow-[0_0_8px_rgba(255,255,255,0.9)] transition-opacity"
                style={{ left: `calc(${progressPercent}% - 7px)` }}
              />
            </div>
            <span className="text-xs md:text-[10px] text-outline font-mono w-8 md:w-6 select-none">
              {formatTime(duration)}
            </span>
          </div>

          {/* Main Playback Controls (Image 5 style) */}
          <div className="flex items-center justify-between px-2 md:px-1 py-1 flex-shrink-0">
            <button
              onClick={() => setIsShuffle(!isShuffle)}
              className={`p-2 md:p-1 rounded-full hover:bg-surface-container transition-colors ${
                isShuffle ? "text-primary" : "text-outline hover:text-white"
              }`}
              title={`Shuffle: ${isShuffle ? "On" : "Off"}`}
            >
              <span className="material-symbols-outlined text-[22px] md:text-[18px]">shuffle</span>
            </button>

            <button
              onClick={handlePrevTrack}
              className="text-on-surface hover:text-primary transition-colors p-2 md:p-1 rounded-full hover:bg-surface-container active:scale-90"
              title="Previous track"
            >
              <span className="material-symbols-outlined text-[28px] md:text-[22px]">skip_previous</span>
            </button>

            <button
              onClick={togglePlay}
              className={`w-14 h-14 md:w-10 md:h-10 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_0_24px_rgba(76,215,246,0.6)] ${
                isBuffering ? "ring-2 ring-cyan-300 animate-pulse" : ""
              }`}
              title={isBuffering ? "Buffering..." : isPlaying ? "Pause" : "Play"}
            >
              <span
                className={`material-symbols-outlined text-[32px] md:text-[24px] ${
                  isBuffering ? "animate-spin text-[24px]" : ""
                }`}
              >
                {isBuffering ? "progress_activity" : isPlaying ? "pause" : "play_arrow"}
              </span>
            </button>

            <button
              onClick={handleNextTrack}
              className="text-on-surface hover:text-primary transition-colors p-2 md:p-1 rounded-full hover:bg-surface-container active:scale-90"
              title="Next track"
            >
              <span className="material-symbols-outlined text-[28px] md:text-[22px]">skip_next</span>
            </button>

            <button
              onClick={cycleRepeat}
              className={`p-2 md:p-1 rounded-full hover:bg-surface-container transition-colors ${
                repeatMode !== "off" ? "text-primary" : "text-outline hover:text-white"
              }`}
              title={`Repeat: ${repeatMode}`}
            >
              <span className="material-symbols-outlined text-[22px] md:text-[18px]">
                {repeatMode === "one" ? "repeat_one" : "repeat"}
              </span>
            </button>

            {/* Autoplay / Infinite Smart Queue Toggle */}
            <button
              onClick={toggleAutoplay}
              className={`p-2 md:p-1 rounded-full hover:bg-surface-container transition-colors relative group ${
                isAutoplayEnabled ? "text-primary" : "text-outline hover:text-white"
              }`}
              title={`Autoplay: ${isAutoplayEnabled ? "On (Infinite Smart Queue)" : "Off"}`}
              aria-label="Toggle Autoplay"
            >
              <InfinityIcon
                size={22}
                className={`transition-transform duration-200 group-hover:scale-110 ${
                  isAutoplayLoading ? "animate-pulse" : ""
                }`}
              />
              {isAutoplayEnabled && (
                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_6px_rgba(76,215,246,0.9)]" />
              )}
            </button>
          </div>

          {/* Bottom Settings / Action Row */}
          <div className="flex items-center justify-between pt-2 border-t border-white/10 flex-shrink-0">
            <div className="flex items-center gap-2 md:gap-1">
              <button
                onClick={() => setLyricsMode(lyricsMode === "mini" ? "hidden" : "mini")}
                className={`p-2 md:p-1 rounded-full hover:bg-surface-container transition-colors ${
                  lyricsMode === "mini" ? "text-primary bg-surface-container" : "text-outline hover:text-white"
                }`}
                title={lyricsMode === "mini" ? "Show Album Artwork" : "Show Synchronized Lyrics"}
              >
                <span className="material-symbols-outlined text-[20px] md:text-[16px]">lyrics</span>
              </button>
              <button
                onClick={() => setIsQueueOpen(!isQueueOpen)}
                className={`p-2 md:p-1 rounded-full hover:bg-surface-container transition-colors ${
                  isQueueOpen ? "text-primary bg-surface-container" : "text-outline hover:text-white"
                }`}
                title="Queue"
              >
                <span className="material-symbols-outlined text-[20px] md:text-[16px]">queue_music</span>
              </button>
              <DownloadButton track={currentTrack} buttonSize="p-1.5 md:p-0.5" iconSize="text-[18px] md:text-[14px]" />
            </div>

            {/* Volume Bar */}
            <div className="flex items-center gap-2 md:gap-1.5">
              <button
                onClick={toggleMute}
                className="text-outline hover:text-white transition-colors p-1 md:p-0.5"
                title={isMuted ? "Unmute" : "Mute"}
              >
                <span className="material-symbols-outlined text-[20px] md:text-[16px]">
                  {isMuted || volume === 0
                    ? "volume_off"
                    : volume < 0.4
                      ? "volume_down"
                      : "volume_up"}
                </span>
              </button>
              <div
                ref={cardVolumeBarRef}
                onClick={handleCardVolumeClick}
                className="w-20 md:w-16 h-1.5 md:h-1 bg-surface-container-high rounded-full relative cursor-pointer group hover:h-2 md:hover:h-1.5 transition-all"
              >
                <div
                  className="absolute left-0 top-0 bottom-0 bg-primary rounded-full transition-all duration-100"
                  style={{ width: `${isMuted ? 0 : volume * 100}%` }}
                />
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* 2. DOCKED MOBILE BOTTOM MINI-PLAYER (Image 3 style: edge-to-edge flush with sides, resized height) */}
      {playerMode !== "card" && currentTrack && (
        <aside
          onClick={() => setPlayerMode("card")}
          className="fixed bottom-[calc(64px+env(safe-area-inset-bottom,0px))] inset-x-0 z-40 w-full h-[74px] bg-[#091224]/95 backdrop-blur-2xl border-t border-b border-white/10 px-4 py-2.5 flex items-center justify-between md:hidden select-none cursor-pointer overflow-hidden animate-slide-up group shadow-xl"
          role="region"
          aria-label="Mobile Mini Player"
        >
          {/* Top Progress Line */}
          <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-white/10">
            <div
              className="h-full bg-primary transition-all duration-100"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Left: Animated Sound Bars + Artwork + Title & Artist */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
            {/* Animated Equalizer Sound Bars (Image 3) */}
            <div
              className="flex items-end gap-[2.5px] h-5 px-0.5 flex-shrink-0"
              title={isPlaying ? "Playing audio" : "Paused"}
            >
              <span
                className={`w-[2.5px] rounded-full bg-primary transition-all duration-300 ${
                  isPlaying ? "animate-sound-bar-1" : "h-1 opacity-40"
                }`}
              />
              <span
                className={`w-[2.5px] rounded-full bg-primary transition-all duration-300 ${
                  isPlaying ? "animate-sound-bar-2" : "h-2.5 opacity-40"
                }`}
              />
              <span
                className={`w-[2.5px] rounded-full bg-primary transition-all duration-300 ${
                  isPlaying ? "animate-sound-bar-3" : "h-4 opacity-40"
                }`}
              />
              <span
                className={`w-[2.5px] rounded-full bg-primary transition-all duration-300 ${
                  isPlaying ? "animate-sound-bar-4" : "h-2.5 opacity-40"
                }`}
              />
              <span
                className={`w-[2.5px] rounded-full bg-primary transition-all duration-300 ${
                  isPlaying ? "animate-sound-bar-5" : "h-1 opacity-40"
                }`}
              />
            </div>

            {/* Thumbnail Photo */}
            <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-surface-container flex-shrink-0 shadow-md border border-white/10 group-hover:scale-105 transition-transform">
              <img
                alt={currentTrack.title}
                src={currentTrack.coverUrl}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Song Title & Artist */}
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-primary transition-colors">
                {currentTrack.title}
              </span>
              <span className="text-[10px] sm:text-[11px] text-on-surface-variant truncate mt-0.5 flex items-center gap-1.5">
                <span className="truncate">{currentTrack.artist}</span>
                <span className="text-[7.5px] px-1 py-0.2 rounded bg-primary/15 text-primary font-mono font-bold flex-shrink-0">
                  {currentTrack.badge || "FLAC"}
                </span>
              </span>
            </div>
          </div>

          {/* Right Side: Play/Pause button + Next Track button (Image 5 elements, NO expand button!) */}
          <div
            className="flex items-center gap-2 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={togglePlay}
              className={`w-10 h-10 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center hover:scale-105 active:scale-90 transition-all shadow-[0_0_14px_rgba(76,215,246,0.55)] ${
                isBuffering ? "ring-2 ring-cyan-300 animate-pulse" : ""
              }`}
              title={isBuffering ? "Buffering..." : isPlaying ? "Pause" : "Play"}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              <span className="material-symbols-outlined text-[22px]">
                {isBuffering ? "progress_activity" : isPlaying ? "pause" : "play_arrow"}
              </span>
            </button>

            {/* Next Track Button (from Image 5) */}
            <button
              type="button"
              onClick={handleNextTrack}
              className="p-2 text-on-surface hover:text-primary transition-colors rounded-full hover:bg-surface-container active:scale-90 cursor-pointer"
              title="Next track"
              aria-label="Next track"
            >
              <span className="material-symbols-outlined text-[26px]">skip_next</span>
            </button>
          </div>
        </aside>
      )}

      {/* 3. DESKTOP FLOATING MINI-PLAYER WIDGET (Image 2 & 4, md:flex only) */}
      {playerMode === "mini" && (
        <aside
          className="hidden md:flex fixed bottom-6 right-6 z-50 w-80 h-16 rounded-2xl bg-surface-container-lowest/95 backdrop-blur-2xl border border-white/20 px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.7)] items-center justify-between select-none transition-all duration-300 ease-in-out hover:border-primary/40 group overflow-hidden"
          aria-label="Mini Player"
        >
          {/* Left Side: Click opens the Big Photo Card */}
          <div
            onClick={() => setPlayerMode("card")}
            className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer pr-2"
            title="Click to open big photo card"
          >
            {/* Animated Equalizer Sound Bars */}
            <div
              className="flex items-end gap-[3px] h-6 px-1 flex-shrink-0"
              title={isPlaying ? "Playing audio" : "Paused"}
            >
              <span
                className={`w-[3px] rounded-full bg-primary transition-all duration-300 ${
                  isPlaying ? "animate-sound-bar-1" : "h-1.5 opacity-40"
                }`}
              />
              <span
                className={`w-[3px] rounded-full bg-primary transition-all duration-300 ${
                  isPlaying ? "animate-sound-bar-2" : "h-3.5 opacity-40"
                }`}
              />
              <span
                className={`w-[3px] rounded-full bg-primary transition-all duration-300 ${
                  isPlaying ? "animate-sound-bar-3" : "h-5 opacity-40"
                }`}
              />
              <span
                className={`w-[3px] rounded-full bg-primary transition-all duration-300 ${
                  isPlaying ? "animate-sound-bar-4" : "h-3 opacity-40"
                }`}
              />
              <span
                className={`w-[3px] rounded-full bg-primary transition-all duration-300 ${
                  isPlaying ? "animate-sound-bar-5" : "h-1.5 opacity-40"
                }`}
              />
            </div>

            {/* Thumbnail Photo */}
            <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-surface-container flex-shrink-0 shadow-md border border-white/10 group-hover:scale-105 transition-transform ml-1">
              <img
                alt={currentTrack.title}
                src={currentTrack.coverUrl}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Song Title & Artist */}
            <div className="flex flex-col min-w-0 flex-1 px-1">
              <span className="text-xs sm:text-sm font-semibold text-white truncate group-hover:text-primary transition-colors">
                {currentTrack.title}
              </span>
              <span className="text-[11px] text-on-surface-variant truncate mt-0.5">
                {currentTrack.artist}
              </span>
            </div>
          </div>

          {/* Right Side: Play/Pause button + Stretch icon */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className={`w-8 h-8 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-[0_0_12px_rgba(76,215,246,0.4)] ${
                isBuffering ? "ring-2 ring-cyan-300 animate-pulse" : ""
              }`}
              title={isPlaying ? "Pause" : "Play"}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              <span className="material-symbols-outlined text-[18px]">
                {isBuffering ? "progress_activity" : isPlaying ? "pause" : "play_arrow"}
              </span>
            </button>

            {/* Stretch Icon (Click to restore previous stretched full player bar) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPlayerMode("bar");
              }}
              className="p-1 text-outline hover:text-white hover:bg-white/10 rounded-full transition-colors flex-shrink-0 ml-0.5 cursor-pointer"
              title="Restore full player bar"
              aria-label="Restore full player bar"
            >
              <span className="material-symbols-outlined text-[18px]">open_in_full</span>
            </button>
          </div>

          {/* Bottom edge mini progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
            <div
              className="h-full bg-primary transition-all duration-100"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </aside>
      )}

      {/* 3b. FULL-LENGTH BOTTOM PLAYER BAR (Desktop Default View md:flex) */}
      {playerMode === "bar" && (
        <footer className="hidden md:flex fixed bottom-0 left-0 right-0 h-24 bg-surface-container-lowest/95 backdrop-blur-2xl border-t border-white/10 px-4 md:px-6 z-50 items-center justify-between shadow-[0_-10px_30px_rgba(0,0,0,0.5)] select-none animate-slide-up">
          {/* Left: Track Details */}
          <div className="flex items-center gap-3 md:gap-4 w-48 sm:w-64 md:w-80 min-w-0">
            <div
              onClick={() => setPlayerMode("card")}
              className="relative w-12 h-12 md:w-14 md:h-14 rounded-xl overflow-hidden bg-surface-container flex-shrink-0 flex items-center justify-center shadow-lg border border-white/10 group cursor-pointer"
              title="Click for Big Photo Card View"
            >
              <img
                alt={currentTrack.title}
                src={currentTrack.coverUrl}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-[20px]">
                  aspect_ratio
                </span>
              </div>
            </div>

            <div className="flex flex-col min-w-0">
              <span
                onClick={() => setPlayerMode("card")}
                className="text-xs md:text-sm font-semibold text-white truncate hover:text-primary transition-colors cursor-pointer"
                title="Click to view card"
              >
                {currentTrack.title}
              </span>
              <span className="text-[11px] md:text-xs text-on-surface-variant truncate hover:underline cursor-pointer mt-0.5">
                {currentTrack.artist}
              </span>
            </div>

            <button
              onClick={() => toggleLike(currentTrack)}
              className={`flex-shrink-0 p-1.5 md:p-2 rounded-full hover:bg-surface-container ml-1 transition-colors ${isLiked(currentTrack.id)
                  ? "text-primary hover:text-cyan-300"
                  : "text-outline hover:text-primary"
                }`}
              title={isLiked(currentTrack.id) ? "Remove from favorites" : "Add to favorites"}
            >
              <span
                className="material-symbols-outlined text-[20px] md:text-[22px]"
                style={{
                  fontVariationSettings: isLiked(currentTrack.id) ? "'FILL' 1" : "'FILL' 0",
                }}
              >
                {isLiked(currentTrack.id) ? "favorite" : "favorite_border"}
              </span>
            </button>
          </div>

          {/* Center: Playback Controls & Timeline Scrubber */}
          <div className="flex flex-col items-center gap-1.5 md:gap-2 max-w-xl lg:max-w-2xl w-full px-2 md:px-4">
            <div className="flex items-center gap-3 sm:gap-6">
              <button
                onClick={() => setIsShuffle(!isShuffle)}
                className={`p-1.5 rounded-full hover:bg-surface-container transition-colors ${isShuffle ? "text-primary" : "text-outline hover:text-primary"
                  }`}
                title={`Shuffle: ${isShuffle ? "On" : "Off"}`}
              >
                <span className="material-symbols-outlined text-[18px] md:text-[20px]">shuffle</span>
              </button>

              <button
                onClick={handlePrevTrack}
                className="text-on-surface hover:text-primary transition-colors p-1.5 rounded-full hover:bg-surface-container"
                title="Previous track"
              >
                <span className="material-symbols-outlined text-[20px] md:text-[24px]">skip_previous</span>
              </button>

              <button
                onClick={togglePlay}
                className={`w-10 h-10 md:w-11 md:h-11 rounded-full bg-primary text-surface-container-lowest flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_0_22px_rgba(76,215,246,0.6)] ${isBuffering ? "ring-2 ring-cyan-300 animate-pulse" : ""
                  }`}
                title={isBuffering ? "Buffering..." : isPlaying ? "Pause" : "Play"}
              >
                <span
                  className={`material-symbols-outlined text-[24px] md:text-[28px] ${isBuffering ? "animate-spin text-[20px]" : ""
                    }`}
                >
                  {isBuffering ? "progress_activity" : isPlaying ? "pause" : "play_arrow"}
                </span>
              </button>

              <button
                onClick={handleNextTrack}
                className="text-on-surface hover:text-primary transition-colors p-1.5 rounded-full hover:bg-surface-container"
                title="Next track"
              >
                <span className="material-symbols-outlined text-[20px] md:text-[24px]">skip_next</span>
              </button>

              <button
                onClick={cycleRepeat}
                className={`p-1.5 rounded-full hover:bg-surface-container transition-colors relative ${repeatMode !== "off" ? "text-primary" : "text-outline hover:text-primary"
                  }`}
                title={`Repeat: ${repeatMode}`}
              >
                <span className="material-symbols-outlined text-[18px] md:text-[20px]">
                  {repeatMode === "one" ? "repeat_one" : "repeat"}
                </span>
              </button>

              {/* Autoplay / Infinite Smart Queue Toggle */}
              <button
                onClick={toggleAutoplay}
                className={`p-1.5 rounded-full hover:bg-surface-container transition-colors relative group ${isAutoplayEnabled ? "text-primary" : "text-outline hover:text-primary"
                  }`}
                title={`Autoplay: ${isAutoplayEnabled ? "On (Infinite Smart Queue)" : "Off"}`}
                aria-label="Toggle Autoplay"
              >
                <InfinityIcon
                  size={19}
                  className={`transition-transform duration-200 group-hover:scale-110 ${isAutoplayLoading ? "animate-pulse" : ""
                    }`}
                />
                {isAutoplayEnabled && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full shadow-[0_0_6px_rgba(76,215,246,0.9)]" />
                )}
              </button>
            </div>

            {/* Progress Bar with timestamps */}
            <div className="flex items-center gap-2 md:gap-3 w-full max-w-lg">
              <span className="text-[10px] md:text-xs text-outline font-mono w-8 md:w-9 text-right font-medium select-none">
                {formatTime(currentTime)}
              </span>

              <div
                ref={progressBarRef}
                onClick={handleSeekClick}
                className="relative flex-1 h-1 md:h-1.5 bg-surface-container-high rounded-full cursor-pointer group hover:h-2 transition-all"
              >
                <div
                  className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-cyan-400 to-primary rounded-full transition-all duration-100"
                  style={{ width: `${progressPercent}%` }}
                />
                <div
                  className="w-3 md:w-3.5 h-3 md:h-3.5 bg-white rounded-full absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 shadow-[0_0_10px_rgba(255,255,255,0.9)] transition-opacity"
                  style={{ left: `calc(${progressPercent}% - 6px)` }}
                />
              </div>

              <span className="text-[10px] md:text-xs text-outline font-mono w-8 md:w-9 font-medium select-none">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Right: Lyrics, Queue, Device & Volume Controls + Edge 'X' Button (Image 1 fix) */}
          <div className="flex items-center justify-end gap-1.5 md:gap-2.5 w-48 sm:w-64 md:w-80 min-w-0">
            <button
              onClick={() => setLyricsMode(lyricsMode === "full" ? "hidden" : "full")}
              className={`p-1.5 md:p-2 rounded-full hover:bg-surface-container transition-colors ${lyricsMode === "full" ? "text-primary bg-surface-container" : "text-outline hover:text-white"
                }`}
              title="Lyrics (Full-Width View)"
            >
              <span className="material-symbols-outlined text-[18px] md:text-[20px]">lyrics</span>
            </button>

            <button
              onClick={() => {
                if (lyricsMode === "full") {
                  minimizeLyricsToCard();
                  setIsQueueOpen(false);
                } else {
                  setIsQueueOpen(!isQueueOpen);
                }
              }}
              className={`p-1.5 md:p-2 rounded-full hover:bg-surface-container transition-colors ${isQueueOpen ? "text-primary bg-surface-container" : "text-outline hover:text-white"
                }`}
              title="Up Next Queue"
            >
              <span className="material-symbols-outlined text-[18px] md:text-[20px]">queue_music</span>
            </button>

            {/* Floating Mini Player Button (replaces casting per user request) */}
            <button
              onClick={() => setPlayerMode("mini")}
              className="hidden sm:flex text-outline hover:text-primary transition-colors p-1.5 md:p-2 rounded-full hover:bg-surface-container cursor-pointer"
              title="open floating mini player"
              aria-label="open floating mini player"
            >
              <span className="material-symbols-outlined text-[18px] md:text-[20px]">
                picture_in_picture_alt
              </span>
            </button>

            {/* Volume Slider */}
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-white/10">
              <button
                onClick={toggleMute}
                className="text-outline hover:text-white transition-colors p-1"
                title={isMuted ? "Unmute" : "Mute"}
              >
                <span className="material-symbols-outlined text-[18px] md:text-[20px]">
                  {isMuted || volume === 0
                    ? "volume_off"
                    : volume < 0.4
                      ? "volume_down"
                      : "volume_up"}
                </span>
              </button>

              <div
                ref={volumeBarRef}
                onClick={handleVolumeClick}
                className="w-16 md:w-24 h-1 md:h-1.5 bg-surface-container-high rounded-full relative cursor-pointer group hover:h-2 transition-all"
              >
                <div
                  className="absolute left-0 top-0 bottom-0 bg-primary rounded-full transition-all duration-100"
                  style={{ width: `${isMuted ? 0 : volume * 100}%` }}
                />
                <div
                  className="w-2.5 md:w-3 h-2.5 md:h-3 bg-white rounded-full absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 shadow-[0_0_8px_rgba(255,255,255,0.9)] transition-opacity"
                  style={{ left: `calc(${isMuted ? 0 : volume * 100}% - 5px)` }}
                />
              </div>
            </div>

            {/* Card View Switch Button */}
            <button
              onClick={() => setPlayerMode("card")}
              className="p-1.5 md:p-2 rounded-full hover:bg-surface-container text-outline hover:text-white transition-colors hidden md:flex"
              title="Big Photo Card View"
              aria-label="Big Photo Card View"
            >
              <span className="material-symbols-outlined text-[18px] md:text-[20px]">aspect_ratio</span>
            </button>

            {/* Minimize 'X' Button right at the edge of the right side (Image 1 fix) */}
            <div className="pl-1 md:pl-2 border-l border-white/10">
              <button
                onClick={() => {
                  if (lyricsMode === "full") {
                    minimizeLyricsToCard();
                  } else {
                    setPlayerMode("mini");
                  }
                }}
                className="p-1.5 md:p-2 rounded-full hover:bg-surface-container text-outline hover:text-white transition-colors flex items-center justify-center group"
                title="Minimize player"
                aria-label="Minimize player"
              >
                <span className="material-symbols-outlined text-[18px] md:text-[20px] group-hover:scale-110 transition-transform">
                  close
                </span>
              </button>
            </div>
          </div>
        </footer>
      )}
    </>
  );
}
