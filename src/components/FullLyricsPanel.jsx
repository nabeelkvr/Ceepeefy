"use client";

import React from "react";
import { useMusic } from "../context/MusicContext";
import { useSynchronizedLyrics } from "../hooks/useSynchronizedLyrics";

export default function FullLyricsPanel() {
  const {
    currentTrack,
    currentTime,
    seekTo,
    isPlaying,
    lyricsMode,
    setLyricsMode,
    syncedLyrics,
    isLoadingLyrics,
    lyricsError,
  } = useMusic();

  const {
    activeLineIndex,
    containerRef,
    lineRefs,
    handleUserScroll,
    handleLineClick,
  } = useSynchronizedLyrics(syncedLyrics, currentTime, seekTo);

  if (lyricsMode !== "full" || !currentTrack) return null;

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col bg-gradient-to-b from-[#091122]/95 via-[#060c19]/98 to-[#03070f] backdrop-blur-3xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden select-none border-l border-white/5"
      style={{
        backgroundImage: currentTrack.coverUrl
          ? `radial-gradient(ellipse 70% 50% at 20% 25%, rgba(76,215,246,0.12), transparent 70%), radial-gradient(ellipse 50% 60% at 85% 80%, rgba(168,85,247,0.08), transparent 80%)`
          : undefined,
      }}
    >
      {/* Ambient Blurred Artwork Glow */}
      {currentTrack.coverUrl && (
        <div
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-20 blur-[100px] pointer-events-none"
          style={{
            backgroundImage: `url(${currentTrack.coverUrl})`,
            backgroundSize: "cover",
          }}
        />
      )}

      {/* Header Bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-surface-container-lowest/40 backdrop-blur-md z-10 flex-shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <div className="relative w-11 h-11 rounded-xl overflow-hidden shadow-lg border border-white/10 flex-shrink-0">
            <img
              src={currentTrack.coverUrl}
              alt={currentTrack.title}
              className="w-full h-full object-cover"
            />
            {isPlaying && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[18px] animate-pulse">
                  graphic_eq
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base md:text-lg font-extrabold text-white truncate">
                {currentTrack.title}
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 text-[10px] font-mono font-bold tracking-wider uppercase">
                Synced Lyrics
              </span>
            </div>
            <p className="text-xs text-on-surface-variant truncate">
              {currentTrack.artist} • {currentTrack.album || "Single"}
            </p>
          </div>
        </div>

        {/* View Switchers & Close Controls */}
        <div className="flex items-center gap-2">
          {/* Switch to Mini Card Mode */}
          <button
            onClick={() => setLyricsMode("mini")}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-white/10 text-xs font-medium text-outline hover:text-white transition-all shadow-sm"
            title="Switch to Mini-Player view"
          >
            <span className="material-symbols-outlined text-[16px]">picture_in_picture_alt</span>
            <span>Mini View</span>
          </button>

          {/* Close Panel Button */}
          <button
            onClick={() => setLyricsMode("hidden")}
            className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high border border-white/10 flex items-center justify-center text-outline hover:text-white transition-colors"
            title="Close lyrics view"
            aria-label="Close lyrics"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      </header>

      {/* Main Panel Content: Two-Column / Split Layout on large screens */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative z-10">
        {/* Left Side: Track Hero Card (Visible on md+ screens) */}
        <div className="hidden md:flex flex-col justify-between w-80 lg:w-96 p-8 border-r border-white/5 bg-black/20 flex-shrink-0">
          <div className="flex flex-col gap-6">
            <div className="relative aspect-square w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 group">
              <img
                src={currentTrack.coverUrl}
                alt={currentTrack.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-primary text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[13px] animate-pulse">
                  graphic_eq
                </span>
                {isPlaying ? "Live" : "Paused"}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <h3 className="text-2xl font-black text-white tracking-tight leading-tight">
                {currentTrack.title}
              </h3>
              <p className="text-sm font-semibold text-primary">
                {currentTrack.artist}
              </p>
              <p className="text-xs text-on-surface-variant font-medium">
                {currentTrack.album} {currentTrack.year ? `• ${currentTrack.year}` : ""}
              </p>
            </div>
          </div>

          {/* Metadata Badges */}
          <div className="flex flex-col gap-2 pt-6 border-t border-white/10 font-mono text-[11px] text-outline">
            <div className="flex items-center justify-between">
              <span>Synchronized:</span>
              <span className="text-primary font-bold">LRCLIB / JioSaavn</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Audio Quality:</span>
              <span className="text-white">Studio 320kbps Lossless</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Interactive:</span>
              <span className="text-white">Click any line to jump</span>
            </div>
          </div>
        </div>

        {/* Right Side: Scrollable Synchronized Lyrics Stream */}
        <div
          ref={containerRef}
          onScroll={handleUserScroll}
          className="flex-1 overflow-y-auto px-6 md:px-12 lg:px-16 py-12 md:py-20 scroll-smooth space-y-6 md:space-y-8"
        >
          {isLoadingLyrics ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 py-24 text-center">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-outline font-mono animate-pulse">
                Fetching synchronized lyrics for {currentTrack.title}...
              </p>
            </div>
          ) : syncedLyrics.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 py-24 text-center">
              <span className="material-symbols-outlined text-4xl text-outline/60">
                music_off
              </span>
              <h4 className="text-lg font-bold text-white">No Synced Lyrics Available</h4>
              <p className="text-sm text-outline max-w-sm">
                Synchronized vocal timestamps are not recorded for this track. Enjoy the instrumental audio playback!
              </p>
            </div>
          ) : (
            syncedLyrics.map((line, idx) => {
              const isActive = idx === activeLineIndex;
              const isPassed = activeLineIndex >= 0 && idx < activeLineIndex;

              return (
                <div
                  key={`${line.time}-${idx}`}
                  ref={(el) => (lineRefs.current[idx] = el)}
                  onClick={() => handleLineClick(line.time)}
                  className={`cursor-pointer transition-all duration-300 origin-left select-none group ${isActive
                      ? "font-extrabold text-white scale-105 drop-shadow-[0_0_24px_rgba(76,215,246,0.4)] text-primary"
                      : isPassed
                        ? "font-semibold text-white/45 hover:text-white/80"
                        : "font-semibold text-white/30 hover:text-white/70"
                    }`}
                >
                  <p
                    className={`leading-relaxed tracking-tight ${isActive
                        ? "text-2xl sm:text-3xl lg:text-4xl text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-white to-primary font-black"
                        : "text-lg sm:text-2xl lg:text-3xl"
                      }`}
                  >
                    {line.text}
                  </p>
                </div>
              );
            })
          )}
          {/* Padding bottom spacer so last lines can be vertically centered */}
          <div className="h-40 md:h-64" />
        </div>
      </div>

      {/* Footer Navigation bar */}
      <footer className="px-6 py-2.5 bg-black/40 border-t border-white/10 flex items-center justify-between text-xs text-outline font-mono flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span>Real-time Active Line Tracking Active</span>
        </div>
        <span className="hidden sm:inline">Tap or click any line to seek playback</span>
      </footer>
    </div>
  );
}
